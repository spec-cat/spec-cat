/**
 * DELETE /api/chat/worktree
 * Removes a chat worktree and its branch.
 * Separate from [name].delete.ts because branch names like sc/conv-xxx
 * contain "/" which breaks route params.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'

const execAsync = promisify(exec)

export default defineEventHandler(async (event) => {
  const body = await readBody<{ worktreePath: string; branch: string }>(event)

  if (!body?.worktreePath || !body?.branch) {
    throw createError({
      statusCode: 400,
      message: 'worktreePath and branch are required',
    })
  }

  const { worktreePath, branch } = body
  const projectDir = getProjectDir()

  logger.chat.info('Deleting chat worktree', { worktreePath, branch })

  try {
    // Remove worktree
    if (existsSync(worktreePath)) {
      try {
        await execAsync(`git worktree remove "${worktreePath}" --force`, {
          cwd: projectDir,
        })
      } catch {
        // Fallback: direct removal
        await rm(worktreePath, { recursive: true, force: true })
      }
    }

    // Prune worktree references
    await execAsync('git worktree prune', { cwd: projectDir })

    // Delete the branch
    try {
      await execAsync(`git branch -D "${branch}"`, { cwd: projectDir })
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
