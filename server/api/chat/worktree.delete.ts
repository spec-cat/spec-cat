/**
 * DELETE /api/chat/worktree
 * Removes a chat worktree and its branch.
 * Separate from [name].delete.ts because branch names like sc/conv-xxx
 * contain "/" which breaks route params.
 */

import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'
import { validateWorktreePath } from '~/server/utils/validateWorktree'
import { assertSafeBranchName, git } from '~/server/utils/chatGit'
import { withLock } from '~/server/utils/asyncLock'
import { buildTerminalSessionId, disposeTerminalSession } from '~/server/utils/terminalSessions'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ worktreePath: string; branch: string; conversationId?: string }>(event)

  if (!body?.worktreePath || !body?.branch) {
    throw createError({
      statusCode: 400,
      message: 'worktreePath and branch are required',
    })
  }

  const { worktreePath } = body
  const branch = assertSafeBranchName(body.branch, 'branch')
  const projectDir = getProjectDir()

  // Kill the conversation's interactive PTY before removing the worktree: the
  // CLI's cwd is this directory, so a surviving claude/codex process would both
  // leak and hold the path open against `git worktree remove`.
  if (body.conversationId) {
    disposeTerminalSession(buildTerminalSessionId(body.conversationId))
  }

  // Reject paths outside the managed worktree root before any destructive op.
  // Only validate when the directory still exists — a missing worktree is a
  // no-op cleanup, not an error.
  if (existsSync(worktreePath)) {
    validateWorktreePath(worktreePath)
  }

  logger.chat.info('Deleting chat worktree', { worktreePath, branch })

  return withLock(projectDir, async () => {
    try {
      // Remove worktree
      if (existsSync(worktreePath)) {
        try {
          await git(projectDir, ['worktree', 'remove', worktreePath, '--force'])
        } catch {
          // Fallback: direct removal (path already validated above)
          await rm(worktreePath, { recursive: true, force: true })
        }
      }

      // Prune worktree references
      await git(projectDir, ['worktree', 'prune'])

      // Delete the branch
      try {
        await git(projectDir, ['branch', '-D', branch])
        logger.chat.info('Chat branch deleted', { branch })
      } catch (branchError) {
        logger.chat.warn('Failed to delete chat branch', {
          branch,
          error: branchError instanceof Error ? branchError.message : String(branchError),
        })
      }

      logger.chat.info('Chat worktree deleted', { worktreePath, branch })

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.chat.error('Failed to delete chat worktree', { worktreePath, branch, error: errorMessage })

      return {
        success: false,
        error: errorMessage,
      }
    }
  })
})
