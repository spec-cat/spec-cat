import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { spawn, type IPty } from 'node-pty'
import { getProjectDir } from './projectDir'
import { getClaudeCliPath } from './claude'
import { findLatestCodexSessionIdForCwd } from './codexRollout'
import { findLatestClaudeSessionIdForCwd } from './claudeSession'
import { prepareCliHookInjection, writeClaudeLocalSettings, writeCodexHooks } from './cliHookInjection'
import { resolveCodexHomeForSpawn } from './codexProvider'

export interface TerminalHookContext {
  enabled: boolean
  providerId: string
  conversationId: string
  jobId: string
  requestId: string
}

const MAX_BUFFER_LENGTH = 200_000
const DEFAULT_COLS = 100
const DEFAULT_ROWS = 30
const SESSION_CAPTURE_INTERVAL_MS = 400
// Poll quickly for this long to catch the common case (CLIs that write the
// session file at startup) with minimal latency...
const SESSION_CAPTURE_FAST_WINDOW_MS = 12_000
// ...then fall back to a slower cadence while the session stays alive, so a CLI
// that only writes its session file once the first prompt is submitted is still
// captured for later resume.
const SESSION_CAPTURE_SLOW_INTERVAL_MS = 2_000
// Absolute ceiling so we never poll a live-but-fileless session forever (e.g. a
// provider whose on-disk session format we can't match); generous enough to
// span a slow first turn.
const SESSION_CAPTURE_MAX_MS = 5 * 60_000
// How long an exited session is kept so a reconnecting client can still replay
// its final output before its (up to MAX_BUFFER_LENGTH) buffer is evicted.
const DEAD_SESSION_TTL_MS = 5 * 60_000

export interface TerminalSession {
  id: string
  cwd: string
  createdAt: string
  updatedAt: string
  process: IPty
  buffer: string
  cols: number
  rows: number
  exitCode: number | null
  onDataCallbacks: Set<(data: string) => void>
  onExitCallbacks: Set<(exitCode: number) => void>
}

const sessions = new Map<string, TerminalSession>()

function detectCodexCliPath(): string | null {
  if (typeof process.env.CODEX_CLI_PATH === 'string' && process.env.CODEX_CLI_PATH.length > 0 && existsSync(process.env.CODEX_CLI_PATH)) {
    return process.env.CODEX_CLI_PATH
  }

  const candidates = [
    join(process.env.HOME || '', '.local/bin/codex'),
    '/usr/local/bin/codex',
    '/usr/bin/codex',
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  try {
    const whichResult = execSync('which codex 2>/dev/null', { encoding: 'utf-8' }).trim()
    return whichResult && existsSync(whichResult) ? whichResult : null
  } catch {
    return null
  }
}

function getCodexCliPath(): string {
  const cliPath = detectCodexCliPath()
  if (!cliPath) {
    throw new Error('Codex CLI not found. Install codex CLI or set CODEX_CLI_PATH.')
  }
  return cliPath
}

function resolveTerminalCommand(
  providerId?: string,
  modelKey?: string,
  resumeSessionId?: string,
): { command: string; args: string[] } {
  if (providerId === 'codex') {
    // `codex resume <SESSION_ID>` re-attaches the persisted interactive session
    // so a server restart continues the same Codex thread instead of starting
    // a fresh one. Flags follow the positional session id.
    const args = resumeSessionId
      ? ['resume', resumeSessionId, '--dangerously-bypass-approvals-and-sandbox']
      : ['--dangerously-bypass-approvals-and-sandbox']
    if (modelKey) {
      args.push('--model', modelKey)
    }
    return {
      command: getCodexCliPath(),
      args,
    }
  }

  const args = ['--dangerously-skip-permissions', '--settings', '{"tui":"classic"}']
  if (resumeSessionId) {
    args.unshift('--resume', resumeSessionId)
  }
  return {
    command: getClaudeCliPath(),
    args,
  }
}

function resolveSafeCwd(cwd?: string): string {
  const fallback = getProjectDir() || process.cwd()
  const candidate = typeof cwd === 'string' && cwd.trim().length > 0 ? cwd : fallback

  try {
    if (!existsSync(candidate)) return fallback
    return realpathSync(candidate)
  } catch {
    return fallback
  }
}

function trimBuffer(buffer: string): string {
  if (buffer.length <= MAX_BUFFER_LENGTH) return buffer
  return buffer.slice(buffer.length - MAX_BUFFER_LENGTH)
}

export function getTerminalSession(sessionId: string): TerminalSession | undefined {
  return sessions.get(sessionId)
}

export function getOrCreateTerminalSession(options: {
  sessionId: string
  cwd?: string
  cols?: number
  rows?: number
  providerId?: string
  modelKey?: string
  resumeSessionId?: string
  hookContext?: TerminalHookContext
  onProviderSessionId?: (providerSessionId: string) => void
}): TerminalSession {
  const existing = sessions.get(options.sessionId)
  if (existing && existing.exitCode === null) {
    existing.updatedAt = new Date().toISOString()
    return existing
  }

  const cwd = resolveSafeCwd(options.cwd)
  const { command, args } = resolveTerminalCommand(options.providerId, options.modelKey, options.resumeSessionId)

  // Optional CLI hook injection so a Stop hook fires into the conversation's
  // spool file — lets a server-side driver detect turn completion without a
  // connected client. Additive: terminal-ws callers don't pass hookContext.
  let hookEnv: Record<string, string> = {}
  if (options.hookContext?.enabled) {
    const injection = prepareCliHookInjection({
      providerId: options.hookContext.providerId,
      conversationId: options.hookContext.conversationId,
      jobId: options.hookContext.jobId,
      requestId: options.hookContext.requestId,
    })
    hookEnv = { ...injection.env }
    if (options.providerId === 'codex') {
      const codexHome = resolveCodexHomeForSpawn(false, options.hookContext.conversationId)
      if (codexHome) {
        writeCodexHooks(codexHome, injection.runnerPath)
        hookEnv.CODEX_HOME = codexHome
      }
      args.push('--dangerously-bypass-hook-trust')
    } else {
      writeClaudeLocalSettings(cwd, injection.runnerPath)
    }
  }
  const cols = Number.isFinite(options.cols) && options.cols! > 0 ? Math.floor(options.cols!) : DEFAULT_COLS
  const rows = Number.isFinite(options.rows) && options.rows! > 0 ? Math.floor(options.rows!) : DEFAULT_ROWS

  const spawnedAtMs = Date.now()

  const ptyProcess = spawn(command, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      SPEC_CAT_TERMINAL: '1',
      HOME: process.env.HOME || homedir(),
      PWD: cwd,
      ...hookEnv,
    },
  })

  const session: TerminalSession = {
    id: options.sessionId,
    cwd,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    process: ptyProcess,
    buffer: '',
    cols,
    rows,
    exitCode: null,
    onDataCallbacks: new Set(),
    onExitCallbacks: new Set(),
  }

  ptyProcess.onData((data) => {
    session.buffer = trimBuffer(session.buffer + data)
    session.updatedAt = new Date().toISOString()
    for (const callback of session.onDataCallbacks) {
      callback(data)
    }
  })

  ptyProcess.onExit(({ exitCode }) => {
    session.exitCode = exitCode
    session.updatedAt = new Date().toISOString()
    for (const callback of session.onExitCallbacks) {
      callback(exitCode)
    }
    // Evict the dead session after a grace period so its buffer doesn't linger
    // forever for a conversation that is never reopened. Guard against deleting
    // a fresh session that already replaced this one under the same id.
    setTimeout(() => {
      const current = sessions.get(options.sessionId)
      if (current === session && current.exitCode !== null) {
        sessions.delete(options.sessionId)
      }
    }, DEAD_SESSION_TTL_MS)
  })

  sessions.set(options.sessionId, session)

  // For a fresh session (no resume), the CLI writes a session file with a new id
  // shortly after start (Codex rollout / Claude project jsonl). Poll for it so
  // the conversation can persist `providerSessionId` and resume the same session
  // after a restart. On a resume spawn we keep the existing id.
  if (!options.resumeSessionId && options.onProviderSessionId) {
    const find = options.providerId === 'codex'
      ? findLatestCodexSessionIdForCwd
      : findLatestClaudeSessionIdForCwd
    captureProviderSessionId(session, cwd, spawnedAtMs, find, options.onProviderSessionId)
  }

  return session
}

