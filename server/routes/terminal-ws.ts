import {
  buildTerminalSessionId,
  getOrCreateTerminalSession,
  getTerminalSession,
  resizeTerminal,
  subscribeTerminalSession,
  writeTerminalInput,
} from '~/server/utils/terminalSessions'
import { setupConversationWorktree } from '~/server/utils/worktreeSetup'
import { isSpecCatWorktreePath } from '~/server/utils/worktreePaths'
import { readConversationFromStorage, updateConversationProviderSessionInStorage } from '~/server/utils/conversationStore'

function readString(record: Record<string, unknown> | null, key: string): string | undefined {
  if (!record) return undefined
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

interface StartMessage {
  type: 'start'
  conversationId: string
  cwd?: string
  cols?: number
  rows?: number
  baseBranch?: string
  featureId?: string
  providerId?: string
  providerModelKey?: string
}

interface AttachMessage {
  type: 'attach'
  sessionId: string
}

interface InputMessage {
  type: 'input'
  data: string
}

interface ResizeMessage {
  type: 'resize'
  cols: number
  rows: number
}

interface PingMessage {
  type: 'ping'
}

type ClientMessage = StartMessage | AttachMessage | InputMessage | ResizeMessage | PingMessage

interface PeerState {
  sessionId: string | null
  unsubscribe: (() => void) | null
  // Read-only attach (e.g. commit-message generation preview): input is ignored
  // so the viewer never disturbs the scraped PTY session.
  readOnly: boolean
}

const peerStates = new Map<string, PeerState>()

function getPeerState(peerId: string): PeerState {
  let state = peerStates.get(peerId)
  if (!state) {
    state = { sessionId: null, unsubscribe: null, readOnly: false }
    peerStates.set(peerId, state)
  }
  return state
}

function send(peer: any, payload: unknown) {
  try {
    peer.send(JSON.stringify(payload))
  } catch (error) {
    console.error('[terminal-ws] Failed to send payload:', error)
  }
}

export default defineWebSocketHandler({
  open(peer) {
    getPeerState(peer.id)
  },

  close(peer) {
    const state = peerStates.get(peer.id)
    if (state?.unsubscribe) state.unsubscribe()
    peerStates.delete(peer.id)
  },

  error(peer, error) {
    console.error('[terminal-ws] Error for peer', peer.id, error)
  },

  message(peer, rawMessage) {
    let msg: ClientMessage
    try {
      msg = JSON.parse(rawMessage.text())
    } catch {
      send(peer, { type: 'error', error: 'Invalid JSON' })
      return
    }

    if (msg.type === 'ping') {
      send(peer, { type: 'pong' })
      return
    }

    const state = getPeerState(peer.id)

    if (msg.type === 'start') {
      handleStart(peer, state, msg).catch((error) => {
        console.error('[terminal-ws] Failed to start terminal:', error)
        send(peer, {
          type: 'error',
          error: error instanceof Error ? error.message : 'Failed to start terminal',
        })
      })
      return
    }

    if (msg.type === 'attach') {
      handleAttach(peer, state, msg).catch((error) => {
        console.error('[terminal-ws] Failed to attach terminal:', error)
        send(peer, {
          type: 'error',
          error: error instanceof Error ? error.message : 'Failed to attach terminal',
        })
      })
      return
    }

    if (!state.sessionId) {
      send(peer, { type: 'error', error: 'Terminal session has not been started' })
      return
    }

    // A read-only viewer must never write to or resize the underlying PTY: the
    // commit-message scraper depends on the session's geometry and input timing.
    if (state.readOnly) return

    if (msg.type === 'input') {
      if (typeof msg.data !== 'string') {
        send(peer, { type: 'error', error: 'input data must be a string' })
        return
      }
      writeTerminalInput(state.sessionId, msg.data)
      return
    }

    if (msg.type === 'resize') {
      resizeTerminal(state.sessionId, msg.cols, msg.rows)
      return
    }

  },
})

async function handleStart(peer: any, state: PeerState, msg: StartMessage) {
  if (!msg.conversationId) {
    send(peer, { type: 'error', error: 'conversationId is required' })
    return
  }

  if (state.unsubscribe) state.unsubscribe()

  let resolvedCwd = msg.cwd
  let resolvedWorktreeBranch: string | undefined
  let resolvedBaseBranch: string | undefined

  if (!resolvedCwd || !isSpecCatWorktreePath(resolvedCwd)) {
    const wtResult = await setupConversationWorktree({
      conversationId: msg.conversationId,
      message: 'Claude terminal session',
      featureId: msg.featureId,
      baseBranch: msg.baseBranch,
      providerId: msg.providerId,
      providerModelKey: msg.providerModelKey,
    })

    if (wtResult.success) {
      resolvedCwd = wtResult.cwd
      resolvedWorktreeBranch = wtResult.worktreeBranch
      resolvedBaseBranch = wtResult.baseBranch
    } else if (msg.baseBranch) {
      send(peer, {
        type: 'error',
        error: wtResult.error || `Failed to create worktree from base branch "${msg.baseBranch}"`,
      })
      return
    }
  }

  // Fall back to the persisted conversation for provider + resume id so a
  // reconnect after a server restart continues the same provider/session
  // instead of starting a fresh (and possibly default-provider) one.
  const storedRaw = await readConversationFromStorage(msg.conversationId)
  const stored = storedRaw && typeof storedRaw === 'object' ? storedRaw as Record<string, unknown> : null
  const providerId = msg.providerId || readString(stored, 'providerId')
  const modelKey = msg.providerModelKey || readString(stored, 'providerModelKey')
  const resumeSessionId = readString(stored, 'providerSessionId')

  const conversationId = msg.conversationId
  const sessionId = buildTerminalSessionId(conversationId)
  const session = getOrCreateTerminalSession({
    sessionId,
    cwd: resolvedCwd,
    cols: msg.cols,
    rows: msg.rows,
    providerId,
    modelKey,
    resumeSessionId,
    onProviderSessionId: (providerSessionId) => {
      updateConversationProviderSessionInStorage(conversationId, providerSessionId).catch((error) => {
        console.warn('[terminal-ws] Failed to persist terminal provider session id:', error)
      })
    },
  })

  state.sessionId = sessionId
  state.unsubscribe = subscribeTerminalSession(session, {
    onData: data => send(peer, { type: 'data', data }),
    onExit: exitCode => send(peer, { type: 'exit', exitCode }),
  })

  send(peer, {
    type: 'started',
    sessionId,
    cwd: session.cwd,
    hasWorktree: isSpecCatWorktreePath(session.cwd),
    worktreeBranch: resolvedWorktreeBranch,
    baseBranch: resolvedBaseBranch,
    createdAt: session.createdAt,
    exitCode: session.exitCode,
  })

  if (session.buffer) {
    send(peer, { type: 'replay', data: session.buffer })
  }
  if (session.exitCode !== null) {
    send(peer, { type: 'exit', exitCode: session.exitCode })
  }
}

/**
 * Attach a read-only viewer to an already-running terminal session by raw id
 * (never creating one). Used to live-stream the ephemeral commit-message
 * generation PTY. The session is created by the POST handler, which may race
 * this attach, so poll briefly until it appears.
 */
async function handleAttach(peer: any, state: PeerState, msg: AttachMessage) {
  if (!msg.sessionId) {
    send(peer, { type: 'error', error: 'sessionId is required' })
    return
  }

  if (state.unsubscribe) state.unsubscribe()

  const deadline = Date.now() + 10_000
  let session = getTerminalSession(msg.sessionId)
  while (!session && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 150))
    session = getTerminalSession(msg.sessionId)
  }

  if (!session) {
    send(peer, { type: 'error', error: 'Terminal session not found' })
    return
  }

  state.sessionId = msg.sessionId
  state.readOnly = true
  state.unsubscribe = subscribeTerminalSession(session, {
    onData: data => send(peer, { type: 'data', data }),
    onExit: exitCode => send(peer, { type: 'exit', exitCode }),
  })

  send(peer, {
    type: 'started',
    sessionId: msg.sessionId,
    cwd: session.cwd,
    readOnly: true,
    cols: session.cols,
    rows: session.rows,
  })

  if (session.buffer) {
    send(peer, { type: 'replay', data: session.buffer })
  }
  if (session.exitCode !== null) {
    send(peer, { type: 'exit', exitCode: session.exitCode })
  }
}
