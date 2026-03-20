import type { CommitDetail } from '~/types/git'
import {
  getCommitDetail,
} from '~/server/utils/git'
import { resolveWorkingDirectoryFromQuery, handleGitApiError } from '~/server/utils/gitApiHelpers'

/**
 * GET /api/git/commit/[id]
 *
 * Fetch detailed information about a specific commit including file changes and statistics.
 */
export default defineEventHandler(async (event) => {
  try {
    const commitHash = getRouterParam(event, 'id')

    if (!commitHash) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Commit hash is required'
      })
    }

    const cwd = resolveWorkingDirectoryFromQuery(event)

    try {
      // Get detailed commit information
      const commitDetail = await getCommitDetail(commitHash, cwd)

      return commitDetail
    } catch (innerError: any) {
      if (innerError?.message?.includes('not found')) {
        throw createError({
          statusCode: 404,
          statusMessage: `Commit ${commitHash} not found`
        })
      }
      throw innerError
    }
  } catch (error: any) {
    handleGitApiError(error, 'Error fetching commit details', 'Failed to fetch commit details')
  }
})