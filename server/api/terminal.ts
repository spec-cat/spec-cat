import type { IPty } from 'node-pty'
import { spawn } from 'node-pty'
import type { Peer } from 'crossws'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  type ProviderId,
  appendSessionLog,
  isSessionDeleted,
  readStoredSession,
  summarizePromptTitle,
  writeStoredSession
} from '../utils/session-store'
import {
  recordTerminalAttach,
  recordTerminalDetach,
  recordTerminalInput,
  recordTerminalOutput,
  recordTerminalSubmit,
  recordTurnCompleted,
  clearTerminalActivity
} from '../utils/runtime-activity'
import {
  type CliHookRecord,
  getCliHookSpoolPath,
  prepareClaudeHooks,
  providerSupportsCliHooks
} from '../utils/cli-hooks'
import { startCliHookMonitor, type CliHookMonitor } from '../utils/cli-hook-monitor'
import {
  buildProviderCommand,
  findClaudeSessionId,
  findCodexSessionId
} from '../utils/provider-resume'
import { createSessionWorktree, deleteSessionWorktree } from '../utils/worktree'
import { autoCommitTurn } from '../utils/auto-commit'
import {
  autoCommitAndSyncPreview,
  followSessionBranch,
  syncPreviewBranch
} from '../utils/session-integration'
import { startWorktreeCommitWatcher, type WorktreeCommitWatcher } from '../utils/worktree-commit-watcher'
import { createTurnMonitor, type TurnMonitor } from '../utils/turn-monitor'
import { isProviderTurnComplete } from '../utils/providers/turn-completion'
import { projectDir as defaultProjectDir, projectKey } from '../utils/project-dir'
import { submitPromptTurn } from '../utils/tmux-input'

type TerminalMessage = {
  type?: string
  data?: string
  sessionId?: string
  provider?: ProviderId
  baseBranch?: string
  /** Spec feature this conversation is opened for (set once, at creation). */
  featureId?: string
  cols?: number
  rows?: number
}

type TerminalSession = {
  id: string
  provider: ProviderId
  tmuxName: string
  cwd: string
  cliBin: string
  // Every peer gets its own tmux client. tmux only emits its terminal
  // initialization (alternate screen, mouse tracking, full redraw) when a
  // client attaches, so a freshly connected xterm must attach its own client
  // or scrolling and rendering state are missing until the next resize.
  peers: Map<Peer, IPty>
  loggerPeer: Peer | null
  cols: number
  rows: number
  cleanupTimer: NodeJS.Timeout | null
  turnMonitor: TurnMonitor
  /** Deterministic turn detection via CLI hooks; null for hook-less providers. */
  hookMonitor: CliHookMonitor | null
  /** Watches the worktree HEAD so sc/preview and the git graph follow commits. */
  gitWatcher: WorktreeCommitWatcher | null
  /**
   * Backstop poller for hook-less providers (codex): commits the turn's work
   * when the provider goes idle with an uncommitted tree, in case the
   * screen-scrape turn detector missed the completion. null for hook-capable
   * providers, which get a deterministic Stop signal instead.
   */
  idleCommitTimer: NodeJS.Timeout | null
}

type ProviderSessionCapture = {
  timer: NodeJS.Timeout | null
  cancelled: boolean
}

const DEFAULT_COLS = 100
const DEFAULT_ROWS = 30
const SESSION_TTL_MS = Number(
  process.env.TERMINAL_SESSION_TTL_MS
  || process.env.CLAUDE_SESSION_TTL_MS
  || 30 * 60 * 1000
)
const TMUX_BIN = process.env.TMUX_BIN || 'tmux'
const PROVIDER_SESSION_POLL_MS = 2000
const PROVIDER_SESSION_POLL_TIMEOUT_MS = 2 * 60 * 1000
// How often the hook-less idle backstop checks for an uncommitted turn.
const IDLE_COMMIT_POLL_MS = 3000
const execFileAsync = promisify(execFile)

