/**
 * Automatic rebase-conflict resolution driven through the conversation's own
 * PTY — never a headless one-shot query.
 *
 * When `git rebase` stops on conflicts, we submit a resolution prompt into the
 * session's live tmux session via the browserless job queue: the same
 * send-keys + turn-detection path a real chat turn uses. Claude and Codex
 * therefore behave identically and no `claude -p` / `codex exec` is involved.
 * After each agent turn we stage the tree and run `git rebase --continue`,
 * looping until the rebase finishes or a round budget is exhausted. The agent's
 * messages are collected into a transient report the caller can surface once;
 * nothing is persisted separately.
 */
import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { promisify } from 'node:util'
import { getJobQueue } from './job-executor'
import type { StoredTerminalSession } from './session-store'

const execFileAsync = promisify(execFile)

/** Max agent turns spent resolving conflicts before giving up and aborting. */
const MAX_ROUNDS = 8

/** Result of one `git rebase --continue` / `--skip` step. */
type RebaseStep = 'done' | 'conflict' | 'empty' | 'failed'

export type ConflictResolution = {
  resolved: boolean
  /** Number of agent turns spent. */
  rounds: number
  /** Human-readable transcript of what the agent did, for one-time viewing. */
  report: string
  /** Files still conflicted when resolution gave up (empty on success). */
  remainingConflicts: string[]
}

/**
 * Dependencies of the resolution loop, injected so the state machine can be
 * unit-tested without git, tmux, or a provider CLI.
 */
export type ResolutionDeps = {
  listConflicts: () => Promise<string[]>
  rebaseInProgress: () => Promise<boolean>
  /** Runs one agent turn against the given conflicts; edits the worktree. */
  runAgentTurn: (conflicts: string[]) => Promise<{ ok: boolean; message?: string; error?: string }>
  stageAll: () => Promise<void>
  continueRebase: () => Promise<RebaseStep>
  skipRebase: () => Promise<RebaseStep>
}

/**
 * Drives an in-progress rebase to completion by repeatedly asking the agent to
 * resolve the current conflicts, staging, and continuing. Pure control flow —
 * all side effects go through `deps`.
 */
export async function runResolutionLoop(
  deps: ResolutionDeps,
  maxRounds = MAX_ROUNDS
): Promise<ConflictResolution> {
  const reports: string[] = []
  let rounds = 0
  // Hard cap on total iterations so a pathological empty-patch / re-conflict
  // cycle can never spin forever even when it does not spend agent turns.
  let iterations = 0
  const iterationCap = Math.max(4, maxRounds * 4)

  const giveUp = async (): Promise<ConflictResolution> => ({
    resolved: false,
    rounds,
    report: joinReports(reports),
    remainingConflicts: await deps.listConflicts()
  })

  while (await deps.rebaseInProgress()) {
    if (++iterations > iterationCap) return giveUp()

    const conflicts = await deps.listConflicts()

    if (!conflicts.length) {
      // Paused with no conflicts — typically a patch that became empty after a
      // resolution. Drop it and move on.
      if (await deps.skipRebase() === 'failed') return giveUp()
      continue
    }

    if (rounds >= maxRounds) return giveUp()
    rounds++

    const turn = await deps.runAgentTurn(conflicts)
    reports.push(formatRound(rounds, conflicts, turn))
    if (!turn.ok) return giveUp()

    // The agent may have left markers behind; never stage a half-resolved tree.
    // Spend another round instead (bounded by maxRounds).
    if ((await deps.listConflicts()).length) continue

    await deps.stageAll()
    const step = await deps.continueRebase()
    if (step === 'failed') return giveUp()
    if (step === 'empty' && await deps.skipRebase() === 'failed') return giveUp()
    // 'conflict' / 'done' fall through: the while-condition re-checks state.
  }

  return { resolved: true, rounds, report: joinReports(reports), remainingConflicts: [] }
}

/**
 * Resolves the conflicts of a rebase that has already stopped in `cwd`, using
 * the given session's provider through the live tmux job queue.
 */
