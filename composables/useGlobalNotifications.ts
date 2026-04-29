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
import type { ContentBlock, TextBlock, ToolUseBlock, ToolResultBlock, UIStreamEvent } from '~/types/chat'

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

const RECONNECT_DELAY = 5_000
const REFRESH_DEBOUNCE = 500
const RETRY_DELAY = 1_000
const MAX_RETRIES = 5

/** Lightweight per-job streaming state (one at a time per WebSocket). */
interface ServerJobState {
  conversationId: string
  messageId: string
  currentTextBlockId: string | null
  /** Currently active tool_use block being streamed */
  currentToolBlockId: string | null
  currentToolInputJson: string
  isReplaying: boolean
  replayBuffer: any[]
}
let activeServerJob: ServerJobState | null = null

/** Jobs awaiting setup after the next refresh completes. */
const pendingJobs = new Map<string, string>() // conversationId → message
const retryCount = new Map<string, number>() // conversationId → attempt count
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>() // conversationId → timer

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
    const failedJobs: Array<[string, string]> = []
    for (const [convId, message] of pendingJobs) {
      pendingJobs.delete(convId)
      const success = setupServerJobStreaming(convId, message)
      if (!success) {
        failedJobs.push([convId, message])
      }
    }

    // Retry failed jobs (conversation may not be persisted yet)
    for (const [convId, message] of failedJobs) {
      const attempt = (retryCount.get(convId) ?? 0) + 1
      if (attempt <= MAX_RETRIES) {
        retryCount.set(convId, attempt)
        console.log(`[GlobalNotifications] Scheduling retry ${attempt}/${MAX_RETRIES} for ${convId}`)
        const timer = setTimeout(() => {
          retryTimers.delete(convId)
          pendingJobs.set(convId, message)
          debouncedRefresh()
        }, RETRY_DELAY * attempt)
        retryTimers.set(convId, timer)
      } else {
        console.warn(`[GlobalNotifications] Gave up streaming setup for ${convId} after ${MAX_RETRIES} retries`)
        retryCount.delete(convId)
      }
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

  /**
   * Set up streaming for a server-initiated job.
   * Returns true if streaming was started (or already active), false if setup failed and should retry.
   */
  function setupServerJobStreaming(conversationId: string, message: string): boolean {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false

    // Skip if this browser is already streaming this conversation (e.g. we initiated the job)
    if (chatStore.isConversationStreaming(conversationId)) {
      retryCount.delete(conversationId)
      return true
    }

    const conv = chatStore.conversations.find((c: { id: string }) => c.id === conversationId)
    if (!conv) {
      console.warn('[GlobalNotifications] Conversation not found for streaming:', conversationId)
      return false
    }

    // Success — clear retry counter
    retryCount.delete(conversationId)

    // Add user message if not yet present (skip if resuming and message unknown)
    if (conv.messages.length === 0 && message) {
      chatStore.addUserMessage(message, conversationId)
    }

    // If there's already an assistant message (e.g. from persisted partial state),
    // reuse it instead of creating a duplicate
    const existingAssistant = [...conv.messages].reverse().find((m: { role: string }) => m.role === 'assistant')
    if (existingAssistant) {
      chatStore.resetMessageForReplay(existingAssistant.id, conversationId)
      chatStore.startConversationStreaming(conversationId)
      activeServerJob = {
        conversationId,
        messageId: existingAssistant.id,
        currentTextBlockId: null,
        currentToolBlockId: null,
        currentToolInputJson: '',
        isReplaying: false,
        replayBuffer: [],
      }
      ws.send(JSON.stringify({ type: 'subscribe', conversationId, cursor: 0 }))
      console.log('[GlobalNotifications] Resumed server job streaming (existing msg):', conversationId)
      return true
    }

    // Add assistant message placeholder
    const assistantMsg = chatStore.addAssistantMessage(conversationId)
    chatStore.initContentBlocks(assistantMsg.id, conversationId)
    chatStore.startConversationStreaming(conversationId)

    activeServerJob = {
      conversationId,
      messageId: assistantMsg.id,
      currentTextBlockId: null,
      currentToolBlockId: null,
      currentToolInputJson: '',
      isReplaying: false,
      replayBuffer: [],
    }

    // Subscribe this WebSocket to the conversation's event channel with full replay
    ws.send(JSON.stringify({
      type: 'subscribe',
      conversationId,
      cursor: 0,
    }))

    console.log('[GlobalNotifications] Subscribed to server job streaming:', conversationId)
    return true
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

    if (msg.notificationEvent === 'job_created') {
      // Set up streaming after refresh for jobs initiated elsewhere
      // (both server-initiated and user-initiated from another browser)
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
      retryCount.delete(msg.conversationId)
      debouncedRefresh()
      return
    }

    if (msg.notificationEvent === 'job_completed') {
      // job_completed fires before flush; streaming continues until job_persisted
      return
    }

    if (msg.notificationEvent === 'conversation_archived') {
      debouncedRefresh()
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

    // Replay buffering: accumulate events during replay for batch processing
    if (msg.type === 'replay_start') {
      job.isReplaying = true
      job.replayBuffer = []
      return
    }
    if (msg.type === 'replay_end') {
      processReplayBatch(job)
      job.isReplaying = false
      job.replayBuffer = []
      return
    }

    if (job.isReplaying) {
      if (msg.type === 'ui_event' || msg.type === 'done' || msg.type === 'error') {
        job.replayBuffer.push(msg)
      }
      return
    }

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

    // subscribed — informational, ignore
  }

  /**
   * Batch-process replay buffer: extract text blocks only (lightweight)
   * and set them in a single store update.
   */
  function processReplayBatch(job: ServerJobState) {
    const blocks: ContentBlock[] = []
    let flatText = ''
    let currentTextBlockId: string | null = null
    let currentToolIndex: number | null = null
    let currentToolInputJson = ''

    for (const msg of job.replayBuffer) {
      if (msg.type !== 'ui_event' || !msg.event) continue
      const event = msg.event as UIStreamEvent

      switch (event.type) {
        case 'block_start':
          if (event.blockType === 'text') {
            const blockId = event.blockId || generateBlockId()
            blocks.push({ id: blockId, type: 'text', text: event.text || '' } as TextBlock)
            currentTextBlockId = blockId
            currentToolIndex = null
            if (event.text) flatText += event.text
          } else if (event.blockType === 'tool_use' && event.toolUseId && event.name) {
            const blockId = event.blockId || generateBlockId()
            blocks.push({
              id: blockId,
              type: 'tool_use',
              toolUseId: event.toolUseId,
              name: event.name,
              input: {},
              inputSummary: '',
              status: 'running',
            } as ToolUseBlock)
            currentTextBlockId = null
            currentToolIndex = event.index ?? 0
            currentToolInputJson = ''
          }
          break
        case 'block_delta':
          if (event.text && currentTextBlockId) {
            const block = blocks.find(b => b.id === currentTextBlockId)
            if (block && block.type === 'text') {
              (block as TextBlock).text += event.text
              flatText += event.text
            }
          }
          if (event.partialJson && currentToolIndex !== null) {
            currentToolInputJson += event.partialJson
          }
          break
        case 'block_end':
          if (currentTextBlockId) currentTextBlockId = null
          if (currentToolIndex !== null) {
            // Finalize the tool_use block with parsed input
            const toolBlock = [...blocks].reverse().find(b => b.type === 'tool_use') as ToolUseBlock | undefined
            if (toolBlock) {
              let input: Record<string, unknown> = {}
              try { input = JSON.parse(currentToolInputJson) } catch {}
              toolBlock.input = input
              toolBlock.inputSummary = formatToolInputSummary(input)
              toolBlock.status = 'pending'
            }
            currentToolIndex = null
            currentToolInputJson = ''
          }
          break
        case 'tool_result': {
          // Find matching tool_use and update status
          const matchingTool = [...blocks].reverse().find(
            b => b.type === 'tool_use' && (b as ToolUseBlock).toolUseId === event.toolUseId,
          ) as ToolUseBlock | undefined
          if (matchingTool) {
            matchingTool.status = event.isError ? 'error' : 'complete'
          }
          // Add tool_result block
          blocks.push({
            id: generateBlockId(),
            type: 'tool_result',
            toolUseId: event.toolUseId,
            content: event.content || '',
            isError: !!event.isError,
          } as ToolResultBlock)
          break
        }
      }
    }

    // Single reactive update
    if (blocks.length > 0) {
      chatStore.batchSetMessageBlocks(
        job.messageId,
        blocks,
        flatText,
        'streaming', // job_persisted will set final status
        job.conversationId,
      )
    }

    job.currentTextBlockId = currentTextBlockId
    job.currentToolBlockId = null
    job.currentToolInputJson = ''
    console.log(`[GlobalNotifications] Replay batch: ${job.replayBuffer.length} events → ${blocks.length} blocks`)
  }

  function formatToolInputSummary(input: Record<string, unknown>): string {
    if (input.file_path) return String(input.file_path)
    if (input.path) return String(input.path)
    if (input.command) return String(input.command).slice(0, 50)
    return ''
  }

  function processUIEvent(job: ServerJobState, event: UIStreamEvent, convId: string) {
    switch (event.type) {
      case 'block_start': {
        if (event.blockType === 'text') {
          const blockId = event.blockId || generateBlockId()
          const block: TextBlock = { id: blockId, type: 'text', text: event.text || '' }
          chatStore.appendContentBlock(job.messageId, block, convId)
          job.currentTextBlockId = blockId
          job.currentToolBlockId = null
          if (event.text) {
            chatStore.appendToMessage(job.messageId, event.text, convId)
          }
        } else if (event.blockType === 'tool_use' && event.toolUseId && event.name) {
          const blockId = event.blockId || generateBlockId()
          const block: ToolUseBlock = {
            id: blockId,
            type: 'tool_use',
            toolUseId: event.toolUseId,
            name: event.name,
            input: {},
            inputSummary: '',
            status: 'running',
          }
          chatStore.appendContentBlock(job.messageId, block, convId)
          job.currentToolBlockId = blockId
          job.currentToolInputJson = ''
          job.currentTextBlockId = null
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
        if (event.partialJson && job.currentToolBlockId) {
          job.currentToolInputJson += event.partialJson
        }
        break
      }
      case 'block_end': {
        if (job.currentTextBlockId) {
          job.currentTextBlockId = null
        }
        if (job.currentToolBlockId) {
          // Finalize tool_use block with parsed input
          const toolBlockId = job.currentToolBlockId
          const inputJson = job.currentToolInputJson
          chatStore.updateBlockById(job.messageId, toolBlockId, (block) => {
            if (block.type === 'tool_use') {
              const tb = block as ToolUseBlock
              let input: Record<string, unknown> = {}
              try { input = JSON.parse(inputJson) } catch {}
              tb.input = input
              tb.inputSummary = formatToolInputSummary(input)
              tb.status = 'pending'
            }
          }, convId)
          job.currentToolBlockId = null
          job.currentToolInputJson = ''
        }
        break
      }
      case 'tool_result': {
        // Update matching tool_use status
        if (event.toolUseId) {
          const toolBlock = chatStore.findToolUseBlock(job.messageId, event.toolUseId, convId)
          if (toolBlock) {
            chatStore.updateBlockById(job.messageId, toolBlock.id, (block) => {
              if (block.type === 'tool_use') {
                (block as ToolUseBlock).status = event.isError ? 'error' : 'complete'
              }
            }, convId)
          }
          // Add tool_result block
          const resultBlock: ToolResultBlock = {
            id: generateBlockId(),
            type: 'tool_result',
            toolUseId: event.toolUseId,
            content: event.content || '',
            isError: !!event.isError,
          }
          chatStore.appendContentBlock(job.messageId, resultBlock, convId)
        }
        break
      }
      case 'session_init':
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
    for (const timer of retryTimers.values()) clearTimeout(timer)
    retryTimers.clear()
    retryCount.clear()
    pendingJobs.clear()
    if (activeServerJob) {
      chatStore.endConversationStreaming(activeServerJob.conversationId)
      activeServerJob = null
    }
    if (ws) {
      ws.close()
      ws = null
    }
  }

  /**
   * After the initial conversation load, check for server-initiated jobs that
   * were running before a page reload and resume streaming for them.
   */
  async function resumeActiveServerJobs() {
    try {
      const allJobs = await $fetch<Array<{
        id: string
        status: string
        eventCount: number
        conversationId: string
        source?: string
      }>>('/api/jobs')

      // Find active non-user jobs that have events to replay
      const activeServerJobs = allJobs.filter(j =>
        j.source !== 'user'
        && (j.status === 'running' || j.status === 'waiting_permission' || j.status === 'queued'
          || (j.status === 'done' && j.eventCount > 0))
      )

      if (activeServerJobs.length === 0) return

      // Refresh conversations first so the store has them
      await chatStore.refreshServerConversations()

      for (const job of activeServerJobs) {
        // Skip if already streaming (e.g. another path already resumed it)
        if (chatStore.isConversationStreaming(job.conversationId)) continue

        const conv = chatStore.conversations.find((c: { id: string }) => c.id === job.conversationId)
        if (!conv) continue

        // If conversation already has a completed assistant message, skip
        const lastMsg = [...conv.messages].reverse().find((m: { role: string }) => m.role === 'assistant')
        if (lastMsg && (lastMsg.status === 'complete' || lastMsg.status === 'error' || lastMsg.status === 'stopped')) continue

        console.log('[GlobalNotifications] Resuming active server job:', job.id, 'for conversation:', job.conversationId)
        const success = setupServerJobStreaming(job.conversationId, '')
        if (!success) {
          // WS might not be open yet after page reload — use the retry mechanism
          console.log('[GlobalNotifications] WS not ready for resume, queuing for retry:', job.conversationId)
          pendingJobs.set(job.conversationId, '')
          debouncedRefresh()
        }
      }
    } catch (err) {
      console.warn('[GlobalNotifications] Failed to check for active server jobs:', err)
    }
  }

  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return { connect, disconnect, resumeActiveServerJobs }
}
