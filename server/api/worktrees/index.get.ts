/**
 * GET /api/worktrees
 * List all git worktrees in the repository
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { Worktree, WorktreeListResponse, WorktreeStatus } from '~/types/worktree'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'

const execAsync = promisify(exec)

interface WorktreeRaw {
  path: string
  branch: string
  head: string
  isLocked: boolean
  isPrunable: boolean
}

async function parseWorktreeList(projectPath: string): Promise<WorktreeRaw[]> {
  const { stdout } = await execAsync('git worktree list --porcelain', {
    cwd: projectPath,
    maxBuffer: 50 * 1024 * 1024,
  })

  const worktrees: WorktreeRaw[] = []
  let current: Partial<WorktreeRaw> = {}

  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) {
        worktrees.push(current as WorktreeRaw)
      }
      current = {
        path: line.substring('worktree '.length),
        isLocked: false,
        isPrunable: false,
      }
    } else if (line.startsWith('HEAD ')) {
      current.head = line.substring('HEAD '.length)
    } else if (line.startsWith('branch ')) {
      current.branch = line.substring('branch refs/heads/'.length)
    } else if (line === 'locked') {
      current.isLocked = true
    } else if (line === 'prunable') {
      current.isPrunable = true
    } else if (line.startsWith('detached')) {
      current.branch = '(detached)'
    }
  }

  if (current.path) {
    worktrees.push(current as WorktreeRaw)
  }

  return worktrees
}

async function getWorktreeStatus(worktreePath: string): Promise<WorktreeStatus> {
  try {
    // Check for uncommitted changes
    const { stdout: statusOutput } = await execAsync('git status --porcelain', {
      cwd: worktreePath,
    })

    if (statusOutput.trim()) {
      return 'dirty'
    }

    // Check ahead/behind of main
    try {
      const { stdout: revList } = await execAsync(
        'git rev-list --left-right --count HEAD...origin/main 2>/dev/null || git rev-list --left-right --count HEAD...main 2>/dev/null || echo "0 0"',
        { cwd: worktreePath }
      )
      const [ahead, behind] = revList.trim().split(/\s+/).map(Number)

      if (ahead > 0 && behind > 0) return 'diverged'
      if (ahead > 0) return 'ahead'
      if (behind > 0) return 'behind'
    } catch {
      // If comparison fails, assume clean
    }

    return 'clean'
  } catch {
    return 'clean'
  }
}

async function getLastCommit(worktreePath: string): Promise<Worktree['lastCommit']> {
  try {
    const format = '%H|||%h|||%s|||%an|||%ar'
    const { stdout } = await execAsync(`git log -1 --format="${format}"`, {
      cwd: worktreePath,
    })

    const [hash, shortHash, message, author, date] = stdout.trim().split('|||')
    return { hash, shortHash, message, author, date }
  } catch {
    return undefined
  }
}

async function getCommitCount(worktreePath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      'git rev-list --count HEAD ^main 2>/dev/null || git rev-list --count HEAD ^origin/main 2>/dev/null || echo "0"',
      { cwd: worktreePath }
    )
    return parseInt(stdout.trim(), 10) || 0
  } catch {
    return 0
  }
}

async function getCurrentBranch(projectPath: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectPath,
    })
    return stdout.trim()
  } catch {
    return 'main'
  }
}

export default defineEventHandler(async (event): Promise<WorktreeListResponse> => {
  const query = getQuery(event)
  const workingDirectory = (query.workingDirectory as string) || getProjectDir()

  logger.api.info('Listing worktrees', { workingDirectory })

  try {
    const rawWorktrees = await parseWorktreeList(workingDirectory)
    const currentBranch = await getCurrentBranch(workingDirectory)

    // Find main worktree (first one is usually main)
    const mainWorktree = rawWorktrees[0]?.path || workingDirectory

    const worktrees: Worktree[] = await Promise.all(
      rawWorktrees.map(async (raw, index): Promise<Worktree> => {
        const isMain = index === 0
        const isCurrent = raw.branch === currentBranch
        const name = raw.branch || raw.path.split('/').pop() || 'unknown'

        const [status, lastCommit, commitCount] = await Promise.all([
          getWorktreeStatus(raw.path),
          getLastCommit(raw.path),
          isMain ? Promise.resolve(0) : getCommitCount(raw.path),
        ])

        return {
          name,
          path: raw.path,
          branch: raw.branch || '(detached)',
          isMain,
          isCurrent,
          isLocked: raw.isLocked,
          status,
          commitCount,
          lastCommit,
        }
      })
    )

    return {
      worktrees,
      currentBranch,
      mainWorktree,
    }
  } catch (error) {
    logger.api.error('Failed to list worktrees', {
      error: error instanceof Error ? error.message : String(error),
    })

    throw createError({
      statusCode: 500,
      message: 'Failed to list worktrees',
    })
  }
})
