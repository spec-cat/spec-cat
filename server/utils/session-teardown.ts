import { rm } from 'node:fs/promises'
import type { StoredTerminalSession } from './session-store'
import { endSessionPreview } from './session-integration'
import { deleteSessionWorktree } from './worktree'
import { getCliHookSpoolPath } from './cli-hooks'
import { terminateTmuxSessionChecked } from './tmux'
import { deleteSessionBranch } from './worktree'

/**
 * Stops a session's tmux session, ends an active preview, and removes its
 * managed worktree. Pass `keepBranch` to preserve the sc/<id> branch so the
 * session's work survives (used when archiving).
 */
export async function teardownSessionRuntime(
  session: StoredTerminalSession,
  options: { keepBranch?: boolean } = {}
) {
  await terminateTmuxSessionChecked(session.tmuxName)

  // The CLI hook spool is per-conversation runtime state; drop it with the
  // session. The hook monitor self-stops via its shouldDispose check, and the
  // worktree removal below takes the injected .claude/settings.local.json.
  await rm(getCliHookSpoolPath(session.id), { force: true }).catch(() => {})

  if (!session.finalized && session.projectDir && session.worktreeBranch) {
    if (session.previewBranch) {
      await endSessionPreview(session.id)
    }
    await deleteSessionWorktree({
      projectDir: session.projectDir,
      worktreePath: session.cwd,
      branch: session.worktreeBranch,
      keepBranch: options.keepBranch
    })
  }
}

/** Removes the branch retained by archive teardown, when one still exists. */
export async function teardownArchivedSession(session: StoredTerminalSession) {
  if (!session.finalized && session.projectDir && session.worktreeBranch) {
    await deleteSessionBranch(session.projectDir, session.worktreeBranch)
  }
}