function captureProviderSessionId(
  session: TerminalSession,
  cwd: string,
  afterMs: number,
  find: (cwd: string, afterMs: number) => string | null,
  onProviderSessionId: (providerSessionId: string) => void,
): void {
  const deadline = afterMs + SESSION_CAPTURE_MAX_MS
  const fastUntil = afterMs + SESSION_CAPTURE_FAST_WINDOW_MS
  const attempt = () => {
    const sessionId = find(cwd, afterMs)
    if (sessionId) {
      try {
        onProviderSessionId(sessionId)
      } catch {
        // Persistence is best-effort.
      }
      return
    }
    // Stop once the process has exited (the find above was the final attempt) or
    // the absolute window elapsed — don't keep polling a dead/fileless session.
    if (session.exitCode !== null || Date.now() >= deadline) return
    const nextInterval = Date.now() < fastUntil
      ? SESSION_CAPTURE_INTERVAL_MS
      : SESSION_CAPTURE_SLOW_INTERVAL_MS
    setTimeout(attempt, nextInterval)
  }
  setTimeout(attempt, SESSION_CAPTURE_INTERVAL_MS)
}

export function subscribeTerminalSession(
  session: TerminalSession,
  handlers: {
    onData: (data: string) => void
    onExit: (exitCode: number) => void
  },
): () => void {
  session.onDataCallbacks.add(handlers.onData)
  session.onExitCallbacks.add(handlers.onExit)

  return () => {
    session.onDataCallbacks.delete(handlers.onData)
    session.onExitCallbacks.delete(handlers.onExit)
  }
}

export function writeTerminalInput(sessionId: string, data: string): boolean {
  const session = sessions.get(sessionId)
  if (!session || session.exitCode !== null) return false
  session.process.write(data)
  session.updatedAt = new Date().toISOString()
  return true
}

export function resizeTerminal(sessionId: string, cols: number, rows: number): boolean {
  const session = sessions.get(sessionId)
  if (!session || session.exitCode !== null) return false
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) return false
  session.cols = Math.floor(cols)
  session.rows = Math.floor(rows)
  session.process.resize(session.cols, session.rows)
  session.updatedAt = new Date().toISOString()
  return true
}

export function buildTerminalSessionId(conversationId: string): string {
  return `conversation:${conversationId}`
}

/**
 * Immediately kill and evict a terminal session. Used by ephemeral, one-shot
 * sessions (e.g. interactive commit-message generation) that must not linger
 * for the normal dead-session TTL.
 */
export function disposeTerminalSession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (!session) return
  try {
    session.process.kill()
  } catch {
    // Process may already be gone.
  }
  sessions.delete(sessionId)
}