const sessions = new Map<string, TerminalSession>()
const sessionCreations = new Map<string, Promise<TerminalSession>>()
const providerSessionCaptures = new Map<string, ProviderSessionCapture>()

export default defineWebSocketHandler({
  open(peer) {
    sendControl(peer, { type: 'hello' })
  },

  async message(peer, message) {
    const text = message.text()
    const parsed = parseTerminalMessage(text)

    if (parsed?.type === 'attach') {
      try {
        const session = await attachSession(
          peer,
          parsed.sessionId,
          parsed.provider,
          parsed.baseBranch,
          parsed.featureId,
          parsed.cols,
          parsed.rows
        )
        sendControl(peer, { type: 'attached', sessionId: session.id })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        peer.send(`\r\n[failed to attach tmux session: ${message}]\r\n`)
        peer.close()
      }
      return
    }

    const session = getPeerSession(peer)
    if (!session) {
      peer.send('\r\n[terminal session is not attached]\r\n')
      return
    }

    const pty = session.peers.get(peer)
    if (!pty) {
      peer.send('\r\n[terminal session is not attached]\r\n')
      return
    }

    if (parsed?.type === 'resize') {
      const cols = clampDimension(parsed.cols, DEFAULT_COLS)
      const rows = clampDimension(parsed.rows, DEFAULT_ROWS)
      if (cols === pty.cols && rows === pty.rows) return

      session.cols = cols
      session.rows = rows
      pty.resize(cols, rows)
      return
    }

    if (parsed?.type === 'submit' && typeof parsed.data === 'string' && parsed.data) {
      // Codex can treat a CR appended to pasted text as modified Enter, leaving
      // the prompt on a new line without submitting it. The shared tmux helper
      // pastes first, waits for the input widget to settle, then sends a real
      // Enter key as a separate event.
      recordTerminalInput(session.id, `${parsed.data}\r`)
      session.turnMonitor.submitted()
      try {
        await submitPromptTurn(session.tmuxName, parsed.data)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        peer.send(`\r\n[failed to submit terminal prompt: ${message}]\r\n`)
      }
      return
    }

    const input = parsed?.type === 'input' && typeof parsed.data === 'string' ? parsed.data : text
    if (input) {
      recordTerminalInput(session.id, input)
      if (input.includes('\r') || input.includes('\n')) {
        session.turnMonitor.submitted()
      }
      pty.write(input)
    }
  },

  close(peer) {
    detachPeer(peer)
  }
})

async function attachSession(
  peer: Peer,
  requestedSessionId?: string,
  requestedProvider?: ProviderId,
  requestedBaseBranch?: string,
  requestedFeatureId?: string,
  requestedCols?: number,
  requestedRows?: number
) {
  const id = normalizeSessionId(requestedSessionId)
  if (requestedSessionId && !id) throw new Error('Invalid session ID')
  const session = await getOrCreateSession(id, requestedProvider, requestedBaseBranch, requestedFeatureId)

  // Revive the tmux session if it died while the metadata stayed cached,
  // resuming the recorded provider conversation when one was captured.
  const revivedAtMs = Date.now()
  const revived = await ensureTmuxSession(session.tmuxName, session.cwd, async () => {
    // Only reached when tmux is actually being recreated: refresh the hook
    // settings in the worktree before the CLI starts.
    prepareCliHooksSafely(session.provider, session.cwd, session.id)
    const stored = await readStoredSession(session.id).catch(() => null)
    return resolveLaunchCommand(session.provider, stored?.providerSessionId)
  })
  if (revived) startProviderSessionCapture(session.id, session.provider, session.cwd, revivedAtMs)

  session.cols = clampDimension(requestedCols, session.cols)
  session.rows = clampDimension(requestedRows, session.rows)

  const previous = session.peers.get(peer)
  if (previous) {
    session.peers.delete(peer)
    try { previous.kill() } catch {}
  }

  spawnPeerClient(session, peer)
  peer.context.sessionId = session.id
  recordTerminalAttach(session.id)

  if (session.cleanupTimer) {
    clearTimeout(session.cleanupTimer)
    session.cleanupTimer = null
  }

  return session
}

