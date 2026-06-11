/**
 * POST /api/chat/rebase
 * Rebase worktree branch onto latest base branch WITHOUT squash/finalize.
 * Keeps the worktree intact for continued work.
 *
 * Conflict handling: same as finalize — returns conflict file list for UI resolution.
 */

import { existsSync } from 'node:fs'
import { logger } from '~/server/utils/logger'
import { resolveExistingBaseBranch } from '~/server/utils/baseBranch'
import { getProjectDir } from '~/server/utils/projectDir'
import { getChatWorktreePath } from '~/server/utils/worktreePaths'
import { validateWorktreePath } from '~/server/utils/validateWorktree'
import { assertSafeBranchName, git } from '~/server/utils/chatGit'
import { autoCommitChanges } from '~/server/utils/claudeService'
import { withLock } from '~/server/utils/asyncLock'
import type { RebaseSyncRequest, FinalizeResponse } from '~/types/chat'

export default defineEventHandler(async (event): Promise<FinalizeResponse> => {
  const body = await readBody<RebaseSyncRequest>(event)

  if (!body?.conversationId) {
    throw createError({
      statusCode: 400,
      message: 'conversationId is required',
    })
  }

  const { conversationId } = body
  const projectDir = getProjectDir()
  const worktreePath = body.worktreePath || getChatWorktreePath(conversationId)

  if (existsSync(worktreePath)) {
    validateWorktreePath(worktreePath)
  }

  let worktreeBranch = ''
  if (existsSync(worktreePath)) {
    try {
      worktreeBranch = await git(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD'])
    } catch {
      worktreeBranch = ''
    }
  }

  const baseBranch = await resolveExistingBaseBranch({
    cwd: projectDir,
    requestedBaseBranch: body.baseBranch,
    worktreeBranch,
  })
  if (!baseBranch) {
    return { success: false, error: 'Unable to resolve a valid base branch for this worktree.' }
  }
  assertSafeBranchName(baseBranch, 'base branch')

  logger.chat.info('Rebasing worktree onto base', { conversationId, baseBranch })

  return withLock(projectDir, async (): Promise<FinalizeResponse> => {
    try {
      // 0. Ensure worktree exists
      if (!existsSync(worktreePath)) {
        return { success: false, error: 'Worktree directory not found. It may have been cleaned up.' }
      }

      // 1. Auto-commit any uncommitted changes
      await autoCommitChanges(worktreePath)

      // 2. Rebase onto latest base branch (no squash)
      try {
        await git(worktreePath, ['rebase', baseBranch])
      } catch {
        // Conflict detected — return conflict file list
        logger.chat.warn('Rebase conflict during sync', { conversationId })

        let conflictFiles: string[] = []
        try {
          const diffOutput = await git(worktreePath, ['diff', '--name-only', '--diff-filter=U'])
          conflictFiles = diffOutput.split('\n').filter(Boolean)
        } catch {
          try {
            const statusOutput = await git(worktreePath, ['status', '--porcelain'])
            conflictFiles = statusOutput
              .split('\n')
              .filter(line => /^(UU|AA|DU|UD|UA|AU|DD)\s/.test(line))
              .map(line => line.substring(3).trim())
          } catch { /* ignore */ }
        }

        return {
          success: false,
          error: `Rebase conflict with "${baseBranch}". Resolve conflicts to continue.`,
          conflictFiles,
          rebaseInProgress: true,
        }
      }

      logger.chat.info('Worktree rebased successfully', { conversationId, baseBranch })

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.chat.error('Rebase sync failed', { conversationId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })
})
