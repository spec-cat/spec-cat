import type { IPty } from 'node-pty'
import { spawn } from 'node-pty'
import type { Peer } from 'crossws'
import type { ProviderId } from './session-store'
import type { CliHookMonitor } from './cli-hook-monitor'
import type { TurnMonitor } from './turn-monitor'
import type { WorktreeCommitWatcher } from './worktree-commit-watcher'
import { clearTerminalActivity, recordTerminalDetach, recordTerminalOutput } from './runtime-activity'
import { TMUX_BIN } from './tmux'
import { stopProviderSessionCapture } from './provider-session-capture'

/** In-memory resources owned by one managed terminal conversation. */
export type TerminalSession = {
  id: string
  provider: ProviderId
  tmuxName: string
  cwd: string
  cliBin: string
  /** One tmux client per browser peer preserves tmux's initial full redraw. */
  peers: Map<Peer, IPty>
  /** Only this peer feeds session-wide logging and turn detection. */
  loggerPeer: Peer | null
  cols: number
  rows: number
  cleanupTimer: NodeJS.Timeout | null
  turnMonitor: TurnMonitor
  hookMonitor: CliHookMonitor | null
  gitWatcher: WorktreeCommitWatcher | null
  idleCommitTimer: NodeJS.Timeout | null
}

type PeerCallbacks = {
  appendOutput: (session: TerminalSession, data: string) => void
  onEmpty: (session: TerminalSession) => void
}

/** Attaches an independent tmux client to a browser peer. */
export function spawnTerminalPeerClient(
  session: TerminalSession,
  peer: Peer,
  callbacks: PeerCallbacks
) {
  const pty = spawn(TMUX_BIN, ['attach-session', '-t', session.tmuxName], {
    name: 'xterm-256color',
    cols: session.cols,
    rows: session.rows,
    cwd: session.cwd,
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
  })

  session.peers.set(peer, pty)
  if (!session.loggerPeer) session.loggerPeer = peer

  pty.onData((data) => {
    if (session.loggerPeer === peer) {
      recordTerminalOutput(session.id)
      session.turnMonitor.output()
      callbacks.appendOutput(session, data)
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
    callbacks.appendOutput(session, message)
    peer.send(message)
    peer.close()
    if (session.peers.size === 0) callbacks.onEmpty(session)
  })

  return pty
}

/** Detaches one browser peer without terminating the conversation's tmux session. */
export function detachTerminalPeer(session: TerminalSession, peer: Peer): boolean {
  const pty = session.peers.get(peer)
  session.peers.delete(peer)
  peer.context.sessionId = undefined
  if (pty) {
    try { pty.kill() } catch {}
  }
  promoteLoggerPeer(session)
  recordTerminalDetach(session.id)
  return session.peers.size === 0
}

/** Stops every in-memory watcher owned by a cached session, in one fixed order. */
export function disposeTerminalSessionRuntime(session: TerminalSession) {
  session.turnMonitor.dispose()
  session.hookMonitor?.stop()
  session.gitWatcher?.stop()
  if (session.idleCommitTimer) clearInterval(session.idleCommitTimer)
  stopProviderSessionCapture(session.id)
  clearTerminalActivity(session.id)
}

function promoteLoggerPeer(session: TerminalSession) {
  if (session.loggerPeer && session.peers.has(session.loggerPeer)) return
  session.loggerPeer = session.peers.keys().next().value ?? null
}