function spawnPeerClient(session: TerminalSession, peer: Peer) {
  const pty = spawn(TMUX_BIN, ['attach-session', '-t', session.tmuxName], {
    name: 'xterm-256color',
    cols: session.cols,
    rows: session.rows,
    cwd: session.cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    }
  })

  session.peers.set(peer, pty)
  if (!session.loggerPeer) session.loggerPeer = peer

  pty.onData((data) => {
    // Activity, turn detection, and the session log are session-wide
    // concerns; feed them from a single client so peers don't duplicate them.
    if (session.loggerPeer === peer) {
      recordTerminalOutput(session.id)
      session.turnMonitor.output()
      appendOutput(session, data)
    }
    peer.send(data)
  })

  pty.onExit(({ exitCode, signal }) => {
    if (session.peers.get(peer) !== pty) return

    session.peers.delete(peer)
    promoteLoggerPeer(session)
    peer.context.sessionId = undefined
    recordTerminalDetach(session.id)

    const message = `\r\n[tmux detached: code=${exitCode}, signal=${signal ?? 'none'}]\r\n`
    appendOutput(session, message)
    peer.send(message)
    peer.close()

    if (session.peers.size === 0) scheduleSessionCleanup(session)
  })

  return pty
}

async function getOrCreateSession(
  id?: string | null,
  provider?: ProviderId,
  baseBranch?: string,
  featureId?: string
) {
  if (!id) return createSession(undefined, provider, baseBranch, featureId)
  const existing = sessions.get(id)
  if (existing) return existing
  const pending = sessionCreations.get(id)
  if (pending) return pending
  const creation = createSession(id, provider, baseBranch, featureId)
  sessionCreations.set(id, creation)
  try {
    return await creation
  } finally {
    if (sessionCreations.get(id) === creation) sessionCreations.delete(id)
  }
}

