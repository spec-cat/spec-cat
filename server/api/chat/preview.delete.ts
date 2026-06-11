/**
 * DELETE /api/chat/preview
 * End preview: checkout baseBranch in main worktree, delete preview branch.
 */

import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'
import { assertSafeBranchName, git } from '~/server/utils/chatGit'
import { withLock } from '~/server/utils/asyncLock'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    previewBranch: string
    baseBranch: string
  }>(event)

  if (!body?.previewBranch || !body?.baseBranch) {
    throw createError({
      statusCode: 400,
      message: 'previewBranch and baseBranch are required',
    })
  }

  const previewBranch = assertSafeBranchName(body.previewBranch, 'preview branch')
  const baseBranch = assertSafeBranchName(body.baseBranch, 'base branch')
  const projectDir = getProjectDir()

  logger.chat.info('Ending preview', { previewBranch, baseBranch })

  return withLock(projectDir, async () => {
    try {
      // 1. Checkout baseBranch in main worktree
      await git(projectDir, ['checkout', baseBranch])

      // 2. Delete preview branch
      try {
        await git(projectDir, ['branch', '-D', previewBranch])
      } catch {
        logger.chat.warn('Failed to delete preview branch', { previewBranch })
      }

      logger.chat.info('Preview ended', { previewBranch })

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.chat.error('Failed to end preview', { error: errorMessage })

      return {
        success: false,
        error: errorMessage,
      }
    }
  })
})
