/**
 * POST /api/chat/preview
 * Create a temporary preview branch from the worktree HEAD and
 * checkout it in the main worktree so the user can test locally.
 *
 * Naming convention: sc/preview
 * This branch is cleaned up on finalize or explicit unpreview.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'

const execAsync = promisify(exec)

async function git(cwd: string, cmd: string): Promise<string> {
  const { stdout } = await execAsync(`git ${cmd}`, { cwd })
  return stdout.trim()
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    conversationId: string
    worktreePath: string
    baseBranch: string
  }>(event)

  if (!body?.conversationId || !body?.worktreePath || !body?.baseBranch) {
    throw createError({
      statusCode: 400,
      message: 'conversationId, worktreePath, and baseBranch are required',
    })
  }

  const { conversationId, worktreePath, baseBranch } = body
  const projectDir = getProjectDir()
  const previewBranch = 'sc/preview'

  logger.chat.info('Creating preview branch', { conversationId, previewBranch })

  try {
    // 1. Ensure worktree exists
    if (!existsSync(worktreePath)) {
      return { success: false, error: 'Worktree directory not found.' }
    }

    // 2. Auto-commit any uncommitted changes in the worktree
    const status = await git(worktreePath, 'status --porcelain')
    if (status) {
      await git(worktreePath, 'add -A')
      await git(worktreePath, 'commit -m "auto-commit for preview"')
    }

    // 3. Get worktree HEAD
    const worktreeHead = await git(worktreePath, 'rev-parse HEAD')

    // 4. Check main worktree for uncommitted changes
    const mainStatus = await git(projectDir, 'status --porcelain')
    if (mainStatus) {
      return {
        success: false,
        error: 'Main worktree has uncommitted changes. Please commit or stash them first.',
      }
    }

    // 5. Create or reuse preview branch
    let branchExists = false
    try {
      await git(projectDir, `rev-parse --verify "refs/heads/${previewBranch}"`)
      branchExists = true
    } catch { /* branch doesn't exist yet */ }

    if (branchExists) {
      // 6a. Branch already exists — update its ref to worktree HEAD and checkout
      await git(projectDir, `checkout "${previewBranch}"`)
      await git(projectDir, `reset --hard ${worktreeHead}`)
    } else {
      // 6b. Create new preview branch at worktree HEAD and checkout
      await git(projectDir, `branch "${previewBranch}" ${worktreeHead}`)
      await git(projectDir, `checkout "${previewBranch}"`)
    }

    logger.chat.info('Preview branch active', { previewBranch, worktreeHead })

    return {
      success: true,
      previewBranch,
      commit: worktreeHead,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.chat.error('Failed to create preview', { conversationId, error: errorMessage })

    return {
      success: false,
      error: errorMessage,
    }
  }
})