async function createSession(
  requestedSessionId?: string,
  requestedProvider: ProviderId = 'claude',
  requestedBaseBranch?: string,
  requestedFeatureId?: string
): Promise<TerminalSession> {
  const id = requestedSessionId || generateConversationId()
  const stored = await readStoredSession(id)
  const now = new Date().toISOString()
  const provider = stored?.provider || requestedProvider
  if (stored?.finalized) throw new Error('This conversation has been finalized')
  // A single string makes tmux run the command via `sh -c`, so the CLI
  // flags can never be mistaken for tmux options.
  const cliBin = buildProviderCommand(provider)
  const tmuxName = stored?.tmuxName || `${provider}-web-${projectKey()}-${sanitizeTmuxName(id)}`
  const projectDir = stored?.projectDir || defaultProjectDir()
  const worktree = stored ? null : await createSessionWorktree(projectDir, id, requestedBaseBranch, requestedFeatureId)
  const cwd = stored?.cwd || worktree!.worktreePath

  let tmuxCreated = false
  const tmuxLaunchedAtMs = Date.now()
  try {
    // When the stored session's tmux died (reboot, tmux kill-server), relaunch
    // the CLI with the captured provider session id so the conversation
    // resumes instead of starting over.
    // Hooks must be in place before the CLI launches so the very first turn
    // already reports through the spool.
    prepareCliHooksSafely(provider, cwd, id)
    tmuxCreated = await ensureTmuxSession(tmuxName, cwd, () =>
      resolveLaunchCommand(provider, stored?.providerSessionId)
    )
    // Spread the stored session first so metadata written by other flows
    // (title, archive flags, preview/finalize state) survives a reattach.
    await writeStoredSession({
      ...stored,
      id,
      provider,
      tmuxName,
      cwd,
      cliBin,
      providerSessionId: stored?.providerSessionId,
      // Set once, when the conversation is created from the spec browser: it is
      // the durable feature link before any feature branch exists, so a second
      // action on the same feature reuses this conversation instead of opening
      // another one.
      featureId: stored?.featureId || requestedFeatureId,
      projectDir: stored?.projectDir || worktree?.projectDir,
      worktreeBranch: stored?.worktreeBranch || worktree?.branch,
      baseBranch: stored?.baseBranch || worktree?.baseBranch,
      createdAt: stored?.createdAt || now,
      updatedAt: now
    })
  } catch (error) {
    if (worktree) {
      await deleteSessionWorktree({
        projectDir: worktree.projectDir,
        worktreePath: worktree.worktreePath,
        branch: worktree.branch
      }).catch(() => {})
    }
    throw error
  }

  const turnMonitor = createTurnMonitor({
    provider,
    captureScreen: () => captureSessionScreen(tmuxName),
    onComplete: async () => { await commitTurnAndNotify(session) },
    onError: (error) => {
      const detail = error instanceof Error ? error.message : String(error)
      const message = `\r\n[auto-commit failed: ${detail}]\r\n`
      appendOutput(session, message)
      for (const peer of session.peers.keys()) peer.send(message)
    }
  })

  // Deterministic turn detection for hook-capable providers. The spool tailer
  // reports within ~100ms of the CLI hook firing; the quiet-window
  // TurnMonitor stays as fallback for hook-less turns, and claimTurn() inside
  // the TurnMonitor guarantees only one of the two paths auto-commits.
  const hookMonitor = providerSupportsCliHooks(provider)
    ? startCliHookMonitor({
        spoolPath: getCliHookSpoolPath(id),
        requireArmedPromptSubmit: true,
        shouldDispose: () => isSessionDeleted(id),
        onPromptSubmit: (record) => {
          recordTerminalSubmit(id)
          turnMonitor.submitted()
          void maybeAutoTitleSession(id, record)
        },
        onToolEvent: () => {
          recordTerminalOutput(id)
          turnMonitor.output()
        },
        onStop: () => {
          // Flip the runtime classifier to idle first so state polling is
          // accurate even while the auto-commit below is still running.
          recordTurnCompleted(id)
          void turnMonitor.complete()
        }
      })
    : null

  // Follow worktree commits and branch switches regardless of turn detection:
  // any commit moves HEAD and any `git checkout -b` (what a speckit step does
  // when it opens a feature) moves the branch. Re-sync sc/preview onto the new
  // HEAD, adopt the new branch, and tell attached clients to refresh the git
  // graph immediately instead of waiting for the client-side poll.
  const gitWatcher = startWorktreeCommitWatcher({
    cwd,
    shouldDispose: () => isSessionDeleted(id),
    onChange: async (state, previous) => {
      if (state.branch !== previous.branch) await followSessionBranchAndNotify(session)
      try {
        const stored = id ? await readStoredSession(id) : null
        if (stored?.previewBranch && stored.projectDir) {
          await syncPreviewBranch(stored.projectDir, stored.cwd, stored.previewBranch)
        }
      } catch {
        // Preview sync is best-effort; the graph refresh below still fires.
      }
      for (const peer of session.peers.keys()) sendControl(peer, { type: 'git-changed' })
    }
  })

  const session: TerminalSession = {
    id,
    provider,
    tmuxName,
    cwd,
    cliBin,
    peers: new Map(),
    loggerPeer: null,
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    cleanupTimer: null,
    turnMonitor,
    hookMonitor,
    gitWatcher,
    idleCommitTimer: null
  }

  // Hook-less providers (codex) detect turn-end by scraping the screen, which
  // can miss a completion and strand the turn's changes uncommitted until a
  // manual toggle/rebase. Back it up: whenever the provider is idle (its screen
  // shows the turn finished) with an uncommitted tree, commit and sync. This
  // reads tmux/git directly, so it fires even if the turn monitor's own signals
  // were missed. Hook-capable providers get a deterministic Stop hook and skip it.
  if (!providerSupportsCliHooks(provider)) {
    session.idleCommitTimer = setInterval(() => void idleCommitBackstop(session), IDLE_COMMIT_POLL_MS)
    session.idleCommitTimer.unref?.()
  }

  sessions.set(id, session)

  // The HEAD watcher only starts here, and its first read is a baseline — so a
  // branch the CLI switched to while nothing was attached (tmux keeps running
  // detached) would go unnoticed. Reconcile once on attach.
  await followSessionBranch(id).catch(() => {})

  // Capture the provider-side conversation id in the background so the
  // conversation can be resumed if the freshly launched tmux session dies.
  if (tmuxCreated) startProviderSessionCapture(id, provider, cwd, tmuxLaunchedAtMs)

  return session
}

