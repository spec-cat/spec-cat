/**
 * POST /api/chat/preview
 * Create a temporary preview branch from the worktree HEAD and
 * checkout it in the main worktree so the user can test locally.
 *
 * Naming convention: sc/preview
 * This branch is cleaned up on finalize or explicit unpreview.
 */

import { existsSync } from 'node:fs'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'
import { validateWorktreePath } from '~/server/utils/validateWorktree'
import { assertSafeBranchName, git } from '~/server/utils/chatGit'
import { autoCommitChanges } from '~/server/utils/claudeService'
import { withLock } from '~/server/utils/asyncLock'

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

  const { conversationId, worktreePath } = body
  const baseBranch = assertSafeBranchName(body.baseBranch, 'base branch')
  const projectDir = getProjectDir()
  const previewBranch = 'sc/preview'

  if (existsSync(worktreePath)) {
    validateWorktreePath(worktreePath)
  }

  logger.chat.info('Creating preview branch', { conversationId, previewBranch })

  return withLock(projectDir, async () => {
    try {
      // 1. Ensure worktree exists
      if (!existsSync(worktreePath)) {
        return { success: false, error: 'Worktree directory not found.' }
      }

      // 2. Auto-commit any uncommitted changes in the worktree
      await autoCommitChanges(worktreePath)

      // 3. Get worktree HEAD
      const worktreeHead = await git(worktreePath, ['rev-parse', 'HEAD'])

      // 4. Check main worktree for uncommitted changes
      const mainStatus = await git(projectDir, ['status', '--porcelain'])
      if (mainStatus) {
        return {
          success: false,
          error: 'Main worktree has uncommitted changes. Please commit or stash them first.',
        }
      }

      // 5. Create or reuse preview branch
      let branchExists = false
      try {
        await git(projectDir, ['rev-parse', '--verify', `refs/heads/${previewBranch}`])
        branchExists = true
      } catch { /* branch doesn't exist yet */ }

      if (branchExists) {
        // 6a. Branch already exists — update its ref to worktree HEAD and checkout
        await git(projectDir, ['checkout', previewBranch])
        await git(projectDir, ['reset', '--hard', worktreeHead])
      } else {
        // 6b. Create new preview branch at worktree HEAD and checkout
        await git(projectDir, ['branch', previewBranch, worktreeHead])
        await git(projectDir, ['checkout', previewBranch])
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
})
