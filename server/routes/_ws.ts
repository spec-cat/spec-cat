/**
 * WebSocket endpoint for AI provider chat streaming
 * Path: /_ws
 *
 * Thin transport layer: validates input, delegates execution to JobQueue,
 * and forwards EventBus events to the connected peer.
 */

import { eventBus } from '~/server/utils/eventBus'
import { jobQueue, normalizeImageAttachments } from '~/server/utils/jobQueue'
import type { ChatJobMessage } from '~/server/utils/jobQueue'

type PermissionMode = 'plan' | 'ask' | 'auto' | 'bypass'

interface ChatMessage {
  type: 'chat'
  message: string
  conversationId: string
  attachments?: unknown[]
  requestId: string
  sessionId?: string
  permissionMode?: PermissionMode
  cwd?: string
  worktreeBranch?: string
  featureId?: string
  providerId?: string
  providerModelKey?: string
}

interface PingMessage {
  type: 'ping'
}

interface PermissionResponse {
  type: 'permission_response'
  allow: boolean
}

interface AbortMessage {
  type: 'abort'
}

interface ResetContextMessage {
  type: 'reset_context'
}

type ClientMessage = ChatMessage | PingMessage | PermissionResponse | AbortMessage | ResetContextMessage

// Track peer → conversation mapping and EventBus subscription
interface PeerConnection {
  conversationId: string | null
  unsubscribe: (() => void) | null
}

const peerConnections = new Map<string, PeerConnection>()

function getPeerConnection(peerId: string): PeerConnection {
  let conn = peerConnections.get(peerId)
  if (!conn) {
    conn = { conversationId: null, unsubscribe: null }
    peerConnections.set(peerId, conn)
  }
  return conn
}

function subscribePeerToConversation(peer: any, conversationId: string): void {
  const conn = getPeerConnection(peer.id)

  // Already subscribed to this conversation
  if (conn.conversationId === conversationId && conn.unsubscribe) {
    return
  }

  // Unsubscribe from previous conversation
  if (conn.unsubscribe) {
    conn.unsubscribe()
  }

  conn.conversationId = conversationId
  conn.unsubscribe = eventBus.subscribe(conversationId, (event) => {
    try {
      peer.send(JSON.stringify(event))
    } catch (err) {
      console.error('[WS] Failed to send event to peer:', err)
    }
  })
}

export default defineWebSocketHandler({
  open(_peer) {
    // Client connected
  },

  close(peer) {
    const conn = peerConnections.get(peer.id)
    if (conn) {
      if (conn.unsubscribe) conn.unsubscribe()
      if (conn.conversationId) {
        jobQueue.cleanup(conn.conversationId)
      }
    }
    peerConnections.delete(peer.id)
  },

  error(peer, error) {
    console.error('[WS] Error for peer', peer.id, ':', error)
  },

  message(peer, rawMessage) {
    let msg: ClientMessage
    try {
      msg = JSON.parse(rawMessage.text())
    } catch {
      peer.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }))
      return
    }

    if (msg.type === 'ping') {
      peer.send(JSON.stringify({ type: 'pong' }))
      return
    }

    if (msg.type === 'chat') {
      handleChatMessage(peer, msg)
      return
    }

    if (msg.type === 'permission_response') {
      handlePermissionResponse(peer, msg)
      return
    }

    if (msg.type === 'abort') {
      handleAbort(peer)
      return
    }

    if (msg.type === 'reset_context') {
      handleResetContext(peer)
      return
    }
  },
})

function handleChatMessage(peer: any, msg: ChatMessage) {
  const attachments = normalizeImageAttachments(msg.attachments)

  // Validate message content
  if (typeof msg.message !== 'string') {
    console.error('[WS] Invalid chat message - missing or invalid message property:', msg)
    peer.send(JSON.stringify({
      type: 'error',
      error: 'Invalid message: message property is required',
      requestId: msg.requestId,
    }))
    return
  }
  if (msg.message.trim().length === 0 && attachments.length === 0) {
    peer.send(JSON.stringify({
      type: 'error',
      error: 'Invalid message: message or image attachment is required',
      requestId: msg.requestId,
    }))
    return
  }
  if (!msg.conversationId) {
    peer.send(JSON.stringify({
      type: 'error',
      error: 'Invalid message: conversationId is required',
      requestId: msg.requestId,
    }))
    return
  }

  // Subscribe peer to conversation events via EventBus
  subscribePeerToConversation(peer, msg.conversationId)

  // Delegate to JobQueue
  const jobMessage: ChatJobMessage = {
    message: msg.message,
    conversationId: msg.conversationId,
    attachments: attachments.length > 0 ? attachments : undefined,
    requestId: msg.requestId,
    sessionId: msg.sessionId,
    permissionMode: msg.permissionMode,
    cwd: msg.cwd,
    worktreeBranch: msg.worktreeBranch,
    featureId: msg.featureId,
    providerId: msg.providerId,
    providerModelKey: msg.providerModelKey,
  }

  jobQueue.submit(jobMessage)
}

function handlePermissionResponse(peer: any, msg: PermissionResponse) {
  const conn = getPeerConnection(peer.id)
  if (!conn.conversationId) return

  console.log('[WS] Permission response:', { allow: msg.allow, conversationId: conn.conversationId })
  jobQueue.respondToPermission(conn.conversationId, msg.allow)
}

function handleAbort(peer: any) {
  const conn = getPeerConnection(peer.id)

  console.log('[WS] Abort requested for peer:', peer.id)

  if (conn.conversationId) {
    jobQueue.abort(conn.conversationId)
  }
  peer.send(JSON.stringify({ type: 'aborted' }))

  console.log('[WS] Abort completed for peer:', peer.id)
}

function handleResetContext(peer: any) {
  const conn = getPeerConnection(peer.id)

  console.log('[WS] Reset context requested for peer:', peer.id)

  if (conn.conversationId) {
    jobQueue.resetContext(conn.conversationId)
  }
  peer.send(JSON.stringify({ type: 'context_reset' }))

  console.log('[WS] Context reset completed for peer:', peer.id)
}
