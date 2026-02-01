/**
 * POST /api/worktrees/:name/switch
 * Switch to a different worktree (checkout branch)
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { WorktreeSwitchResponse, Worktree } from '~/types/worktree'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'

const execAsync = promisify(exec)

export default defineEventHandler(async (event): Promise<WorktreeSwitchResponse> => {
  const name = getRouterParam(event, 'name')
  const query = getQuery(event)
  const workingDirectory = (query.workingDirectory as string) || getProjectDir()

  if (!name) {
    throw createError({
      statusCode: 400,
      message: 'Worktree name is required',
    })
  }

  logger.api.info('Switching to worktree', { name, workingDirectory })

  try {
    // Checkout the branch
    await execAsync(`git checkout "${name}"`, { cwd: workingDirectory })

    // Get current commit info
    const format = '%H|||%h|||%s|||%an|||%ar'
    const { stdout: commitOutput } = await execAsync(`git log -1 --format="${format}"`, {
      cwd: workingDirectory,
    })
    const [hash, shortHash, message, author, date] = commitOutput.trim().split('|||')

    // Get status
    const { stdout: statusOutput } = await execAsync('git status --porcelain', {
      cwd: workingDirectory,
    })
    const status = statusOutput.trim() ? 'dirty' : 'clean'

    const worktree: Worktree = {
      name,
      path: workingDirectory,
      branch: name,
      isMain: false,
      isCurrent: true,
      isLocked: false,
      status: status as Worktree['status'],
      commitCount: 0,
      lastCommit: { hash, shortHash, message, author, date },
    }

    logger.api.info('Switched to worktree', { name })

    return {
      success: true,
      worktree,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.api.error('Failed to switch worktree', { name, error: errorMessage })

    return {
      success: false,
      error: errorMessage,
    }
  }
})
