/**
 * POST /api/chat/preview-sync
 * Update an active preview branch to the latest worktree HEAD.
 * Called automatically after each streaming turn completes (auto-commit → sync).
 *
 * Steps:
 *  1. Get worktree HEAD
 *  2. Update preview branch ref to that commit
 *  3. If main worktree is on the preview branch, reset --hard
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'

const execAsync = promisify(exec)

async function git(cwd: string, cmd: string): Promise<string> {
  const { stdout } = await execAsync(`git ${cmd}`, { cwd })
  return stdout.trim()
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    previewBranch: string
    worktreePath: string
  }>(event)

  if (!body?.previewBranch || !body?.worktreePath) {
    throw createError({
      statusCode: 400,
      message: 'previewBranch and worktreePath are required',
    })
  }

  const { previewBranch, worktreePath } = body
  const projectDir = getProjectDir()

  try {
    // 1. Get latest worktree HEAD
    const worktreeHead = await git(worktreePath, 'rev-parse HEAD')

    // 2. Update the preview branch ref
    await git(projectDir, `update-ref refs/heads/${previewBranch} ${worktreeHead}`)

    // 3. If main worktree is currently on the preview branch, reset --hard
    const currentBranch = await git(projectDir, 'rev-parse --abbrev-ref HEAD')
    if (currentBranch === previewBranch) {
      await git(projectDir, `reset --hard ${worktreeHead}`)
    }

    logger.chat.info('Preview synced', { previewBranch, commit: worktreeHead })

    return { success: true, commit: worktreeHead }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.chat.error('Preview sync failed', { previewBranch, error: errorMessage })

    return { success: false, error: errorMessage }
  }
})
