/**
 * One-shot provider queries over an ephemeral PTY session.
 *
 * A single question (e.g. "draft a commit message for this diff") is answered
 * by driving the provider's *interactive* CLI the same way a real conversation
 * turn does — never a headless `claude -p` / `codex exec`. We spin up a
 * throwaway tmux session running the CLI, wait for the TUI to settle, submit
 * the prompt with `send-keys`, watch the screen for turn completion, then read
 * the agent's final message out of the provider transcript and kill the
 * session. Nothing touches the user's live conversation session, so the query
 * never pollutes a real transcript.
 *
 * The prompt is delivered as a tmux paste buffer, so its content arrives in one
 * shot and can never be parsed as a tmux key name or flag; a separate `Enter`
 * submits the turn (see submitPromptTurn for why a 12 KB diff must be pasted
 * rather than typed, and for the settle delay Codex needs before that Enter).
 */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { projectDir, projectKey } from './project-dir'
import {
  buildProviderQueryCommand,
  findCodexSessionId,
  listCodexSessionIds,
  readLastCodexAgentMessage
} from './provider-resume'
import { readLastClaudeAssistantMessage } from './job-executor'
import { isProviderTurnComplete } from './providers/turn-completion'
import { submitPromptTurn } from './tmux-input'
import type { ProviderId } from './session-store'

const execFileAsync = promisify(execFile)
const TMUX_BIN = process.env.TMUX_BIN || 'tmux'

const DEFAULT_TIMEOUT_MS = 90_000
/** How often the ephemeral session's screen is captured while polling. */
const POLL_MS = 500
/**
 * A completion is only trusted once the turn was seen working at least once OR
 * this long has elapsed since submit — a still-idle screen right after
 * send-keys must not be mistaken for a finished turn.
 */
const MIN_COMPLETION_ELAPSED_MS = 3000

export type ProviderQueryOptions = {
  /** Working directory for the CLI. Defaults to the configured project dir. */
  cwd?: string
  /** Hard wall-clock limit for the whole query. Defaults to 90 seconds. */
  timeoutMs?: number
  /**
   * Key under which the live query terminal is exposed while the query runs
   * (see captureActiveQueryScreen). Callers pass the conversation id so the UI
   * can watch the ephemeral CLI screen for debugging.
   */
  trackKey?: string
}

/** trackKey -> tmux session name of the query currently running for it. */
const activeQueryTmuxNames = new Map<string, string>()

/**
 * Captures the current screen of the query session registered under
 * `trackKey`, or null when no query is running for it. Lets the frontend show
 * the ephemeral CLI live while a commit message is being generated.
 */
export async function captureActiveQueryScreen(trackKey: string): Promise<string | null> {
  const tmuxName = activeQueryTmuxNames.get(trackKey)
  if (!tmuxName) return null
  const screen = await captureScreen(tmuxName)
  return screen || null
}

/**
 * Runs a single prompt through the provider CLI in a throwaway PTY session and
 * resolves with the trimmed answer text. Rejects with a descriptive error on a
 * launch failure, readiness/turn timeout, or an empty transcript.
 */
