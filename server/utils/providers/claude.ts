import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ProviderId, SessionRuntimeState, StoredTerminalSession } from '../session-store'
import { getTerminalActivity, type TerminalRuntimeActivity } from '../runtime-activity'
import { isClaudeTurnComplete } from './claude-turn'
import { isCodexTurnComplete } from './codex-turn'

const TMUX_BIN = process.env.TMUX_BIN || 'tmux'
const execFileAsync = promisify(execFile)

// Providers repaint their spinner every few hundred ms while working, so one
// quiet second is enough to call the turn finished without state flicker.
// Keep this small: the UI must reflect idle/working within 1-2 seconds.
const OUTPUT_QUIET_MS = 1000

type PaneInfo = {
  paneId?: string
  panePid?: number
  paneCommand?: string
  paneDead: boolean
}

export async function inspectProviderSession(
  session: StoredTerminalSession
): Promise<SessionRuntimeState> {
  const checkedAt = new Date().toISOString()

  try {
    await execFileAsync(TMUX_BIN, ['has-session', '-t', session.tmuxName])
  } catch {
    return {
      state: 'dead',
      active: false,
      tmuxAlive: false,
      tmuxAttached: false,
      checkedAt,
      reason: 'tmux session not found'
    }
  }

  const [pane, attached, screen] = await Promise.all([
    getPaneInfo(session.tmuxName),
    getAttachedState(session.tmuxName),
    captureScreen(session.tmuxName)
  ])

  if (pane.paneDead) {
    return {
      state: 'dead',
      active: false,
      tmuxAlive: true,
      tmuxAttached: attached,
      paneCommand: pane.paneCommand,
      panePid: pane.panePid,
      checkedAt,
      reason: 'tmux pane is dead'
    }
  }

  const activity = getTerminalActivity(session.id)
  const state = classifyProviderScreen(session.provider, screen, activity)

  return {
    state,
    active: state === 'working' || state === 'waiting_input',
    tmuxAlive: true,
    tmuxAttached: attached,
    paneCommand: pane.paneCommand,
    panePid: pane.panePid,
    checkedAt,
    reason: getStateReason(session.provider, state, activity)
  }
}

async function getPaneInfo(tmuxName: string): Promise<PaneInfo> {
  try {
    const { stdout } = await execFileAsync(TMUX_BIN, [
      'list-panes',
      '-t',
      tmuxName,
      '-F',
      '#{pane_id}|#{pane_pid}|#{pane_current_command}|#{pane_dead}'
    ])
    const [paneId, panePid, paneCommand, paneDead] = stdout.trim().split('|')

    return {
      paneId,
      panePid: Number(panePid) || undefined,
      paneCommand,
      paneDead: paneDead === '1'
    }
  } catch {
    return {
      paneDead: true
    }
  }
}

async function getAttachedState(tmuxName: string) {
  try {
    const { stdout } = await execFileAsync(TMUX_BIN, [
      'display-message',
      '-p',
      '-t',
      tmuxName,
      '#{session_attached}'
    ])
    return Number(stdout.trim()) > 0
  } catch {
    return false
  }
}

async function captureScreen(tmuxName: string) {
  try {
    const { stdout } = await execFileAsync(TMUX_BIN, [
      'capture-pane',
      '-t',
      tmuxName,
      '-p',
      '-S',
      '-80'
    ])
    return stdout
  } catch {
    return ''
  }
}

function classifyProviderScreen(
  provider: ProviderId,
  screen: string,
  activity?: TerminalRuntimeActivity
): SessionRuntimeState['state'] {
  const normalized = screen.toLowerCase()
  const hasPrompt = provider === 'codex'
    ? isCodexTurnComplete(screen)
    : isClaudeTurnComplete(screen)
  const now = Date.now()
  const submittedRecently = Boolean(
    activity?.lastSubmitAt && now - activity.lastSubmitAt < 2 * 60 * 1000
  )
  const outputAfterSubmit = Boolean(
    activity?.lastSubmitAt && activity?.lastOutputAt && activity.lastOutputAt >= activity.lastSubmitAt
  )
  const outputRecently = Boolean(
    activity?.lastOutputAt && now - activity.lastOutputAt < OUTPUT_QUIET_MS
  )

  if (isWaitingForInput(provider, screen)) {
    return 'waiting_input'
  }

  // Deterministic hook signal: a CLI Stop hook recorded after the last
  // submit means the turn is over, even if output stopped only milliseconds
  // ago. Only claude records this (codex has no safe hook injection point and
  // keeps the heuristics below), so codex behavior is unchanged.
  if (hasFreshTurnCompletion(activity)) {
    return 'idle'
  }

  if (submittedRecently && outputRecently) {
    return 'working'
  }

  if (submittedRecently && !hasPrompt) {
    return 'working'
  }

  if (submittedRecently && !outputAfterSubmit) {
    return 'working'
  }

  if (hasPrompt) {
    return 'idle'
  }

  if (!screen.trim()) {
    return 'unknown'
  }

  return 'working'
}

/**
 * True when a hook-reported turn completion is newer than the last submit.
 * Strictly newer: on a same-millisecond collision with a fresh submit we fall
 * back to the screen heuristics instead of sticking to a stale idle.
 */
function hasFreshTurnCompletion(activity?: TerminalRuntimeActivity) {
  if (!activity?.lastTurnCompletedAt) return false
  if (!activity.lastSubmitAt) return true
  return activity.lastTurnCompletedAt > activity.lastSubmitAt
}

function isWaitingForInput(provider: ProviderId, screen: string) {
  const normalized = screen.toLowerCase()
  if (provider === 'codex') {
    if (isCodexTurnComplete(screen)) return false
    const tail = screen.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-12)
    if (tail.some((line) => line.startsWith('›') && line !== '›')) return true
  } else if (screen.includes('❯')) {
    return false
  }

  return [
    'do you want',
    'permission',
    'approve',
    'allow',
    'deny',
    'continue?',
    'yes/no',
    'y/n',
    'esc to cancel',
    'press enter',
    'manual mode on',
    'trust this directory',
    'run this command',
    'apply changes'
  ].some((pattern) => normalized.includes(pattern))
}

function getStateReason(
  provider: ProviderId,
  state: SessionRuntimeState['state'],
  activity?: TerminalRuntimeActivity
) {
  const now = Date.now()
  if (state === 'idle') {
    if (hasFreshTurnCompletion(activity)) return 'turn stop hook observed'
    return `${provider} prompt detected`
  }
  if (state === 'working') {
    if (activity?.lastOutputAt && now - activity.lastOutputAt < OUTPUT_QUIET_MS) return 'recent terminal output'
    if (activity?.lastSubmitAt && now - activity.lastSubmitAt < 2 * 60 * 1000) return 'recent submitted input'
    return `${provider} prompt not visible`
  }
  if (state === 'waiting_input') return 'input or permission prompt detected'
  if (state === 'unknown') return 'screen capture was empty or unrecognized'
  return undefined
}
