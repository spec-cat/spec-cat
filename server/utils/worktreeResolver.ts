/**
 * Worktree Resolver
 * Finds or creates isolated worktrees for feature-based execution.
 */

import { exec } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { logger } from './logger'

const execAsync = promisify(exec)

export interface WorktreeInfo {
  path: string
  branch: string
  isNew: boolean
  baseBranch?: string  // The branch this worktree was created from
}

interface ParsedWorktree {
  path: string
  branch: string | null
  head: string
}

/**
 * Generate random 8-character string for unique worktree paths
 */
function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 10)
}

/**
 * Get current HEAD branch or commit hash
 */
async function getCurrentHead(projectPath: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectPath,
    })
    const branch = stdout.trim()
    if (branch === 'HEAD') {
      const { stdout: hash } = await execAsync('git rev-parse HEAD', {
        cwd: projectPath,
      })
      return hash.trim()
    }
    return branch
  } catch {
    return 'main'
  }
}

/**
 * Check if a branch exists in the repository
 */
async function branchExists(projectPath: string, branchName: string): Promise<boolean> {
  try {
    await execAsync(`git rev-parse --verify "${branchName}"`, { cwd: projectPath })
    return true
  } catch {
    return false
  }
}

/**
 * Parse git worktree porcelain output
 */
export function parseWorktreePorcelain(stdout: string): ParsedWorktree[] {
  const worktrees: ParsedWorktree[] = []
  let current: Partial<ParsedWorktree> = {}

  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path && current.head) {
        worktrees.push(current as ParsedWorktree)
      }
      current = {
        path: line.substring('worktree '.length),
        branch: null,
      }
    } else if (line.startsWith('HEAD ')) {
      current.head = line.substring('HEAD '.length)
    } else if (line.startsWith('branch ')) {
      current.branch = line.substring('branch refs/heads/'.length)
    } else if (line.startsWith('detached')) {
      current.branch = null
    }
  }

  if (current.path && current.head) {
    worktrees.push(current as ParsedWorktree)
  }

  return worktrees
}

/**
 * Parse git worktree list output
 */
async function parseWorktreeList(projectPath: string): Promise<ParsedWorktree[]> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', {
      cwd: projectPath,
      maxBuffer: 50 * 1024 * 1024,
    })

    return parseWorktreePorcelain(stdout)
  } catch {
    return []
  }
}

/**
 * Find an existing worktree that matches the feature ID.
 * Matches if the worktree branch name equals the featureId.
 */
export async function findWorktreeByFeature(
  projectPath: string,
  featureId: string
): Promise<WorktreeInfo | null> {
  const worktrees = await parseWorktreeList(projectPath)

  for (const wt of worktrees) {
    if (wt.branch === featureId) {
      logger.git.info('Found existing worktree for feature', {
        featureId,
        path: wt.path,
        branch: wt.branch,
      })
      return {
        path: wt.path,
        branch: wt.branch,
        isNew: false,
      }
    }
  }

  return null
}

/**
 * Create a new worktree for the feature.
 * Uses featureId directly as the branch name.
 * If the branch already exists, creates a worktree from the existing branch.
 */
export async function createWorktreeForFeature(
  projectPath: string,
  featureId: string,
  baseBranch?: string
): Promise<WorktreeInfo> {
  const base = baseBranch || await getCurrentHead(projectPath)
  const randomId = generateRandomId()
  const branchName = featureId
  const worktreePath = `/tmp/${featureId}-${randomId}`
  const existingBranch = await branchExists(projectPath, branchName)

  logger.git.info('Creating worktree', {
    featureId,
    branchName,
    baseBranch: base,
    worktreePath,
    existingBranch,
  })

  if (existingBranch) {
    // Branch already exists — create worktree from existing branch
    await execAsync(`git worktree add "${worktreePath}" "${branchName}"`, {
      cwd: projectPath,
    })
  } else {
    // Create new branch and worktree
    await execAsync(`git worktree add -b "${branchName}" "${worktreePath}" "${base}"`, {
      cwd: projectPath,
    })
  }

  return {
    path: worktreePath,
    branch: branchName,
    isNew: !existingBranch,
    baseBranch: base,
  }
}

/**
 * Resolve a worktree for the feature.
 * 1. First, try to find an existing worktree for the feature
 * 2. If not found, create a new worktree (reuses existing branch if it exists)
 */
export async function resolveWorktree(
  projectPath: string,
  featureId: string,
  baseBranch?: string
): Promise<WorktreeInfo> {
  // First, try to find an existing worktree
  const existing = await findWorktreeByFeature(projectPath, featureId)
  if (existing) {
    return existing
  }

  // Create a new worktree (handles existing branch internally)
  return createWorktreeForFeature(projectPath, featureId, baseBranch)
}

/**
 * Verify that spec files exist in the worktree
 */
export async function verifySpecFilesInWorktree(
  worktreePath: string,
  featureId: string
): Promise<{ valid: boolean; error?: string }> {
  const specPath = join(worktreePath, 'specs', featureId, 'spec.md')

  if (!existsSync(specPath)) {
    return {
      valid: false,
      error: `spec.md not found in worktree at ${specPath}`,
    }
  }

  return { valid: true }
}