export async function runProviderQuery(
  provider: ProviderId,
  prompt: string,
  options: ProviderQueryOptions = {}
): Promise<string> {
  if (!prompt.trim()) throw new Error('Prompt must not be empty')
  const cwd = options.cwd || projectDir()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const launchedAtMs = Date.now()
  const deadline = launchedAtMs + timeoutMs
  const tmuxName = `${provider}-query-${projectKey()}-${Math.random().toString(36).slice(2, 12)}`

  // The query session's transcript must be identified deterministically —
  // resolving it by newest-mtime races with any other CLI session running in
  // the same cwd (e.g. the user driving Claude Code in the main repo) and can
  // return that session's unrelated last message. Claude accepts an explicit
  // session id; Codex rollouts are isolated by excluding every pre-existing id.
  const claudeSessionId = provider === 'claude' ? randomUUID() : null
  const preexistingCodexIds =
    provider === 'codex' ? await listCodexSessionIds().catch(() => new Set<string>()) : null

  try {
    // A single string makes tmux run the command through `sh -c`, so the CLI
    // flags can never be mistaken for tmux options.
    await execFileAsync(TMUX_BIN, [
      'new-session',
      '-d',
      '-s',
      tmuxName,
      '-c',
      cwd,
      buildProviderQueryCommand(provider, claudeSessionId ?? '')
    ])
  } catch (error) {
    throw new Error(describeQueryFailure(provider, 'launch', error, timeoutMs))
  }

  if (options.trackKey) activeQueryTmuxNames.set(options.trackKey, tmuxName)
  try {
    // 1. Wait for the CLI to boot and present a settled input prompt.
    await waitForReady(provider, tmuxName, deadline, timeoutMs)

    // 2. Paste the prompt, then submit it (a settle delay before Enter keeps
    //    Codex from dropping the keystroke — see submitPromptTurn).
    await submitPromptTurn(tmuxName, prompt)
    const submittedAtMs = Date.now()

    // 3. Wait for the turn to complete and the answer to reach the query
    //    session's own transcript. A complete-looking screen alone is not
    //    trusted: right after submit the idle prompt can linger for seconds,
    //    and killing the session on that false positive loses the answer.
    return await waitForAnswer(provider, tmuxName, {
      cwd,
      launchedAtMs,
      submittedAtMs,
      deadline,
      timeoutMs,
      claudeSessionId,
      preexistingCodexIds
    })
  } finally {
    if (options.trackKey && activeQueryTmuxNames.get(options.trackKey) === tmuxName) {
      activeQueryTmuxNames.delete(options.trackKey)
    }
    await execFileAsync(TMUX_BIN, ['kill-session', '-t', tmuxName]).catch(() => {})
  }
}

/**
 * Builds the prompt that asks a provider to draft a squash commit message for
 * the work summarized by `diffStat` and sampled by `diffSample`.
 */
export function buildCommitMessagePrompt(diffStat: string, diffSample: string, baseBranch: string): string {
  return [
    `You are drafting the squash commit message for a change that will land on the "${baseBranch}" branch.`,
    '',
    'Diff stat:',
    diffStat,
    '',
    'Diff (may be truncated):',
    diffSample,
    '',
    'Write a conventional-commit style commit message:',
    '- Subject line in the imperative mood, at most 72 characters, no trailing period (e.g. "feat: add session preview workflow").',
    '- Optionally follow the subject with a blank line and a few short "- " bullet points summarizing the key changes.',
    '',
    'Return ONLY the commit message text itself — no markdown fences, no preamble such as "Commit message:", no surrounding quotes, and no explanation.'
  ].join('\n')
}

/**
 * Normalizes raw model output into a usable commit message: strips a wrapping
 * markdown fence, a leading "commit message:" style preamble, and surrounding
 * quotes; collapses runs of blank lines down to one; trims the result.
 */
