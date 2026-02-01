import { execGitArgs, isGitRepositorySync } from '~/server/utils/git'
import { logger } from '~/server/utils/logger'

/**
 * GET /api/chat/compare
 * Compare worktree HEAD against base branch.
 * Returns ahead/behind counts from base..HEAD.
 */
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const worktreePath = query.worktreePath as string | undefined
    const baseBranch = query.baseBranch as string | undefined

    if (!worktreePath || !baseBranch) {
      throw createError({
        statusCode: 400,
        statusMessage: 'worktreePath and baseBranch are required',
      })
    }

    if (!isGitRepositorySync(worktreePath)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Not a Git repository',
      })
    }

    const output = execGitArgs(worktreePath, [
      'rev-list',
      '--left-right',
      '--count',
      `${baseBranch}...HEAD`,
    ])

    const [behindRaw, aheadRaw] = output.trim().split(/\s+/)
    const behind = Number.parseInt(behindRaw || '0', 10) || 0
    const ahead = Number.parseInt(aheadRaw || '0', 10) || 0

    return { ahead, behind }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    logger.api.error('Error comparing worktree against base', { error })
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to compare worktree and base branch',
    })
  }
})