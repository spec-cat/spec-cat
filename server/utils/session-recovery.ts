/**
 * Pure decision logic for the boot-time session recovery plugin
 * (server/plugins/session-recovery.ts). Kept free of tmux/git/filesystem
 * access so the reconciliation rules are unit-testable.
 */

/**
 * tmux name of a web session for the given project:
 * `${provider}-web-${projectKey}-${sanitizedId}`. The project key is baked in
 * so recovery only ever reaps the tmux sessions of the project this instance
 * serves, never another concurrently-running instance's.
 */
export function managedTmuxNamePattern(projectKey: string): RegExp {
  return new RegExp(`^(claude|codex)-web-${escapeRegExp(projectKey)}-`)
}

/**
 * Throwaway one-shot query sessions for the given project:
 * `${provider}-query-${projectKey}-${suffix}` (see provider-query.ts). They are
 * always short-lived, so any that survive to boot belong to a crashed process
 * and can be killed unconditionally — but still only within this project.
 */
export function queryTmuxNamePattern(projectKey: string): RegExp {
  return new RegExp(`^(claude|codex)-query-${escapeRegExp(projectKey)}-`)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Managed worktree directories under the worktree root: `sc-<sessionId>`. */
export const MANAGED_WORKTREE_DIR_PATTERN = /^sc-([a-zA-Z0-9_-]{8,120})$/

export type RecoverySessionInfo = {
  id: string
  tmuxName: string
  archived?: boolean
  finalized?: boolean
  worktreeBranch?: string
  cwd?: string
  projectDir?: string
}

export type RecoveryPlan = {
  /** Managed tmux session names with no stored, non-archived session. */
  tmuxToKill: string[]
  /** Managed worktree directories with no stored session, or an archived one. */
  worktreesToRemove: Array<{ dirName: string; sessionId: string; projectDir?: string }>
  /** Active sessions whose worktree directory is gone (log only, never recreate). */
  missingWorktrees: Array<{ sessionId: string; worktreePath?: string }>
}

export function planRecovery(
  storedSessions: RecoverySessionInfo[],
  tmuxNames: string[],
  worktreeDirNames: string[],
  projectKey: string
): RecoveryPlan {
  const sessionsById = new Map(storedSessions.map((session) => [session.id, session]))
  const liveTmuxNames = new Set(
    storedSessions.filter((session) => !session.archived).map((session) => session.tmuxName)
  )

  // tmux is a single per-user server shared by every instance, so scope the
  // reconciliation to this project's own name prefixes. Names carrying a
  // different (or no) project key belong to another instance and are left
  // untouched.
  const webPattern = managedTmuxNamePattern(projectKey)
  const queryPattern = queryTmuxNamePattern(projectKey)
  const tmuxToKill = [...new Set(tmuxNames)].filter(
    (name) =>
      queryPattern.test(name) ||
      (webPattern.test(name) && !liveTmuxNames.has(name))
  )

  const worktreesToRemove: RecoveryPlan['worktreesToRemove'] = []
  for (const dirName of new Set(worktreeDirNames)) {
    const match = MANAGED_WORKTREE_DIR_PATTERN.exec(dirName)
    if (!match) continue
    const sessionId = match[1]!
    const session = sessionsById.get(sessionId)
    // Archived sessions must not keep worktrees; unknown ids are orphans.
    if (session && !session.archived) continue
    worktreesToRemove.push({ dirName, sessionId, projectDir: session?.projectDir })
  }

  const presentDirNames = new Set(worktreeDirNames)
  const missingWorktrees: RecoveryPlan['missingWorktrees'] = []
  for (const session of storedSessions) {
    // Finalized sessions legitimately have no worktree anymore.
    if (session.archived || session.finalized || !session.worktreeBranch) continue
    if (presentDirNames.has(`sc-${session.id}`)) continue
    missingWorktrees.push({ sessionId: session.id, worktreePath: session.cwd })
  }

  return { tmuxToKill, worktreesToRemove, missingWorktrees }
}
