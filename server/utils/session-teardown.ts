import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { StoredTerminalSession } from './session-store'
import { endSessionPreview } from './session-integration'
import { deleteSessionWorktree } from './worktree'
import { getCliHookSpoolPath } from './cli-hooks'

const execFileAsync = promisify(execFile)
const TMUX_BIN = process.env.TMUX_BIN || 'tmux'

/**
 * Stops a session's tmux session, ends an active preview, and removes its
 * managed worktree. Pass `keepBranch` to preserve the sc/<id> branch so the
 * session's work survives (used when archiving).
 */
export async function teardownSessionRuntime(
  session: StoredTerminalSession,
  options: { keepBranch?: boolean } = {}
) {
  try {
    await execFileAsync(TMUX_BIN, ['kill-session', '-t', session.tmuxName])
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    if (!/no server running|can't find session|session not found/i.test(details)) {
      throw new Error(`Failed to stop terminal session: ${details}`)
    }
  }

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
