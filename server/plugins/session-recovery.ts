import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { listAllStoredSessions } from '../utils/session-store'
import { planRecovery } from '../utils/session-recovery'
import { projectKey } from '../utils/project-dir'
import { listManagedWorktreeDirNames, removeOrphanedWorktreeDir } from '../utils/worktree'

const execFileAsync = promisify(execFile)
const TMUX_BIN = process.env.TMUX_BIN || 'tmux'

/**
 * Boot-time reconciliation of interrupted sessions. A server restart (or host
 * reboot) can leave tmux sessions and managed worktrees behind that no longer
 * match the stored session metadata; this plugin kills orphaned tmux sessions,
 * removes orphaned worktree directories, and logs active sessions whose
 * worktree vanished (the attach/restore flow recreates those on demand).
 *
 * Fire-and-forget: recovery must never block or crash server startup.
 */
export default defineNitroPlugin(() => {
  void reconcileInterruptedSessions().catch((error) => {
    console.error('[session-recovery] boot reconciliation failed:', error)
  })
})

async function reconcileInterruptedSessions() {
  // The session store and worktree root are namespaced per project, so these
  // listings already contain only this project's state. tmux, however, is a
  // single per-user server: listTmuxSessionNames sees every instance's
  // sessions, so planRecovery scopes the kill set by this project's key.
  const stored = await listAllStoredSessions()
  const [tmuxNames, worktreeDirNames] = await Promise.all([
    listTmuxSessionNames(),
    listManagedWorktreeDirNames()
  ])

  const plan = planRecovery(stored, tmuxNames, worktreeDirNames, projectKey())

  let killedTmux = 0
  for (const name of plan.tmuxToKill) {
    try {
      await execFileAsync(TMUX_BIN, ['kill-session', '-t', name])
      killedTmux += 1
    } catch (error) {
      console.error(`[session-recovery] failed to kill orphaned tmux session ${name}:`, error)
    }
  }

  let removedWorktrees = 0
  for (const worktree of plan.worktreesToRemove) {
    try {
      await removeOrphanedWorktreeDir(worktree.dirName, worktree.projectDir)
      removedWorktrees += 1
    } catch (error) {
      console.error(`[session-recovery] failed to remove orphaned worktree ${worktree.dirName}:`, error)
    }
  }

  for (const missing of plan.missingWorktrees) {
    console.warn(
      `[session-recovery] worktree missing for active session ${missing.sessionId}`
        + `${missing.worktreePath ? ` (${missing.worktreePath})` : ''}; attach/restore will recreate it`
    )
  }

  console.log(
    `[session-recovery] boot reconciliation done: killed ${killedTmux}/${plan.tmuxToKill.length} orphaned tmux session(s), `
      + `removed ${removedWorktrees}/${plan.worktreesToRemove.length} orphaned worktree(s), `
      + `${plan.missingWorktrees.length} active session(s) missing a worktree`
  )
}

/** Lists tmux session names, tolerating tmux being absent or not running. */
async function listTmuxSessionNames(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(TMUX_BIN, ['ls', '-F', '#{session_name}'])
    return stdout.split('\n').map((line) => line.trim()).filter(Boolean)
  } catch {
    return []
  }
}
