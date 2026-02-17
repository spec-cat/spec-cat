/**
 * POST /api/chat/worktree-commit
 * Auto-commit any uncommitted changes in a conversation's worktree.
 * Called automatically after each streaming turn completes.
 */

import { autoCommitChanges } from '~/server/utils/claudeService'
import { logger } from '~/server/utils/logger'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    worktreePath: string
    conversationId?: string
  }>(event)

  if (!body?.worktreePath) {
    throw createError({
      statusCode: 400,
      message: 'worktreePath is required',
    })
  }

  const { worktreePath, conversationId } = body

  try {
    const result = await autoCommitChanges(worktreePath)

    if (result.success) {
      logger.chat.info('Worktree auto-commit done', {
        conversationId,
        message: result.message,
        currentBranch: result.currentBranch,
      })
    }

    return {
      success: result.success,
      message: result.message,
      currentBranch: result.currentBranch,
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
