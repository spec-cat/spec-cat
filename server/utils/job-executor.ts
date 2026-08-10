/**
 * Tmux-backed JobExecutor: submits browserless job prompts into an existing
 * conversation's tmux session and detects turn completion.
 *
 * Completion detection per provider:
 * - claude: a CLI hook monitor tails the session's hook spool (armed at
 *   submit; requireArmedPromptSubmit guards against stray Stops from earlier
 *   turns) and finishes on the Stop hook (~100ms latency). Tool hooks are
 *   forwarded as job 'tool' events. Screen scraping stays on as a fallback.
 * - codex: no safe hook injection (see cli-hooks.ts), so a 1s capture-pane
 *   poll watches isProviderTurnComplete. A completion is only accepted after
 *   the turn was seen working at least once OR 3s have elapsed since submit,
 *   so a still-idle screen right after send-keys can't be mistaken for a
 *   finished turn.
 *
 * On finish the last agent message is read (best-effort) as the job result:
 * claude from the newest Claude project JSONL for the session cwd, codex from
 * the matching rollout under CODEX_HOME/sessions.
 */
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readdir, readFile, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import { readStoredSession } from './session-store'
import { getCliHookSpoolPath, providerSupportsCliHooks } from './cli-hooks'
import { startCliHookMonitor, type CliHookMonitor } from './cli-hook-monitor'
import { encodeClaudeProjectDir, readLastCodexAgentMessage } from './provider-resume'
import { isProviderTurnComplete } from './providers/turn-completion'
import { submitPromptTurn } from './tmux-input'
import {
  createJobQueue,
  type EmitJobEvent,
  type JobExecutor,
  type JobQueue,
  type JobRecord,
  type JobResult
} from './job-queue'

const TMUX_BIN = process.env.TMUX_BIN || 'tmux'
const SCREEN_POLL_MS = 1000
const MIN_COMPLETION_ELAPSED_MS = 3000
const execFileAsync = promisify(execFile)

type JobRunContext = {
  tmuxName: string
  cwd: string
  providerSessionId?: string
  submittedAtMs: number
  armed: boolean
  hookMonitor: CliHookMonitor | null
  /** Resolved by the claude Stop hook; null for hook-less providers. */
  hookStop: Promise<void> | null
}

export function createTmuxJobExecutor(): JobExecutor {
  const contexts = new Map<string, JobRunContext>()

  const submit = async (job: JobRecord, emit: EmitJobEvent) => {
    const session = await readStoredSession(job.sessionId)
    if (!session) throw new Error(`Session not found: ${job.sessionId}`)
    if (session.archived) throw new Error('Session is archived')
    if (session.finalized) throw new Error('Session is finalized')
    if (!(await hasTmuxSession(session.tmuxName))) {
      throw new Error(
        `tmux session "${session.tmuxName}" is not running; open the conversation in the terminal first`
      )
    }

    const context: JobRunContext = {
      tmuxName: session.tmuxName,
      cwd: session.cwd,
      providerSessionId: session.providerSessionId,
      submittedAtMs: 0,
      armed: false,
      hookMonitor: null,
      hookStop: null
    }
    contexts.set(job.id, context)

    // Deterministic completion for claude: tail the hook spool. The monitor
    // starts at the current spool end, and arming happens right before
    // send-keys, so only hooks from this job's turn count.
    if (providerSupportsCliHooks(job.provider)) {
      context.hookStop = new Promise<void>((resolve) => {
        context.hookMonitor = startCliHookMonitor({
          spoolPath: getCliHookSpoolPath(job.sessionId),
          isArmed: () => context.armed,
          requireArmedPromptSubmit: true,
          onToolEvent: (record, failed) => {
            emit('tool', {
              hookEventName: record.hookEventName,
              failed,
              tool: extractToolName(record.payload)
            })
          },
          onStop: () => resolve()
        })
      })
    }

    context.armed = true
    context.submittedAtMs = Date.now()
    // Pastes the prompt (multi-line included) and submits it; the settle delay
    // before Enter keeps Codex from dropping the keystroke and leaving the turn
    // unsubmitted (see submitPromptTurn).
    await submitPromptTurn(context.tmuxName, job.prompt)
  }

  const waitForCompletion = async (
    job: JobRecord,
    _emit: EmitJobEvent,
    signal: AbortSignal
  ): Promise<JobResult | undefined> => {
    const context = contexts.get(job.id)
    if (!context) throw new Error('Job was never submitted')

    try {
      const watchers = [pollScreenForCompletion(job, context, signal)]
      if (context.hookStop) watchers.push(context.hookStop)
      await Promise.race(watchers)

      const lastAssistantMessage = job.provider === 'claude'
        ? await readLastClaudeAssistantMessage(context.cwd, context.providerSessionId).catch(() => undefined)
        : await readLastCodexAgentMessage(context.cwd, context.providerSessionId).catch(() => undefined)
      return lastAssistantMessage ? { lastAssistantMessage } : undefined
    } finally {
      disposeContext(job.id)
    }
  }

  const cancel = async (job: JobRecord) => {
    const context = contexts.get(job.id)
    disposeContext(job.id)
    // The abort race may already have disposed the context; fall back to the
    // stored session so the CLI still receives the interrupt.
    const tmuxName = context?.tmuxName
      || (await readStoredSession(job.sessionId).catch(() => null))?.tmuxName
    if (!tmuxName) return
    await execFileAsync(TMUX_BIN, ['send-keys', '-t', tmuxName, 'Escape']).catch(() => {})
  }

  const disposeContext = (jobId: string) => {
    const context = contexts.get(jobId)
    if (!context) return
    context.armed = false
    context.hookMonitor?.stop()
    contexts.delete(jobId)
  }

  return { submit, waitForCompletion, cancel }
}