export async function autoResolveRebaseConflicts(
  session: StoredTerminalSession,
  cwd: string,
  target: string
): Promise<ConflictResolution> {
  const queue = getJobQueue()

  const deps: ResolutionDeps = {
    listConflicts: () => conflictFiles(cwd),
    rebaseInProgress: () => rebaseInProgress(cwd),
    runAgentTurn: async (conflicts) => {
      const job = queue.enqueue({
        sessionId: session.id,
        provider: session.provider,
        prompt: buildResolvePrompt(conflicts, target)
      })
      const finished = await queue.waitForJob(job.id)
      return {
        ok: finished.status === 'done',
        message: finished.result?.lastAssistantMessage?.trim() || undefined,
        error: finished.error
      }
    },
    stageAll: async () => {
      await gitNoEditor(cwd, ['add', '-A'])
    },
    continueRebase: () => rebaseStep(cwd, 'continue'),
    skipRebase: () => rebaseStep(cwd, 'skip')
  }

  return runResolutionLoop(deps)
}

/**
 * Builds the prompt sent into the conversation asking the agent to resolve the
 * listed conflicts. The agent edits files only — this module owns every git
 * command so the two never race.
 */
export function buildResolvePrompt(conflicts: string[], target: string): string {
  return [
    `A git rebase onto "${target}" has stopped on merge conflicts in this worktree.`,
    'Resolve every conflict directly in these working-tree files:',
    ...conflicts.map((file) => `- ${file}`),
    '',
    'Rules:',
    '- Edit the files to produce the correct merged result and remove ALL conflict markers (<<<<<<<, =======, >>>>>>>).',
    '- Honor the intent of both sides and keep the code building.',
    '- Do NOT run any git command (no git add, no git rebase --continue/--skip/--abort). Only edit files.',
    '- When every listed file is fully resolved with no remaining markers, end your turn.'
  ].join('\n')
}

function formatRound(
  round: number,
  conflicts: string[],
  turn: { ok: boolean; message?: string; error?: string }
): string {
  if (turn.message) return `Round ${round}: ${turn.message}`
  if (!turn.ok && turn.error) return `Round ${round}: agent turn failed — ${turn.error}`
  return `Round ${round}: resolved ${conflicts.length} file(s) — ${conflicts.join(', ')}`
}

function joinReports(reports: string[]): string {
  return reports.join('\n\n')
}

/** Runs `git rebase --continue|--skip` and classifies the resulting state. */
async function rebaseStep(cwd: string, mode: 'continue' | 'skip'): Promise<RebaseStep> {
  let failed = false
  try {
    await gitNoEditor(cwd, ['rebase', mode === 'skip' ? '--skip' : '--continue'])
  } catch {
    failed = true
  }
  if (!(await rebaseInProgress(cwd))) return 'done'
  if ((await conflictFiles(cwd)).length) return 'conflict'
  // Still paused, no conflicts: a failed continue here means an empty patch
  // ("nothing to commit"); a clean pause we cannot explain is a hard failure.
  return failed ? 'empty' : 'failed'
}

async function conflictFiles(cwd: string): Promise<string[]> {
  const { stdout } = await gitNoEditor(cwd, ['diff', '--name-only', '--diff-filter=U']).catch(() => ({ stdout: '' }))
  return stdout.split('\n').map((file) => file.trim()).filter(Boolean)
}

async function rebaseInProgress(cwd: string): Promise<boolean> {
  for (const name of ['rebase-merge', 'rebase-apply']) {
    const { stdout } = await gitNoEditor(cwd, ['rev-parse', '--git-path', name]).catch(() => ({ stdout: '' }))
    const relative = stdout.trim()
    if (!relative) continue
    const path = isAbsolute(relative) ? relative : resolve(cwd, relative)
    if (await access(path).then(() => true, () => false)) return true
  }
  return false
}

/**
 * Git invocation that can never block on an interactive editor — rebase
 * --continue would otherwise open one for commit messages.
 */
function gitNoEditor(cwd: string, args: string[]) {
  return execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
    env: { ...process.env, GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true' }
  })
}
