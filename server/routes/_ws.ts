/**
 * WebSocket endpoint for AI provider chat streaming
 * Path: /_ws
 *
 * Thin transport layer: validates input, delegates execution to JobQueue,
 * and forwards EventBus events to the connected peer.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { eventBus, GLOBAL_CHANNEL } from '~/server/utils/eventBus'
import { jobQueue, normalizeImageAttachments } from '~/server/utils/jobQueue'
import type { ChatJobMessage } from '~/server/utils/jobQueue'
import { startPersisting } from '~/server/utils/jobPersister'
import { setupConversationWorktree } from '~/server/utils/worktreeSetup'
import { getProjectDir } from '~/server/utils/projectDir'

type PermissionMode = 'plan' | 'ask' | 'auto' | 'bypass'

// Extract featureId from speckit commands (/speckit.plan 001-auth) or bare feature ID patterns
const SPECKIT_FEATURE_PATTERN = /^\/speckit\.\w+\s+(\S+)/
const FEATURE_ID_PATTERN = /\b(\d{3}-[a-z0-9][a-z0-9-]*)\b/i

function extractFeatureIdFromMessage(message: string): string | undefined {
  const trimmed = message.trim()

  // 1. Speckit command: /speckit.plan 001-auth
  const speckitMatch = trimmed.match(SPECKIT_FEATURE_PATTERN)
  if (speckitMatch) return speckitMatch[1]

  // 2. Feature ID pattern in message (e.g. "001-auth" mentioned in natural text)
  const featureMatch = trimmed.match(FEATURE_ID_PATTERN)
  return featureMatch?.[1]
}

function isValidFeatureId(featureId: string): boolean {
  const projectDir = getProjectDir()
  const specDir = join(projectDir, 'specs', featureId)
  return existsSync(specDir)
}

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

interface SubscribeMessage {
  type: 'subscribe'
  conversationId: string
  cursor?: number // event index to replay from (0 = all)
}

type ClientMessage = ChatMessage | PingMessage | PermissionResponse | AbortMessage | ResetContextMessage | SubscribeMessage

// Track peer → conversation mapping and EventBus subscription
interface PeerConnection {
  conversationId: string | null
  unsubscribe: (() => void) | null
  unsubscribeGlobal: (() => void) | null
}

const peerConnections = new Map<string, PeerConnection>()

function getPeerConnection(peerId: string): PeerConnection {
  let conn = peerConnections.get(peerId)
  if (!conn) {
    conn = { conversationId: null, unsubscribe: null, unsubscribeGlobal: null }
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
  open(peer) {
    console.log('[WS] Peer connected:', peer.id)
    // Subscribe to global notification channel for push events
    const conn = getPeerConnection(peer.id)
    conn.unsubscribeGlobal = eventBus.subscribe(GLOBAL_CHANNEL, (event) => {
      try {
        const payload = JSON.stringify(event)
        if (event.type === 'notification') {
          console.log('[WS] Forwarding global notification to peer', peer.id, ':', (event as any).notificationEvent)
        }
        peer.send(payload)
      } catch (err) {
        console.error('[WS] Failed to send global event to peer:', err)
      }
    })
  },

  close(peer) {
    const conn = peerConnections.get(peer.id)
    if (conn) {
      if (conn.unsubscribe) conn.unsubscribe()
      if (conn.unsubscribeGlobal) conn.unsubscribeGlobal()
      // Jobs are NOT aborted on disconnect — they run to completion
      // so reconnecting clients can subscribe and replay buffered events.
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
      handleChatMessage(peer, msg).catch((err) => {
        console.error('[WS] handleChatMessage error:', err)
        try {
          peer.send(JSON.stringify({ type: 'error', error: 'Internal server error', requestId: msg.requestId }))
        } catch {}
      })
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

    if (msg.type === 'subscribe') {
      handleSubscribe(peer, msg)
      return
    }
  },
})

async function handleChatMessage(peer: any, msg: ChatMessage) {
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

  // Auto-detect featureId from message when not explicitly provided.
  // Matches speckit commands (/speckit.plan 001-auth) and bare feature ID patterns.
  let resolvedFeatureId = msg.featureId
  if (!resolvedFeatureId) {
    const extracted = extractFeatureIdFromMessage(msg.message)
    if (extracted && isValidFeatureId(extracted)) {
      resolvedFeatureId = extracted
      console.log('[WS] Auto-detected featureId from message:', resolvedFeatureId)
    }
  }

  // Ensure worktree isolation when no worktree cwd is provided.
  // Client UI and POST /api/jobs create worktrees before submitting;
  // external WS clients may not, so we handle it here.
  let resolvedCwd = msg.cwd
  let resolvedWorktreeBranch = msg.worktreeBranch
  if (!resolvedCwd || !resolvedCwd.startsWith('/tmp/sc-')) {
    const wtResult = await setupConversationWorktree({
      conversationId: msg.conversationId,
      message: msg.message,
      featureId: resolvedFeatureId,
      providerId: msg.providerId,
      providerModelKey: msg.providerModelKey,
    })
    if (wtResult.success) {
      resolvedCwd = wtResult.cwd
      resolvedWorktreeBranch = wtResult.worktreeBranch
    }
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
    cwd: resolvedCwd,
    worktreeBranch: resolvedWorktreeBranch,
    featureId: resolvedFeatureId,
    providerId: msg.providerId,
    providerModelKey: msg.providerModelKey,
  }

  // Subscribe server-side persister BEFORE submit so no events are missed.
  // This ensures the server owns the conversation state for ALL jobs,
  // not just server-initiated ones (POST /api/jobs).
  startPersisting(msg.conversationId, msg.message)

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

  console.log('[WS] Abort requested for peer:', peer.id, 'conversationId:', conn.conversationId)

  if (conn.conversationId) {
    jobQueue.abort(conn.conversationId)
    console.log('[WS] jobQueue.abort() called for conversation:', conn.conversationId)
  } else {
    console.warn('[WS] Abort skipped — no conversationId bound to this peer!')
  }
  peer.send(JSON.stringify({ type: 'aborted' }))

  console.log('[WS] Abort completed for peer:', peer.id)
}

function handleSubscribe(peer: any, msg: SubscribeMessage) {
  if (!msg.conversationId) {
    peer.send(JSON.stringify({ type: 'error', error: 'conversationId is required for subscribe' }))
    return
  }

  // Subscribe to future events
  subscribePeerToConversation(peer, msg.conversationId)

  // Replay buffered events from active job
  const activeJob = jobQueue.getActiveJob(msg.conversationId)
  if (activeJob) {
    const cursor = typeof msg.cursor === 'number' && msg.cursor >= 0 ? msg.cursor : 0
    const bufferedEvents = activeJob.events.slice(cursor)

    if (bufferedEvents.length > 0) {
      peer.send(JSON.stringify({
        type: 'replay_start',
        jobId: activeJob.id,
        jobStatus: activeJob.status,
        eventCount: bufferedEvents.length,
        cursor,
      }))

      for (const event of bufferedEvents) {
        try {
          peer.send(JSON.stringify(event))
        } catch {
          break
        }
      }

      peer.send(JSON.stringify({
        type: 'replay_end',
        jobId: activeJob.id,
        nextCursor: activeJob.events.length,
      }))
    } else {
      peer.send(JSON.stringify({
        type: 'subscribed',
        conversationId: msg.conversationId,
        jobId: activeJob.id,
        jobStatus: activeJob.status,
      }))
    }
  } else {
    peer.send(JSON.stringify({
      type: 'subscribed',
      conversationId: msg.conversationId,
    }))
  }
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
