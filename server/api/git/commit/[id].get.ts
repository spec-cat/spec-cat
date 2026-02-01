import type { CommitDetail } from '~/types/git'
import {
  getCommitDetail,
  isGitRepository
} from '~/server/utils/git'
import { getProjectDir } from '~/server/utils/projectDir'

/**
 * GET /api/git/commit/[id]
 *
 * Fetch detailed information about a specific commit including file changes and statistics.
 */
export default defineEventHandler(async (event) => {
  const commitHash = getRouterParam(event, 'id')

  if (!commitHash) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Commit hash is required'
    })
  }

  // Use configured project directory
  const cwd = getProjectDir()
  
  // Validate git repository
  if (!await isGitRepository(cwd)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Not a git repository'
    })
  }

  try {
    // Get detailed commit information
    const commitDetail = await getCommitDetail(commitHash, cwd)
    
    return commitDetail
  } catch (error: any) {
    if (error.message.includes('not found')) {
      throw createError({
        statusCode: 404,
        statusMessage: `Commit ${commitHash} not found`
      })
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch commit details: ${error.message}`
    })
  }
})