/**
 * Resolves once the provider's screen reports the turn as complete. Requires
 * either one 'working' observation or MIN_COMPLETION_ELAPSED_MS since submit
 * before accepting, to avoid an instant false-positive from a screen that has
 * not started rendering the turn yet.
 */
function pollScreenForCompletion(job: JobRecord, context: JobRunContext, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined
    let sawWorking = false

    const onAbort = () => {
      if (timer) clearTimeout(timer)
      reject(new Error('Job aborted'))
    }
    signal.addEventListener('abort', onAbort, { once: true })

    const settle = (fn: () => void) => {
      signal.removeEventListener('abort', onAbort)
      fn()
    }

    const tick = async () => {
      if (signal.aborted) return
      const screen = await captureScreen(context.tmuxName)
      if (signal.aborted) return

      if (screen) {
        const complete = isProviderTurnComplete(job.provider, screen)
        if (!complete) {
          sawWorking = true
        } else if (sawWorking || Date.now() - context.submittedAtMs >= MIN_COMPLETION_ELAPSED_MS) {
          return settle(resolve)
        }
      } else if (!(await hasTmuxSession(context.tmuxName))) {
        return settle(() => reject(new Error('tmux session died while the job was running')))
      }

      timer = setTimeout(() => { void tick() }, SCREEN_POLL_MS)
      timer.unref?.()
    }

    void tick()
  })
}

async function hasTmuxSession(tmuxName: string) {
  try {
    await execFileAsync(TMUX_BIN, ['has-session', '-t', tmuxName])
    return true
  } catch {
    return false
  }
}

async function captureScreen(tmuxName: string) {
  try {
    const { stdout } = await execFileAsync(TMUX_BIN, ['capture-pane', '-p', '-t', tmuxName])
    return stdout
  } catch {
    return ''
  }
}

function extractToolName(payload: Record<string, unknown> | null | undefined) {
  if (!payload || typeof payload !== 'object') return undefined
  const name = (payload as { tool_name?: unknown }).tool_name
  return typeof name === 'string' ? name : undefined
}

/**
 * Best-effort: reads the last assistant message text from the Claude project
 * JSONL for `cwd`. Prefers the recorded provider session file; otherwise the
 * newest session file in the project directory. With `requireSessionFile` the
 * newest-file fallback is disabled — callers that know the exact session id
 * (one-shot queries) must never read a concurrent session's transcript.
 */
export async function readLastClaudeAssistantMessage(
  cwd: string,
  providerSessionId?: string,
  options: { requireSessionFile?: boolean } = {}
): Promise<string | undefined> {
  const home = process.env.CLAUDE_CONFIG_DIR || join(process.env.HOME || homedir(), '.claude')
  const projectDir = join(home, 'projects', encodeClaudeProjectDir(cwd))

  let filePath: string | null = null
  if (providerSessionId && /^[0-9a-f-]{36}$/i.test(providerSessionId)) {
    const candidate = join(projectDir, `${providerSessionId}.jsonl`)
    if (await stat(candidate).then(() => true, () => false)) filePath = candidate
  }
  if (!filePath && options.requireSessionFile) return undefined
  if (!filePath) filePath = await newestJsonlFile(projectDir)
  if (!filePath) return undefined

  const raw = await readFile(filePath, 'utf8')
  const lines = raw.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim()
    if (!line) continue
    try {
      const entry = JSON.parse(line) as {
        type?: string
        message?: { role?: string; content?: unknown }
      }
      if (entry.type !== 'assistant' || entry.message?.role !== 'assistant') continue
      const text = extractAssistantText(entry.message.content)
      if (text) return text
    } catch {
      continue
    }
  }
  return undefined
}

function extractAssistantText(content: unknown): string | undefined {
  if (typeof content === 'string') return content.trim() || undefined
  if (!Array.isArray(content)) return undefined
  const text = content
    .filter((block): block is { type: string; text: string } => (
      Boolean(block) && typeof block === 'object'
      && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string'
    ))
    .map((block) => block.text)
    .join('\n')
    .trim()
  return text || undefined
}

async function newestJsonlFile(dir: string): Promise<string | null> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
  let newest: { path: string; mtime: number } | null = null
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
    const path = join(dir, entry.name)
    const mtime = await stat(path).then((s) => s.mtimeMs, () => null)
    if (mtime === null) continue
    if (!newest || mtime > newest.mtime) newest = { path, mtime }
  }
  return newest?.path ?? null
}

let sharedQueue: JobQueue | null = null

/** Process-wide job queue backed by the real tmux executor. */
export function getJobQueue(): JobQueue {
  if (!sharedQueue) {
    sharedQueue = createJobQueue({ executor: createTmuxJobExecutor() })
  }
  return sharedQueue
}
