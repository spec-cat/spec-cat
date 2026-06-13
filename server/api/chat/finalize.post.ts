/**
 * POST /api/chat/finalize
 * Rebase all worktree commits onto the base branch, squash them into one,
 * update the base branch pointer, then clean up worktree + temp branch.
 *
 * Order matters: we rebase BEFORE squashing so that a rebase conflict leaves
 * the original per-turn commit history intact (the rebase is left in progress
 * for UI resolution). Squashing first would destroy that history on conflict.
 *
 * Conflict handling: leave rebase in progress, return conflict file list, keep worktree.
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { resolveExistingBaseBranch } from '~/server/utils/baseBranch'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'
import { guardServerProviderCapability } from '~/server/utils/aiProviderSelection'
import { getChatWorktreePath } from '~/server/utils/worktreePaths'
import { validateWorktreePath } from '~/server/utils/validateWorktree'
import { assertSafeBranchName, git, localBranchRef } from '~/server/utils/chatGit'
import { autoCommitChanges } from '~/server/utils/claudeService'
import { withLock } from '~/server/utils/asyncLock'
import type { FinalizeRequest, FinalizeResponse } from '~/types/chat'

async function collectConflictFiles(worktreePath: string): Promise<string[]> {
  try {
    const diffOutput = await git(worktreePath, ['diff', '--name-only', '--diff-filter=U'])
    const files = diffOutput.split('\n').filter(Boolean)
    if (files.length > 0) return files
  } catch { /* fall through to status parsing */ }
  try {
    const statusOutput = await git(worktreePath, ['status', '--porcelain'])
    return statusOutput
      .split('\n')
      .filter(line => /^(UU|AA|DU|UD|UA|AU|DD)\s/.test(line))
      .map(line => line.substring(3).trim())
  } catch {
    return []
  }
}

export default defineEventHandler(async (event): Promise<FinalizeResponse> => {
  const body = await readBody<FinalizeRequest>(event)

  if (!body?.conversationId || !body?.commitMessage) {
    throw createError({
      statusCode: 400,
      message: 'conversationId and commitMessage are required',
    })
  }

  const { conversationId, commitMessage } = body
  const providerGuard = await guardServerProviderCapability(
    'autoCommit',
    'Switch to a provider with auto-commit support before finalizing.',
  )
  if ('failure' in providerGuard) {
    return providerGuard.failure
  }

  const projectDir = getProjectDir()
  const branchName = assertSafeBranchName(body.worktreeBranch || `sc/${conversationId}`, 'branch')
  const worktreePath = body.worktreePath || getChatWorktreePath(conversationId)
  const previewBranch = body.previewBranch ? assertSafeBranchName(body.previewBranch, 'preview branch') : undefined

  if (existsSync(worktreePath)) {
    validateWorktreePath(worktreePath)
  }

  logger.chat.info('Finalizing conversation', { conversationId, branchName })

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
      // 0. Ensure worktree exists
      if (!existsSync(worktreePath)) {
        return { success: false, error: 'Worktree directory not found. It may have been cleaned up.' }
      }

      // 1. Auto-commit any uncommitted changes
      await autoCommitChanges(worktreePath)

      // 2. Count commits ahead of base branch
      let commitCount: number
      try {
        const countStr = await git(worktreePath, ['rev-list', '--count', `${baseBranchRef}..HEAD`])
        commitCount = parseInt(countStr, 10)
      } catch {
        return { success: false, error: `Cannot compare with base branch "${baseBranch}". It may not exist.` }
      }

      if (commitCount === 0) {
        return { success: false, error: 'No commits to finalize.' }
      }

      // 3. Rebase onto latest base branch FIRST (before any history rewrite).
      //    On conflict the original commits are still intact and the rebase is
      //    left in progress for the user to resolve via the UI.
      try {
        await git(worktreePath, ['rebase', baseBranchRef])
      } catch {
        logger.chat.warn('Rebase conflict during finalize', { conversationId })
        const conflictFiles = await collectConflictFiles(worktreePath)
        return {
          success: false,
          error: `Rebase conflict with "${baseBranch}". Resolve conflicts to continue.`,
          conflictFiles,
          rebaseInProgress: true,
        }
      }

      // 4. Squash: soft-reset onto base branch tip and commit a single commit.
      //    After the rebase, base branch is the direct ancestor of HEAD.
      await git(worktreePath, ['reset', '--soft', baseBranchRef])
      // Use stdin (-F -) to safely handle messages starting with "-" or special characters
      execSync('git commit -F -', { cwd: worktreePath, input: commitMessage, encoding: 'utf-8' })

      // 5. Always checkout baseBranch in main worktree before update-ref.
      //    If a preview branch is still checked out, update-ref will fail or leave
      //    the working directory in a dirty state. Switching to baseBranch first
      //    ensures a clean slate, and the preview branch can be deleted afterwards.
      try {
        const currentBranch = await git(projectDir, ['rev-parse', '--abbrev-ref', 'HEAD'])
        if (currentBranch !== baseBranch) {
          await git(projectDir, ['switch', baseBranch])
        }
      } catch { /* ignore — main worktree might be in detached HEAD or other state */ }

      // 6. Update base branch ref to point to the squashed+rebased commit
      const newHead = await git(worktreePath, ['rev-parse', 'HEAD'])
      await git(projectDir, ['update-ref', `refs/heads/${baseBranch}`, newHead])

      // 6-1. Sync working directory if main worktree is on baseBranch
      try {
        const mainBranch = await git(projectDir, ['rev-parse', '--abbrev-ref', 'HEAD'])
        if (mainBranch === baseBranch) {
          await git(projectDir, ['reset', '--hard', 'HEAD'])
        }
      } catch { /* detached HEAD or other state — skip */ }

      logger.chat.info('Base branch updated', { baseBranch, newHead })

      // 7. Cleanup: remove worktree and delete temp branch + preview branch
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
        } catch { /* preview branch may not exist — fine */ }
      }

      logger.chat.info('Conversation finalized', { conversationId, newCommit: newHead })

      return {
        success: true,
        newCommit: newHead,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.chat.error('Finalize failed', { conversationId, error: errorMessage })

      return {
        success: false,
        error: errorMessage,
      }
    }
  })
})
