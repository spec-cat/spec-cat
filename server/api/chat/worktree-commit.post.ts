/**
 * POST /api/chat/worktree-commit
 * Auto-commit any uncommitted changes in a conversation's worktree.
 * Called automatically after each streaming turn completes.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { autoCommitChanges } from '~/server/utils/claudeService'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'

const execAsync = promisify(exec)
const PROTECTED_BRANCHES = new Set(['main', 'master', 'develop', 'dev'])

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    worktreePath: string
    conversationId?: string
    previousBranch?: string
  }>(event)

  if (!body?.worktreePath) {
    throw createError({
      statusCode: 400,
      message: 'worktreePath is required',
    })
  }

  const { worktreePath, conversationId, previousBranch } = body

  try {
    const result = await autoCommitChanges(worktreePath)
    let deletedPreviousBranch = false

    if (result.success) {
      const branchChanged = Boolean(
        previousBranch &&
        result.currentBranch &&
        previousBranch !== result.currentBranch,
      )

      if (branchChanged && previousBranch && !PROTECTED_BRANCHES.has(previousBranch)) {
        try {
          await execAsync(`git branch -D "${previousBranch}"`, { cwd: getProjectDir() })
          deletedPreviousBranch = true
          logger.chat.info('Deleted previous worktree branch after branch switch', {
            conversationId,
            previousBranch,
            currentBranch: result.currentBranch,
          })
        } catch (deleteError) {
          logger.chat.warn('Failed to delete previous worktree branch after branch switch', {
            conversationId,
            previousBranch,
            currentBranch: result.currentBranch,
            error: deleteError instanceof Error ? deleteError.message : String(deleteError),
          })
        }
      }

      logger.chat.info('Worktree auto-commit done', {
        conversationId,
        message: result.message,
        currentBranch: result.currentBranch,
        previousBranch,
        deletedPreviousBranch,
      })
    }

    return {
      success: result.success,
      message: result.message,
      currentBranch: result.currentBranch,
      deletedPreviousBranch,
      error: result.error,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.chat.error('Worktree auto-commit failed', {
      conversationId,
      error: errorMessage,
    })

    return { success: false, error: errorMessage }
  }
})
