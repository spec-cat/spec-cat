import type { CliHookRecord } from './cli-hooks'
import { getCliHookSpoolPath, providerSupportsCliHooks } from './cli-hooks'
import { startCliHookMonitor } from './cli-hook-monitor'
import type { ProviderId } from './session-store'
import { appendSessionLog, isSessionDeleted, readStoredSession, summarizePromptTitle, writeStoredSession } from './session-store'
import { recordTerminalOutput, recordTerminalSubmit, recordTurnCompleted } from './runtime-activity'
import { createTurnMonitor } from './turn-monitor'
import { startWorktreeCommitWatcher } from './worktree-commit-watcher'
import { autoCommitTurn } from './auto-commit'
import { autoCommitAndSyncPreview, followSessionBranch, syncPreviewBranch } from './session-integration'
import { isProviderTurnComplete } from './providers/turn-completion'
import { captureTmuxPane } from './tmux'
import { runGit } from './git-state'
import { sendTerminalControl } from './terminal-websocket'
import type { TerminalSession } from './terminal-session'

const IDLE_COMMIT_POLL_MS = 3000

/** Creates every runtime monitor owned by a provisioned terminal session. */
export function createTerminalRuntime(options: {
  id: string
  provider: ProviderId
  cwd: string
  tmuxName: string
  getSession: () => TerminalSession
}) {
  const turnMonitor = createTurnMonitor({
    provider: options.provider,
    captureScreen: () => captureTmuxPane(options.tmuxName, true),
    onComplete: async () => { await commitTurnAndNotify(options.getSession()) },
    onError: (error) => {
      const detail = error instanceof Error ? error.message : String(error)
      broadcastOutput(options.getSession(), `\r\n[auto-commit failed: ${detail}]\r\n`)
    }
  })

  const hookMonitor = providerSupportsCliHooks(options.provider)
    ? startCliHookMonitor({
        spoolPath: getCliHookSpoolPath(options.id),
        requireArmedPromptSubmit: true,
        shouldDispose: () => isSessionDeleted(options.id),
        onPromptSubmit: (record) => {
          recordTerminalSubmit(options.id)
          turnMonitor.submitted()
          void maybeAutoTitleSession(options.id, record)
        },
        onToolEvent: () => {
          recordTerminalOutput(options.id)
          turnMonitor.output()
        },
        onStop: () => {
          recordTurnCompleted(options.id)
          void turnMonitor.complete()
        }
      })
    : null

  const gitWatcher = startWorktreeCommitWatcher({
    cwd: options.cwd,
    shouldDispose: () => isSessionDeleted(options.id),
    onChange: async (state, previous) => {
      const session = options.getSession()
      if (state.branch !== previous.branch) await followSessionBranchAndNotify(session)
      try {
        const stored = await readStoredSession(options.id)
        if (stored?.previewBranch && stored.projectDir) {
          await syncPreviewBranch(stored.projectDir, stored.cwd, stored.previewBranch)
        }
      } catch {
        // Preview sync is advisory; the graph refresh still fires.
      }
      broadcastControl(session, { type: 'git-changed' })
    }
  })

  return {
    turnMonitor,
    hookMonitor,
    gitWatcher,
    startIdleBackstop(session: TerminalSession) {
      if (providerSupportsCliHooks(options.provider)) return null
      const timer = setInterval(() => { void idleCommitBackstop(session) }, IDLE_COMMIT_POLL_MS)
      timer.unref?.()
      return timer
    }
  }
}

export function appendTerminalOutput(session: TerminalSession, data: string) {
  if (isSessionDeleted(session.id)) return
  appendSessionLog(session.id, data).catch(() => {})
}

async function commitTurnAndNotify(session: TerminalSession) {
  await followSessionBranchAndNotify(session)
  const stored = await readStoredSession(session.id)
  const result = stored?.previewBranch
    ? await autoCommitAndSyncPreview(stored)
    : await autoCommitTurn(session.cwd, session.provider)
  if (stored?.previewBranch) broadcastControl(session, { type: 'git-changed' })
  if (result.committed) {
    broadcastOutput(session, `\r\n[auto-committed ${session.provider} turn: ${result.hash?.slice(0, 8)}]\r\n`)
  }
  return result
}

async function followSessionBranchAndNotify(session: TerminalSession) {
  try {
    const result = await followSessionBranch(session.id)
    if (!result.changed) return
    const dropped = result.droppedPrevious ? ` (dropped ${result.previousBranch})` : ''
    const message = `\r\n[branch changed: ${result.previousBranch} → ${result.branch}${dropped}]\r\n`
    appendTerminalOutput(session, message)
    for (const peer of session.peers.keys()) {
      peer.send(message)
      sendTerminalControl(peer, { type: 'git-changed' })
    }
  } catch {
    // Branch following is advisory; the worktree watcher retries.
  }
}

async function idleCommitBackstop(session: TerminalSession) {
  if (isSessionDeleted(session.id)) return
  try {
    if (!(await worktreeHasChanges(session.cwd))) return
    const screen = await captureTmuxPane(session.tmuxName, true)
    if (!isProviderTurnComplete(session.provider, screen)) return
    await commitTurnAndNotify(session)
  } catch {
    // Best-effort; the next tick retries.
  }
}

async function worktreeHasChanges(cwd: string) {
  try {
    return (await runGit(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])).length > 0
  } catch {
    return false
  }
}

async function maybeAutoTitleSession(sessionId: string, record: CliHookRecord) {
  const prompt = record.payload && typeof record.payload.prompt === 'string' ? record.payload.prompt : ''
  const title = summarizePromptTitle(prompt)
  if (!title) return
  try {
    if (isSessionDeleted(sessionId)) return
    const stored = await readStoredSession(sessionId)
    if (!stored || stored.title) return
    await writeStoredSession({ ...stored, title, updatedAt: new Date().toISOString() })
  } catch {
    // Titling is cosmetic and must not disturb the terminal flow.
  }
}

function broadcastOutput(session: TerminalSession, message: string) {
  appendTerminalOutput(session, message)
  for (const peer of session.peers.keys()) peer.send(message)
}

function broadcastControl(session: TerminalSession, message: { type: 'git-changed' }) {
  for (const peer of session.peers.keys()) sendTerminalControl(peer, message)
}