export function sanitizeCommitMessage(raw: string): string {
  let message = raw.trim()

  const fenced = /^```[^\n]*\n?([\s\S]*?)\n?```$/.exec(message)
  if (fenced) message = (fenced[1] ?? '').trim()

  message = message
    .replace(
      /^(?:here(?:'|’)?s\s+|here\s+is\s+)?(?:the\s+|a\s+|your\s+)?(?:suggested\s+|proposed\s+|draft\s+)?(?:squash\s+)?commit\s+message\s*:\s*\n?/i,
      ''
    )
    .trim()

  const first = message[0] || ''
  const last = message[message.length - 1] || ''
  const isQuotePair =
    (first === last && (first === '"' || first === "'" || first === '`')) ||
    (first === '“' && last === '”') ||
    (first === '‘' && last === '’')
  if (message.length >= 2 && isQuotePair) {
    message = message.slice(1, -1).trim()
  }

  message = message.replace(/\n[ \t]*(?:\n[ \t]*){2,}/g, '\n\n')

  return message.trim()
}

/**
 * Resolves once the freshly launched CLI shows a settled input prompt, meaning
 * it is ready to accept a typed turn. Rejects if the tmux session dies or the
 * deadline passes first.
 */
async function waitForReady(
  provider: ProviderId,
  tmuxName: string,
  deadline: number,
  timeoutMs: number
): Promise<void> {
  while (Date.now() < deadline) {
    const screen = await captureScreen(tmuxName)
    if (screen) {
      if (isProviderTurnComplete(provider, screen)) return
    } else if (!(await hasTmuxSession(tmuxName))) {
      throw new Error(`${provider} CLI exited before it was ready`)
    }
    await delay(POLL_MS)
  }
  throw new Error(describeQueryFailure(provider, 'ready', null, timeoutMs))
}

type AnswerWaitContext = {
  cwd: string
  launchedAtMs: number
  submittedAtMs: number
  deadline: number
  timeoutMs: number
  claudeSessionId: string | null
  preexistingCodexIds: Set<string> | null
}

/**
 * Resolves with the agent's final message once the submitted turn completes
 * AND that message is readable from the query session's own transcript. The
 * screen heuristic (sawWorking-or-min-elapsed, mirroring the job executor)
 * only gates when the transcript is consulted — the transcript itself is the
 * proof the turn actually ran, so an idle-looking screen right after submit
 * can no longer end the query early with someone else's message.
 */
async function waitForAnswer(
  provider: ProviderId,
  tmuxName: string,
  context: AnswerWaitContext
): Promise<string> {
  let sawWorking = false
  while (Date.now() < context.deadline) {
    const screen = await captureScreen(tmuxName)
    if (screen) {
      if (!isProviderTurnComplete(provider, screen)) {
        sawWorking = true
      } else if (sawWorking || Date.now() - context.submittedAtMs >= MIN_COMPLETION_ELAPSED_MS) {
        const message = await readOwnFinalMessage(provider, context)
        if (message) return message
      }
    } else if (!(await hasTmuxSession(tmuxName))) {
      // The CLI is gone; its transcript may still hold a flushed answer.
      const message = await readOwnFinalMessage(provider, context)
      if (message) return message
      throw new Error(`${provider} CLI exited before the turn completed`)
    }
    await delay(POLL_MS)
  }
  throw new Error(describeQueryFailure(provider, 'turn', null, context.timeoutMs))
}

/**
 * Reads the agent's last message from the query session's OWN transcript and
 * nothing else: the Claude file is addressed by the session id the CLI was
 * launched with, and the Codex rollout is the strict-cwd match that did not
 * exist before launch. A concurrent session in the same cwd can therefore
 * never be mistaken for the query's answer.
 */
async function readOwnFinalMessage(
  provider: ProviderId,
  context: AnswerWaitContext
): Promise<string> {
  if (provider === 'codex') {
    const sessionId = await findCodexSessionId(
      context.cwd,
      context.launchedAtMs,
      context.preexistingCodexIds ?? undefined
    ).catch(() => null)
    if (!sessionId) return ''
    const message = await readLastCodexAgentMessage(context.cwd, sessionId).catch(() => undefined)
    return message?.trim() || ''
  }

  if (!context.claudeSessionId) return ''
  const message = await readLastClaudeAssistantMessage(context.cwd, context.claudeSessionId, {
    requireSessionFile: true
  }).catch(() => undefined)
  return message?.trim() || ''
}

async function captureScreen(tmuxName: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(TMUX_BIN, ['capture-pane', '-p', '-t', tmuxName])
    return stdout
  } catch {
    return ''
  }
}

async function hasTmuxSession(tmuxName: string): Promise<boolean> {
  try {
    await execFileAsync(TMUX_BIN, ['has-session', '-t', tmuxName])
    return true
  } catch {
    return false
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
}

function describeQueryFailure(
  provider: ProviderId,
  phase: 'launch' | 'ready' | 'turn',
  error: unknown,
  timeoutMs: number
): string {
  if (phase === 'ready') return `${provider} query timed out waiting for the CLI to start (${timeoutMs}ms)`
  if (phase === 'turn') return `${provider} query timed out after ${timeoutMs}ms`

  if (error && typeof error === 'object') {
    const failure = error as { code?: unknown; stderr?: unknown; message?: string }
    if (failure.code === 'ENOENT') {
      return `${provider} CLI binary not found — check CLAUDE_BIN / CODEX_CLI_PATH / CODEX_BIN or PATH`
    }
    const stderrTail =
      typeof failure.stderr === 'string'
        ? failure.stderr.trim().split('\n').slice(-5).join('\n').trim()
        : ''
    const detail = stderrTail || failure.message || ''
    return `${provider} query failed to launch${detail ? `: ${detail}` : ''}`
  }
  return `${provider} query failed to launch: ${String(error)}`
}