function detachPeer(peer: Peer) {
  const session = getPeerSession(peer)
  if (!session) return

  const pty = session.peers.get(peer)
  session.peers.delete(peer)
  peer.context.sessionId = undefined
  if (pty) {
    try { pty.kill() } catch {}
  }
  promoteLoggerPeer(session)
  recordTerminalDetach(session.id)

  if (session.peers.size > 0) return
  scheduleSessionCleanup(session)
}

function promoteLoggerPeer(session: TerminalSession) {
  if (session.loggerPeer && session.peers.has(session.loggerPeer)) return
  session.loggerPeer = session.peers.keys().next().value ?? null
}

function scheduleSessionCleanup(session: TerminalSession) {
  if (session.cleanupTimer) clearTimeout(session.cleanupTimer)
  // The tmux session (and the CLI inside it) keeps running detached; only
  // the in-memory bookkeeping expires. Attaching later revives it.
  session.cleanupTimer = setTimeout(() => {
    if (session.peers.size > 0) return
    session.turnMonitor.dispose()
    session.hookMonitor?.stop()
    session.gitWatcher?.stop()
    if (session.idleCommitTimer) clearInterval(session.idleCommitTimer)
    stopProviderSessionCapture(session.id)
    sessions.delete(session.id)
    clearTerminalActivity(session.id)
  }, SESSION_TTL_MS)
}

function getPeerSession(peer: Peer) {
  const sessionId = peer.context.sessionId
  if (typeof sessionId !== 'string') return null
  return sessions.get(sessionId) || null
}

function appendOutput(session: TerminalSession, data: string) {
  if (isSessionDeleted(session.id)) return
  appendSessionLog(session.id, data).catch(() => {})
}

/**
 * Commits the turn's work, syncs sc/preview, and notifies attached clients.
 * Shared by the turn detector and the idle backstop; `autoCommitTurn` is
 * idempotent (a clean tree yields `committed: false`) and serialized per cwd,
 * so calling it from both paths never produces a duplicate commit.
 */
async function commitTurnAndNotify(session: TerminalSession) {
  const { id, cwd, provider } = session
  // A speckit turn typically ends on a freshly created feature branch. Adopt it
  // before committing so the commit, the preview sync, and everything the UI
  // reads afterwards all refer to the branch the conversation actually lives on.
  await followSessionBranchAndNotify(session)
  const stored = id ? await readStoredSession(id) : null
  const result = stored?.previewBranch
    ? await autoCommitAndSyncPreview(stored)
    : await autoCommitTurn(cwd, provider)
  // The sync above already fast-forwarded sc/preview; tell attached clients to
  // refresh the graph immediately rather than waiting for the HEAD-watcher poll
  // (up to a full interval later), so the preview branch follows the commit.
  if (stored?.previewBranch) {
    for (const peer of session.peers.keys()) sendControl(peer, { type: 'git-changed' })
  }
  if (result.committed) {
    const message = `\r\n[auto-committed ${provider} turn: ${result.hash?.slice(0, 8)}]\r\n`
    appendOutput(session, message)
    for (const peer of session.peers.keys()) peer.send(message)
  }
  return result
}

