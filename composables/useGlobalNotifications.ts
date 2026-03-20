/**
 * Global WebSocket connection for server-initiated notifications and streaming.
 *
 * Maintains a single always-on WebSocket to /_ws so that global-channel
 * events (job_created, job_completed, job_persisted) are received even when
 * no per-conversation chat connection is active.
 *
 * When a non-user job is created, this composable subscribes the same
 * WebSocket to the conversation's event channel and displays real-time
 * streaming text. On job_persisted the authoritative persisted data
 * replaces the streaming view via refreshServerConversations().
 */

import { useChatStore } from '~/stores/chat'
import { generateBlockId } from '~/types/chat'
import type { TextBlock, UIStreamEvent } from '~/types/chat'

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

const RECONNECT_DELAY = 5_000
const REFRESH_DEBOUNCE = 500

/** Lightweight per-job streaming state (one at a time per WebSocket). */
interface ServerJobState {
  conversationId: string
  messageId: string
  currentTextBlockId: string | null
}
let activeServerJob: ServerJobState | null = null

/** Jobs awaiting setup after the next refresh completes. */
const pendingJobs = new Map<string, string>() // conversationId → message

function getWsUrl(): string {
  if (typeof window === 'undefined') return ''
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/_ws`
}

export function useGlobalNotifications() {
  const chatStore = useChatStore()

  // ─── Refresh helpers ───────────────────────────────────

  async function doRefresh() {
    console.log('[GlobalNotifications] Executing debounced refresh')
    const result = await chatStore.refreshServerConversations()
    console.log('[GlobalNotifications] Refresh result:', result)

    // Set up streaming for any pending server jobs
    for (const [convId, message] of pendingJobs) {
      pendingJobs.delete(convId)
      setupServerJobStreaming(convId, message)
    }
  }

  function debouncedRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      doRefresh()
    }, REFRESH_DEBOUNCE)
  }

  // ─── Server-job streaming setup ────────────────────────

  function setupServerJobStreaming(conversationId: string, message: string) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    const conv = chatStore.conversations.find((c: { id: string }) => c.id === conversationId)
    if (!conv) {
      console.warn('[GlobalNotifications] Conversation not found for streaming:', conversationId)
      return
    }

    // Add user message if not yet present
    if (conv.messages.length === 0 && message) {
      chatStore.addUserMessage(message, conversationId)
    }

    // Add assistant message placeholder
    const assistantMsg = chatStore.addAssistantMessage(conversationId)
    chatStore.initContentBlocks(assistantMsg.id, conversationId)
    chatStore.startConversationStreaming(conversationId)

    activeServerJob = {
      conversationId,
      messageId: assistantMsg.id,
      currentTextBlockId: null,
    }

    // Subscribe this WebSocket to the conversation's event channel with full replay
    ws.send(JSON.stringify({
      type: 'subscribe',
      conversationId,
      cursor: 0,
    }))

    console.log('[GlobalNotifications] Subscribed to server job streaming:', conversationId)
  }

  // ─── Incoming message routing ──────────────────────────

  function handleWsMessage(event: MessageEvent) {
    try {
      const msg = JSON.parse(event.data)

      // Global notifications
      if (msg.type === 'notification') {
        handleNotification(msg)
        return
      }

      // Conversation-level streaming events (for active server job)
      if (activeServerJob) {
        handleStreamingEvent(msg)
      }
    } catch {
      // ignore parse errors
    }
  }

  function handleNotification(msg: any) {
    console.log('[GlobalNotifications] Received:', msg.notificationEvent, msg.conversationId)

    if (msg.notificationEvent === 'job_created' && msg.source !== 'user') {
      pendingJobs.set(msg.conversationId, msg.message || '')
      debouncedRefresh()
      return
    }

    if (msg.notificationEvent === 'job_persisted') {
      // Clean up streaming state — the persisted data will replace everything
      if (activeServerJob?.conversationId === msg.conversationId) {
        chatStore.endConversationStreaming(msg.conversationId)
        activeServerJob = null
      }
      pendingJobs.delete(msg.conversationId)
      debouncedRefresh()
      return
    }

    if (msg.notificationEvent === 'job_completed') {
      // job_completed fires before flush; streaming continues until job_persisted
      return
    }
  }

  // ─── Lightweight streaming event processor ─────────────
  //
  // Handles only text streaming for display purposes.
  // The full content (with tool_use, thinking blocks etc.)
  // comes from jobPersister via job_persisted.

  function handleStreamingEvent(msg: any) {
    const job = activeServerJob!
    const convId = job.conversationId

    if (msg.type === 'ui_event' && msg.event) {
      processUIEvent(job, msg.event as UIStreamEvent, convId)
      return
    }

    if (msg.type === 'done') {
      // Don't end streaming here — wait for job_persisted
      // (job_persisted arrives after flush and carries the final data)
      return
    }

    if (msg.type === 'error') {
      chatStore.updateMessage(job.messageId, { status: 'error' }, convId)
      chatStore.setSessionError(msg.error || 'Server job error', convId)
      chatStore.endConversationStreaming(convId)
      activeServerJob = null
      return
    }

    // replay_start / replay_end / subscribed — informational, ignore
  }

  function processUIEvent(job: ServerJobState, event: UIStreamEvent, convId: string) {
    switch (event.type) {
      case 'block_start': {
        if (event.blockType === 'text') {
          const blockId = event.blockId || generateBlockId()
          const block: TextBlock = { id: blockId, type: 'text', text: event.text || '' }
          chatStore.appendContentBlock(job.messageId, block, convId)
          job.currentTextBlockId = blockId
          if (event.text) {
            chatStore.appendToMessage(job.messageId, event.text, convId)
          }
        }
        break
      }
      case 'block_delta': {
        if (event.text && job.currentTextBlockId) {
          chatStore.updateBlockById(job.messageId, job.currentTextBlockId, (block) => {
            if (block.type === 'text') {
              (block as TextBlock).text += event.text!
            }
          }, convId)
          chatStore.appendToMessage(job.messageId, event.text, convId)
        }
        break
      }
      case 'block_end': {
        if (job.currentTextBlockId) {
          job.currentTextBlockId = null
        }
        break
      }
      case 'session_init':
      case 'tool_result':
      case 'turn_result':
      case 'error':
        // These are persisted by jobPersister; skip for lightweight streaming
        break
    }
  }

  // ─── WebSocket lifecycle ───────────────────────────────

  function connect() {
    if (typeof window === 'undefined') return
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

    const url = getWsUrl()
    ws = new WebSocket(url)

    ws.onopen = () => {
      console.log('[GlobalNotifications] WebSocket connected')
    }

    ws.onmessage = handleWsMessage

    ws.onclose = (event) => {
      console.log('[GlobalNotifications] WebSocket closed', { code: event.code, reason: event.reason })
      ws = null
      // Clean up any active streaming
      if (activeServerJob) {
        chatStore.endConversationStreaming(activeServerJob.conversationId)
        activeServerJob = null
      }
      scheduleReconnect()
    }

    ws.onerror = (err) => {
      console.warn('[GlobalNotifications] WebSocket error', err)
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, RECONNECT_DELAY)
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
    if (activeServerJob) {
      chatStore.endConversationStreaming(activeServerJob.conversationId)
      activeServerJob = null
    }
    if (ws) {
      ws.close()
      ws = null
    }
  }

  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return { connect, disconnect }
}
