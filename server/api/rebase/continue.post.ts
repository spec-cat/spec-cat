/**
 * POST /api/rebase/continue
 * After all conflict files are resolved, continue the rebase and complete finalization.
 * Mirrors steps 6-8 of finalize.post.ts.
 */

import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { resolveExistingBaseBranch } from '~/server/utils/baseBranch'
import { assertSafeBranchName, git, localBranchRef } from '~/server/utils/chatGit'
import { validateWorktreePath } from '~/server/utils/validateWorktree'
import { withLock } from '~/server/utils/asyncLock'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'
import { getChatWorktreePath } from '~/server/utils/worktreePaths'
import type { RebaseContinueRequest, FinalizeResponse } from '~/types/chat'

export default defineEventHandler(async (event): Promise<FinalizeResponse> => {
  const body = await readBody<RebaseContinueRequest>(event)

  if (!body?.conversationId || !body?.commitMessage) {
    throw createError({ statusCode: 400, message: 'conversationId and commitMessage are required' })
  }

  const { conversationId } = body
  const projectDir = getProjectDir()
  const branchName = assertSafeBranchName(body.worktreeBranch || `sc/${conversationId}`, 'branch')
  const worktreePath = body.worktreePath || getChatWorktreePath(conversationId)
  const previewBranch = body.previewBranch ? assertSafeBranchName(body.previewBranch, 'preview branch') : undefined

  if (!existsSync(worktreePath)) {
    return { success: false, error: 'Worktree directory not found.' }
  }
  validateWorktreePath(worktreePath)

  const baseBranch = await resolveExistingBaseBranch({
    cwd: projectDir,
    requestedBaseBranch: body.baseBranch,
    worktreeBranch: branchName,
  })
  if (!baseBranch) {
    return { success: false, error: 'Unable to resolve a valid base branch for this worktree.' }
  }
  const baseBranchRef = localBranchRef(baseBranch, 'base branch')

  return withLock(projectDir, async (): Promise<FinalizeResponse> => {
    try {
      if (!existsSync(worktreePath)) {
        return { success: false, error: 'Worktree directory not found.' }
      }

      // Continue the rebase. `-c core.editor=true` accepts the existing commit
      // message without opening an editor (argv-safe equivalent of GIT_EDITOR=true).
      try {
        await git(worktreePath, ['-c', 'core.editor=true', 'rebase', '--continue'])
      } catch (rebaseError) {
        // Check if there are still unresolved conflicts
        let conflictFiles: string[] = []
        try {
          const statusOutput = await git(worktreePath, ['status', '--porcelain'])
          conflictFiles = statusOutput
            .split('\n')
            .filter(line => /^(UU|AA|DU|UD|UA|AU|DD)\s/.test(line))
            .map(line => line.substring(3).trim())
        } catch { /* ignore */ }

        if (conflictFiles.length > 0) {
          return {
            success: false,
            error: 'There are still unresolved conflicts.',
            conflictFiles,
            rebaseInProgress: true,
          }
        }

        // Unknown rebase error
        const msg = rebaseError instanceof Error ? rebaseError.message : String(rebaseError)
        return { success: false, error: `Rebase continue failed: ${msg}` }
      }

      // --- From here, same as finalize.post.ts steps 6-8 ---

      // 6. Checkout baseBranch in main worktree
      try {
        const currentBranch = await git(projectDir, ['rev-parse', '--abbrev-ref', 'HEAD'])
        if (currentBranch !== baseBranch) {
          await git(projectDir, ['switch', baseBranch])
        }
      } catch { /* ignore — main worktree might be in detached HEAD or other state */ }

      // 7. Update base branch ref
      const newHead = await git(worktreePath, ['rev-parse', 'HEAD'])
      await git(projectDir, ['update-ref', baseBranchRef, newHead])

      // 7-1. Sync working directory
      try {
        const mainBranch = await git(projectDir, ['rev-parse', '--abbrev-ref', 'HEAD'])
        if (mainBranch === baseBranch) {
          await git(projectDir, ['reset', '--hard', 'HEAD'])
        }
      } catch { /* skip */ }

      logger.chat.info('Base branch updated after conflict resolution', { baseBranch, newHead })

      // 8. Cleanup worktree + branches
      try {
        await git(projectDir, ['worktree', 'remove', worktreePath, '--force'])
      } catch {
        try {
          await rm(worktreePath, { recursive: true, force: true })
        } catch { /* ignore */ }
      }

      await git(projectDir, ['worktree', 'prune']).catch(() => {})

      try {
        await git(projectDir, ['branch', '-D', branchName])
      } catch {
        logger.chat.warn('Failed to delete temp branch', { branchName })
      }

      if (previewBranch) {
        try {
          await git(projectDir, ['branch', '-D', previewBranch])
        } catch { /* preview branch may not exist */ }
      }

      logger.chat.info('Conversation finalized after conflict resolution', { conversationId, newCommit: newHead })

      return { success: true, newCommit: newHead }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.chat.error('Rebase continue failed', { conversationId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })
})