/**
 * Adopts the worktree's current branch onto the conversation and reports the
 * switch in the terminal stream, so the user sees why the conversation's branch
 * chip changed. Best-effort: a failure here must never disturb the turn.
 */
async function followSessionBranchAndNotify(session: TerminalSession) {
  if (!session.id) return
  try {
    const result = await followSessionBranch(session.id)
    if (!result.changed) return

    const dropped = result.droppedPrevious ? ` (dropped ${result.previousBranch})` : ''
    const message = `\r\n[branch changed: ${result.previousBranch} → ${result.branch}${dropped}]\r\n`
    appendOutput(session, message)
    for (const peer of session.peers.keys()) {
      peer.send(message)
      sendControl(peer, { type: 'git-changed' })
    }
  } catch {
    // Branch follow is advisory; the next watcher tick retries.
  }
}

/** True when the worktree has staged, unstaged, or untracked changes. */
async function worktreeHasChanges(cwd: string) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all'],
      { cwd }
    )
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Backstop for hook-less turn detection: commit a stranded turn once the
 * provider is idle. Only acts when the tree is dirty AND the provider screen
 * shows the turn finished, so a mid-turn pause never commits partial work.
 */
async function idleCommitBackstop(session: TerminalSession) {
  if (isSessionDeleted(session.id)) return
  try {
    if (!(await worktreeHasChanges(session.cwd))) return
    const screen = await captureSessionScreen(session.tmuxName)
    if (!isProviderTurnComplete(session.provider, screen)) return
    await commitTurnAndNotify(session)
  } catch {
    // Best-effort; the next tick retries.
  }
}

/**
 * Creates the tmux session when it is missing; `getCliCommand` is only
 * invoked in that case. Returns true when a new tmux session was created.
 */
async function ensureTmuxSession(
  tmuxName: string,
  cwd: string,
  getCliCommand: () => string | Promise<string>
) {
  const exists = await hasTmuxSession(tmuxName)

  if (!exists) {
    await execFileAsync(TMUX_BIN, [
      'new-session',
      '-d',
      '-s',
      tmuxName,
      '-c',
      cwd,
      await getCliCommand()
    ])
  }

  // The web client attaches through tmux's alternate screen, so wheel
  // scrolling must be handled by tmux (copy-mode) or the CLI, not xterm.
  await execFileAsync(TMUX_BIN, ['set-option', '-t', tmuxName, 'mouse', 'on']).catch(() => {})
  // Follow the most recently resized client instead of the smallest one.
  await execFileAsync(TMUX_BIN, ['set-option', '-w', '-t', tmuxName, 'window-size', 'latest']).catch(() => {})

  return !exists
}

/**
 * Titles an untitled conversation with its first submitted prompt so the
 * sidebar shows what the conversation is about instead of the raw id. A title
 * set by the user (rename) is never overwritten, and titling is cosmetic —
 * failures must never disturb the terminal flow.
 */
async function maybeAutoTitleSession(sessionId: string, record: CliHookRecord) {
  const prompt = record.payload && typeof record.payload.prompt === 'string' ? record.payload.prompt : ''
  const title = summarizePromptTitle(prompt)
  if (!title) return
  try {
    if (isSessionDeleted(sessionId)) return
    const stored = await readStoredSession(sessionId)
    if (!stored || stored.title) return
    await writeStoredSession({
      ...stored,
      title,
      updatedAt: new Date().toISOString()
    })
  } catch {
    // Best-effort only.
  }
}

/**
 * Best-effort CLI hook injection into the session worktree. Hooks are an
 * accuracy enhancement — a failure to write them must never block the
 * terminal, so the screen-scrape fallback simply keeps covering the session.
 */
function prepareCliHooksSafely(provider: ProviderId, cwd: string, sessionId: string) {
  if (!providerSupportsCliHooks(provider)) return
  try {
    prepareClaudeHooks(cwd, sessionId)
  } catch (error) {
    console.error(`[terminal] failed to prepare CLI hooks for ${sessionId}:`, error)
  }
}

