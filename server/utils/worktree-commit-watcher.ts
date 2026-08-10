import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const DEFAULT_POLL_MS = 1500

export type WorktreeCommitWatcher = { stop: () => void }

export type WorktreeState = {
  head: string
  /** Checked-out branch, or '' while HEAD is detached (e.g. mid-rebase). */
  branch: string
}

type Options = {
  /** Worktree working directory whose HEAD is watched. */
  cwd: string
  intervalMs?: number
  /** Fired when HEAD or the checked-out branch moves, after the initial baseline. */
  onChange: (state: WorktreeState, previous: WorktreeState) => void | Promise<void>
  /** Return true to tear the watcher down (e.g. the session was deleted). */
  shouldDispose?: () => boolean
}

/**
 * Polls a worktree's HEAD commit and checked-out branch and fires when either
 * moves. Commits made anywhere — by the agent mid-turn, by the user in the
 * shell, or by turn-end auto-commit — advance HEAD, so this is a
 * provider-agnostic "something happened here" signal, decoupled from turn
 * detection. The branch is watched alongside the commit because `git checkout
 * -b` (what speckit does when it starts a feature) leaves HEAD on the same
 * commit while changing the branch the conversation now lives on. The first
 * read only establishes a baseline so attaching to an existing session does not
 * fire onChange.
 */
export function startWorktreeCommitWatcher(options: Options): WorktreeCommitWatcher {
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_MS
  let last: WorktreeState | null = null
  let stopped = false
  let running = false

  const readState = async (): Promise<WorktreeState | null> => {
    const head = await gitOutput(options.cwd, ['rev-parse', 'HEAD'])
    if (head === null) return null
    // --quiet exits non-zero (no output) on a detached HEAD instead of failing.
    const branch = await gitOutput(options.cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
    return { head, branch: branch ?? '' }
  }

  const poll = async () => {
    if (stopped || running) return
    if (options.shouldDispose?.()) {
      stop()
      return
    }
    running = true
    try {
      const state = await readState()
      if (!state) return
      if (last === null) {
        last = state
        return
      }
      if (state.head === last.head && state.branch === last.branch) return
      const previous = last
      last = state
      await options.onChange(state, previous)
    } catch {
      // Best-effort: a transient git failure just retries on the next tick.
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => void poll(), intervalMs)
  void poll()

  function stop() {
    if (stopped) return
    stopped = true
    clearInterval(timer)
  }

  return { stop }
}

async function gitOutput(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf8' })
    return stdout.trim()
  } catch {
    return null
  }
}
