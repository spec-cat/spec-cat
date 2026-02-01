/**
 * DELETE /api/worktrees/:name
 * Remove a worktree
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import type { WorktreeDeleteResponse } from '~/types/worktree'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'

const execAsync = promisify(exec)

async function findWorktreePath(projectPath: string, branchName: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', {
      cwd: projectPath,
    })

    let currentPath = ''
    for (const line of stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = line.substring('worktree '.length)
      } else if (line.startsWith('branch refs/heads/')) {
        const branch = line.substring('branch refs/heads/'.length)
        if (branch === branchName) {
          return currentPath
        }
      }
    }

    return null
  } catch {
    return null
  }
}

export default defineEventHandler(async (event): Promise<WorktreeDeleteResponse> => {
  const name = getRouterParam(event, 'name')
  const query = getQuery(event)
  const workingDirectory = (query.workingDirectory as string) || getProjectDir()
  const deleteBranch = query.deleteBranch === 'true'

  if (!name) {
    throw createError({
      statusCode: 400,
      message: 'Worktree name is required',
    })
  }

  logger.api.info('Deleting worktree', { name, workingDirectory, deleteBranch })

  try {
    // Find worktree path
    const worktreePath = await findWorktreePath(workingDirectory, name)

    if (worktreePath) {
      // Try git worktree remove first
      try {
        await execAsync(`git worktree remove "${worktreePath}" --force`, {
          cwd: workingDirectory,
        })
      } catch {
        // If git worktree remove fails, try direct removal
        if (existsSync(worktreePath)) {
          await rm(worktreePath, { recursive: true, force: true })
        }
      }
    }

    // Prune worktree references
    await execAsync('git worktree prune', { cwd: workingDirectory })

    // Optionally delete the branch
    if (deleteBranch) {
      try {
        await execAsync(`git branch -D "${name}"`, { cwd: workingDirectory })
        logger.api.info('Branch deleted', { name })
      } catch (branchError) {
        logger.api.warn('Failed to delete branch', {
          name,
          error: branchError instanceof Error ? branchError.message : String(branchError),
        })
      }
    }

    logger.api.info('Worktree deleted', { name })

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.api.error('Failed to delete worktree', { name, error: errorMessage })

    return {
      success: false,
      error: errorMessage,
    }
  }
})