/**
 * Resume commands are best-effort: a corrupt stored id must never keep the
 * terminal from launching, so fall back to a fresh conversation instead.
 */
function resolveLaunchCommand(provider: ProviderId, providerSessionId?: string | null) {
  try {
    return buildProviderCommand(provider, providerSessionId)
  } catch {
    return buildProviderCommand(provider)
  }
}

/**
 * Polls the provider's on-disk session files until the conversation started
 * in `cwd` at/after `afterMs` shows up, then persists its id on the stored
 * session so a later relaunch can resume it. Gives up after a fixed window,
 * stops as soon as the session is deleted, and never keeps the process alive.
 */
function startProviderSessionCapture(sessionId: string, provider: ProviderId, cwd: string, afterMs: number) {
  stopProviderSessionCapture(sessionId)

  const capture: ProviderSessionCapture = { timer: null, cancelled: false }
  providerSessionCaptures.set(sessionId, capture)

  const deadline = afterMs + PROVIDER_SESSION_POLL_TIMEOUT_MS
  const finder = provider === 'codex' ? findCodexSessionId : findClaudeSessionId
  const finish = () => {
    capture.cancelled = true
    if (providerSessionCaptures.get(sessionId) === capture) {
      providerSessionCaptures.delete(sessionId)
    }
  }

  const poll = async () => {
    capture.timer = null
    if (capture.cancelled || isSessionDeleted(sessionId)) return finish()

    const providerSessionId = await finder(cwd, afterMs).catch(() => null)
    if (capture.cancelled || isSessionDeleted(sessionId)) return finish()

    if (providerSessionId) {
      // Re-read the stored session so concurrent metadata updates (title,
      // archive state, ...) are not clobbered by a stale snapshot.
      const stored = await readStoredSession(sessionId).catch(() => null)
      if (stored && !capture.cancelled && !isSessionDeleted(sessionId)
        && stored.providerSessionId !== providerSessionId) {
        await writeStoredSession({
          ...stored,
          providerSessionId,
          updatedAt: new Date().toISOString()
        }).catch(() => {})
      }
      return finish()
    }

    if (Date.now() >= deadline) return finish()
    capture.timer = setTimeout(() => { void poll() }, PROVIDER_SESSION_POLL_MS)
    capture.timer.unref?.()
  }

  capture.timer = setTimeout(() => { void poll() }, PROVIDER_SESSION_POLL_MS)
  capture.timer.unref?.()
}

function stopProviderSessionCapture(sessionId: string) {
  const capture = providerSessionCaptures.get(sessionId)
  if (!capture) return
  capture.cancelled = true
  if (capture.timer) clearTimeout(capture.timer)
  capture.timer = null
  providerSessionCaptures.delete(sessionId)
}

async function hasTmuxSession(tmuxName: string) {
  try {
    await execFileAsync(TMUX_BIN, ['has-session', '-t', tmuxName])
    return true
  } catch {
    return false
  }
}

async function captureSessionScreen(tmuxName: string) {
  try {
    const { stdout } = await execFileAsync(TMUX_BIN, [
      'capture-pane',
      '-e',
      '-p',
      '-t',
      tmuxName
    ])
    return stdout
  } catch {
    return ''
  }
}

function sanitizeTmuxName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}

function normalizeSessionId(value?: string) {
  if (!value) return null
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(value)) return null
  return value
}

function generateConversationId() {
  return `conv-${Math.random().toString(36).slice(2, 12)}`
}

function parseTerminalMessage(text: string): TerminalMessage | null {
  if (!text.startsWith('{')) return null

  try {
    return JSON.parse(text) as TerminalMessage
  } catch {
    return null
  }
}

function sendControl(
  peer: Peer,
  message: { type: 'hello' } | { type: 'attached'; sessionId: string } | { type: 'git-changed' }
) {
  peer.send(`\x00${JSON.stringify(message)}`)
}

function clampDimension(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(8, Math.min(240, Math.floor(value)))
}
