/**
 * Worktree Recovery Utility
 * Recreates chat worktrees after the spec-cat tmp directory is wiped.
 * The git branch still exists — we just need to re-add the worktree.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { getChatWorktreeIdFromPath, isSpecCatWorktreePath } from './worktreePaths'

const execAsync = promisify(exec)

interface RecoveryResult {
  recovered: boolean
  error?: string
}

/**
 * Ensure a chat worktree directory exists, recreating it from the existing
 * git branch if the directory was deleted.
 *
 * @param projectDir - The main project git repo directory
 * @param worktreePath - The expected worktree path (e.g. ~/.spec-cat/tmp/sc-abc123)
 * @param knownBranch - Optional branch name when it can't be derived from path
 *                      (e.g. feature-based paths like ~/.spec-cat/tmp/sc-001-feature-conv-xxx)
 * @returns Whether recovery was performed or an error occurred
 */
export async function ensureChatWorktree(
  projectDir: string,
  worktreePath: string,
  knownBranch?: string,
): Promise<RecoveryResult> {
  // Only handle spec-cat worktree paths
  if (!isSpecCatWorktreePath(worktreePath)) {
    return { recovered: false }
  }

  // Already exists — nothing to do
  if (existsSync(worktreePath)) {
    return { recovered: false }
  }

  // Use known branch if provided, otherwise derive from path:
  // ~/.spec-cat/tmp/sc-{convId} -> sc/{convId}
  let branchName: string
  if (knownBranch) {
    branchName = knownBranch
  } else {
    const convId = getChatWorktreeIdFromPath(worktreePath) // e.g. "conv-abc123xyz"
    if (!convId) {
      return { recovered: false, error: `Cannot derive branch name from worktree path: ${worktreePath}` }
    }
    branchName = `sc/${convId}`
  }

  try {
    // Prune stale worktree refs so git doesn't complain about duplicates
    await execAsync('git worktree prune', { cwd: projectDir })

    // Verify the branch still exists
    try {
      await execAsync(`git rev-parse --verify "${branchName}"`, { cwd: projectDir })
    } catch {
      return { recovered: false, error: `Branch "${branchName}" no longer exists` }
    }

    // Recreate worktree from existing branch (no -b flag)
    await execAsync(`git worktree add "${worktreePath}" "${branchName}"`, { cwd: projectDir })

    console.log(`[ensureChatWorktree] Recovered worktree: ${worktreePath} → ${branchName}`)
    return { recovered: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ensureChatWorktree] Recovery failed for ${worktreePath}:`, message)
    return { recovered: false, error: `Worktree recovery failed: ${message}` }
  }
}
