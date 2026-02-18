/**
 * Chat Stream Composable
 * Handles per-conversation WebSocket streaming for chat responses
 */

import { useChatStore } from '~/stores/chat'
import { useSettingsStore } from '~/stores/settings'
import type { PermissionRequest, PlanApproval, TextBlock, ThinkingBlock, ToolUseBlock, ToolResultBlock, ResultSummaryBlock, SessionInitBlock } from '~/types/chat'
import { DEFAULT_MODEL_KEY, DEFAULT_PROVIDER_ID } from '~/types/aiProvider'
import { generateBlockId } from '~/types/chat'
import {
  buildStreamOptsFromConversation,
  createRequestId,
  createSessionId,
  formatToolInputSummary,
  isSpeckitResetCommand,
  parsePermissionRequestFromText,
} from '~/utils/chatStream'

// Provider SDK message types
interface StreamEvent {
  type: 'stream_event'
  event: {
    type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_stop'
    index?: number
    delta?: {
      type?: string
      text?: string
      thinking?: string
      partial_json?: string
    }
    content_block?: {
      type: string
      id?: string
      name?: string
      text?: string
      thinking?: string
      input?: Record<string, unknown>
    }
  }
  session_id?: string
}

interface ToolResultMessage {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
  session_id?: string
}

interface PermissionRequestMessage {
  type: 'permission_request'
  permission: {
    tool: string
    path?: string
    file_path?: string
    command?: string
    description?: string
    [key: string]: unknown
  }
  session_id?: string
}

interface ResultMessage {
  type: 'result'
  subtype: 'success' | 'error_max_turns' | 'error_during_execution'
  result?: string
  total_cost_usd?: number
  duration_ms?: number
  duration_api_ms?: number
  num_turns?: number
  usage?: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  }
  session_id?: string
  is_error?: boolean
}

interface SystemMessage {
  type: 'system'
  subtype?: string
  model?: string
  tools?: string[]
  permissionMode?: string
  cwd?: string
  session_id?: string
}

type SDKMessage = StreamEvent | ToolResultMessage | PermissionRequestMessage | ResultMessage | SystemMessage | { type: string }

interface WSResponse {
  type: 'provider_json' | 'done' | 'error' | 'pong' | 'permission_prompt' | 'permission_request' | 'session_reset' | 'worktree_recovered' | 'aborted' | 'context_reset'
  data?: SDKMessage
  error?: string
  requestId?: string
  text?: string  // For permission_prompt
  tool?: string  // For permission_request
  description?: string  // For permission_request
  reason?: string  // For session_reset
  denied?: boolean  // For done after permission denial
}

function extractProviderSessionId(msg: SDKMessage): string | null {
  if (!msg || typeof msg !== 'object') return null
  const record = msg as Record<string, unknown>
  const keys = ['session_id', 'sessionId', 'conversation_id', 'conversationId', 'thread_id', 'threadId']
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  const response = record.response
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const responseObj = response as Record<string, unknown>
    for (const key of keys) {
      const value = responseObj[key]
      if (typeof value === 'string' && value.length > 0) {
        return value
      }
    }
  }

  return null
}

// Track tool info
interface ActiveTool {
  blockId: string   // ContentBlock ID
  toolUseId: string // SDK tool_use ID
  name: string
  inputJson: string
}

// Per-conversation connection state
interface ConnectionState {
  ws: WebSocket
  currentMessageId: string
  conversationId: string
  activeTools: Map<number, ActiveTool>
  currentTextBlockId: string | null
  currentThinkingBlockId: string | null
  healthCheckInterval: ReturnType<typeof setInterval> | null
  lastMessageTime: number
  lastServerError: string | null
  lastSocketError: string | null
}

// Module-level connection pool (shared across all composable instances)
const connections = new Map<string, ConnectionState>()

// Per-conversation cascade state
const cascadeStates = new Map<string, { queue: string[], featureId: string }>()
const rolloutRecoveryAttempts = new Set<string>()

// Health check constants
const HEALTH_CHECK_INTERVAL_MS = 30_000  // Check every 30s
const STREAMING_TIMEOUT_MS = 180_000     // 3 min with no messages → timeout

function summarizeCloseCode(code: number): string {
  switch (code) {
    case 1000:
      return 'Normal closure'
    case 1001:
      return 'Endpoint is going away (server shutdown or page navigation)'
    case 1002:
      return 'Protocol error'
    case 1003:
      return 'Unsupported data'
    case 1005:
      return 'No status code received from peer (close frame had no code)'
    case 1006:
      return 'Abnormal closure (connection dropped without close frame)'
    case 1007:
      return 'Invalid payload data'
    case 1008:
      return 'Policy violation'
    case 1009:
      return 'Message too big'
    case 1010:
      return 'Missing required extension'
    case 1011:
      return 'Internal server error'
    case 1012:
      return 'Service restart'
    case 1013:
      return 'Try again later (temporary overload)'
    case 1015:
      return 'TLS handshake failure'
    default:
      if (code >= 4000 && code <= 4999) {
        return 'Application-specific close code'
      }
      return 'Unknown close code'
  }
}

function buildCloseReason(event: CloseEvent, conn?: ConnectionState): string {
  const parts: string[] = []
  if (event.reason) {
    parts.push(event.reason)
  } else {
    parts.push(summarizeCloseCode(event.code))
  }

  if (conn?.lastServerError) {
    parts.push(`Last server error: ${conn.lastServerError}`)
  } else if (conn?.lastSocketError) {
    parts.push(`Last socket error: ${conn.lastSocketError}`)
  }

  parts.push(`wasClean: ${event.wasClean ? 'yes' : 'no'}`)
  return parts.join(' | ')
}

export function useChatStream() {
  const chatStore = useChatStore()
  const settingsStore = useSettingsStore()

  function isPageFocused(): boolean {
    if (typeof document === 'undefined') return false
    if (typeof document.hasFocus !== 'function') return false
    return document.visibilityState === 'visible' && document.hasFocus()
  }

  function createCompletionNotification(conversationId: string) {
    const conv = chatStore.conversations.find((c: { id: string }) => c.id === conversationId)
    const title = conv?.title?.trim() || 'Chat'
    return new Notification('Spec Cat', {
      body: `${title} response completed.`,
      tag: `chat-complete-${conversationId}`,
    })
  }

  async function notifyChatCompleted(conversationId: string) {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return
    if (isPageFocused()) return

    if (Notification.permission === 'granted') {
      createCompletionNotification(conversationId)
      return
    }

    if (Notification.permission !== 'default') return

    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        createCompletionNotification(conversationId)
      }
    } catch (error) {
      console.warn('[useChatStream] Failed to request browser notification permission:', error)
    }
  }

  /**
   * Get WebSocket URL
   */
  function getWsUrl(): string {
    if (typeof window === 'undefined') return ''
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/_ws`
  }

  /**
   * Clear health check interval for a connection
   */
  function clearHealthCheck(conn: ConnectionState) {
    if (conn.healthCheckInterval) {
      clearInterval(conn.healthCheckInterval)
      conn.healthCheckInterval = null
    }
  }

  /**
   * Start health check interval for a connection
   */
  function startHealthCheck(conn: ConnectionState) {
    clearHealthCheck(conn)
    conn.lastMessageTime = Date.now()
    conn.healthCheckInterval = setInterval(() => {
      const convId = conn.conversationId

      // WebSocket no longer open — clean up streaming state
      if (conn.ws.readyState !== WebSocket.OPEN) {
        console.warn(`[useChatStream] Health check: WebSocket not open for ${convId}`)
        clearHealthCheck(conn)
        if (chatStore.isConversationStreaming(convId)) {
          markRunningToolBlocks(conn.currentMessageId, convId, 'error')
          chatStore.updateMessage(conn.currentMessageId, { status: 'error' }, convId)
          chatStore.setSessionError('Connection lost during streaming', convId)
          chatStore.endSession(convId)
          chatStore.endConversationStreaming(convId)
        }
        connections.delete(convId)
        return
      }

      // Streaming with no messages for too long — timeout
      if (chatStore.isConversationStreaming(convId)) {
        const elapsed = Date.now() - conn.lastMessageTime
        if (elapsed > STREAMING_TIMEOUT_MS) {
          console.warn(`[useChatStream] Health check: streaming timeout for ${convId} (${Math.round(elapsed / 1000)}s)`)
          clearHealthCheck(conn)
          markRunningToolBlocks(conn.currentMessageId, convId, 'error')
          chatStore.updateMessage(conn.currentMessageId, { status: 'error' }, convId)
          chatStore.setSessionError('Streaming timed out — no response from server for 3 minutes', convId)
          chatStore.endSession(convId)
          chatStore.endConversationStreaming(convId)
          // Close the stale connection
          conn.ws.close()
          connections.delete(convId)
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS)
  }

  function getMessageStatus(conversationId: string, messageId: string): 'streaming' | 'complete' | 'stopped' | 'error' | undefined {
    const conv = chatStore.conversations.find((c: { id: string }) => c.id === conversationId)
    return conv?.messages.find((m: { id: string; status?: 'streaming' | 'complete' | 'stopped' | 'error' }) => m.id === messageId)?.status
  }

  function cleanupConnection(conversationId: string, closeSocket = true) {
    const conn = connections.get(conversationId)
    if (!conn) return
    clearHealthCheck(conn)
    if (closeSocket && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.close()
    }
    connections.delete(conversationId)
  }

  /**
   * Mark all running tool_use blocks as complete or error when session ends
   */
  function markRunningToolBlocks(messageId: string, conversationId: string, status: 'complete' | 'error') {
    const convObj = chatStore.conversations.find((c: { id: string }) => c.id === conversationId)
    const msg = convObj?.messages.find((m: { id: string }) => m.id === messageId)
    if (!msg?.contentBlocks) return
    for (const block of msg.contentBlocks) {
      if (block.type === 'tool_use' && (block.status === 'running' || block.status === 'pending')) {
        chatStore.updateBlockById(messageId, block.id, (b) => {
          if (b.type === 'tool_use') {
            (b as ToolUseBlock).status = status
          }
        }, conversationId)
      }
    }
  }

  /**
   * Reset AI context (clear provider session and approved tools)
   * Does not delete chat messages - only resets the AI's conversation context
   */
  async function resetContext(conversationId: string) {
    try {
      const ws = await ensureConnection(conversationId)
      ws.send(JSON.stringify({ type: 'reset_context' }))
      
      // Clear local session state
      chatStore.clearProviderSession(conversationId)
      
      console.log('[useChatStream] Context reset requested for conversation:', conversationId)
    } catch (error) {
      console.error('[useChatStream] Failed to reset context:', error)
      throw error
    }
  }

  /**
   * Ensure WebSocket is connected for a specific conversation
   */
  function ensureConnection(conversationId: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const existing = connections.get(conversationId)
      if (existing && existing.ws.readyState === WebSocket.OPEN) {
        resolve(existing.ws)
        return
      }

      // Close existing connection for this conversation if any
      if (existing) {
        existing.ws.close()
        connections.delete(conversationId)
      }

      const url = getWsUrl()
      const ws = new WebSocket(url)

      // Create connection state
      const connState: ConnectionState = {
        ws,
        currentMessageId: '',
        conversationId,
        activeTools: new Map(),
        currentTextBlockId: null,
        currentThinkingBlockId: null,
        healthCheckInterval: null,
        lastMessageTime: Date.now(),
        lastServerError: null,
        lastSocketError: null,
      }
      connections.set(conversationId, connState)

      ws.onopen = () => {
        resolve(ws)
      }

      ws.onerror = (event) => {
        console.error(`[useChatStream] WebSocket error for conversation ${conversationId}:`, event)
        const conn = connections.get(conversationId)
        if (conn) {
          conn.lastSocketError = 'Browser reported a WebSocket transport error (network/proxy/server)'
        }
        if (chatStore.isConversationStreaming(conversationId)) {
          if (conn?.currentMessageId) {
            markRunningToolBlocks(conn.currentMessageId, conversationId, 'error')
            chatStore.updateMessage(conn.currentMessageId, { status: 'error' }, conversationId)
          }
          chatStore.setSessionError('Connection error during streaming', conversationId)
          chatStore.endSession(conversationId)
          chatStore.endConversationStreaming(conversationId)
        }
        connections.delete(conversationId)
        reject(new Error('WebSocket connection failed. Server may be unavailable.'))
      }

      ws.onclose = (event) => {
        const conn = connections.get(conversationId)
        if (conn) clearHealthCheck(conn)
        connections.delete(conversationId)
        cascadeStates.delete(conversationId)

        // If we were streaming, mark as error
        if (chatStore.isConversationStreaming(conversationId)) {
          if (conn?.currentMessageId) {
            markRunningToolBlocks(conn.currentMessageId, conversationId, 'error')
            chatStore.updateMessage(conn.currentMessageId, { status: 'error' }, conversationId)
          }
          const reason = buildCloseReason(event, conn)
          chatStore.setSessionError(`Connection closed: ${reason} (code: ${event.code})`, conversationId)
          chatStore.endSession(conversationId)
          chatStore.endConversationStreaming(conversationId)
        }
      }

      ws.onmessage = (event) => {
        handleMessage(event.data, conversationId)
      }
    })
  }

  /**
   * Find conversation with retry (store may not be synced yet after endSession)
   */
  async function findConversationWithRetry(id: string, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      const conv = chatStore.conversations.find((c: { id: string }) => c.id === id)
      if (conv) return conv
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 100))
      }
    }
    console.error('[useChatStream] Conversation not found after retries:', id)
    return undefined
  }

  function buildRecoveryKey(conversationId: string, messageId: string): string {
    return `${conversationId}:${messageId}`
  }

  function findUserPromptForAssistantMessage(conversationId: string, assistantMessageId: string): string | null {
    const conv = chatStore.conversations.find((c: { id: string }) => c.id === conversationId)
    if (!conv) return null

    const assistantIndex = conv.messages.findIndex((m: { id: string }) => m.id === assistantMessageId)
    if (assistantIndex <= 0) return null

    for (let i = assistantIndex - 1; i >= 0; i--) {
      const msg = conv.messages[i]
      if (msg.role === 'user' && msg.content.trim().length > 0) {
        return msg.content
      }
    }

    return null
  }

  /**
   * Handle incoming WebSocket message for a specific conversation
   */
  async function handleMessage(data: string, conversationId: string) {
    const conn = connections.get(conversationId)
    if (!conn) return

    // Update last message time for health check
    conn.lastMessageTime = Date.now()

    try {
      chatStore.pushDebugEvent({
        direction: 'in',
        channel: 'ws',
        eventType: 'ws.raw',
        payload: data,
      }, conversationId)

      const response: WSResponse = JSON.parse(data)
      chatStore.pushDebugEvent({
        direction: 'in',
        channel: 'ws',
        eventType: response.type,
        payload: response,
      }, conversationId)

      if (response.type === 'error') {
        console.error(`[useChatStream] Server error for ${conversationId}:`, response.error)
        const errorMsg = response.error || 'Unknown server error'
        conn.lastServerError = errorMsg
        const hasCodexPermissionError = /codex cannot access session files|failed to clean up stale arg0 temp dirs: Permission denied|failed to initialize rollout recorder: Permission denied|failed to create session: Permission denied|\/\.codex\/.*permission denied/i.test(errorMsg)
        const missingRolloutPath = /state db missing rollout path for thread/i.test(errorMsg)
        if (missingRolloutPath && !hasCodexPermissionError) {
          const recoveryKey = buildRecoveryKey(conversationId, conn.currentMessageId)
          if (!rolloutRecoveryAttempts.has(recoveryKey)) {
            const prompt = findUserPromptForAssistantMessage(conversationId, conn.currentMessageId)
            if (prompt) {
              rolloutRecoveryAttempts.add(recoveryKey)
              chatStore.setProviderSessionId('', conversationId)
              appendTextBlock(
                conn.currentMessageId,
                '\n\n> **Session Reset**: Codex resume state was corrupted. Retrying once with a fresh session...\n\n',
                conversationId,
              )
              try {
                const conv = chatStore.conversations.find((c: { id: string }) => c.id === conversationId)
                const streamOpts = buildStreamOptsFromConversation(conv)
                await sendMessage(prompt, conn.currentMessageId, conversationId, streamOpts)
                return
              } catch (retryError) {
                console.error(`[useChatStream] Rollout-path recovery retry failed for ${conversationId}:`, retryError)
              }
            }
          }
        }

        clearHealthCheck(conn)
        // Mark any remaining running tool_use blocks as error
        markRunningToolBlocks(conn.currentMessageId, conversationId, 'error')
        chatStore.updateMessage(conn.currentMessageId, { status: 'error' }, conversationId)
        if (/state db missing rollout path for thread/i.test(errorMsg)) {
          // Ensure next send is fresh even if server-side reset was missed.
          chatStore.setProviderSessionId('', conversationId)
        }
        rolloutRecoveryAttempts.delete(buildRecoveryKey(conversationId, conn.currentMessageId))
        chatStore.setSessionError(errorMsg, conversationId)
        chatStore.endSession(conversationId)
        chatStore.endConversationStreaming(conversationId)
        // Stop cascade on error
        disableCascade(conversationId)
        chatStore.saveConversation(conversationId, true)
        cleanupConnection(conversationId)
        return
      }

      if (response.type === 'done') {
        clearHealthCheck(conn)
        const currentStatus = getMessageStatus(conversationId, conn.currentMessageId)
        rolloutRecoveryAttempts.delete(buildRecoveryKey(conversationId, conn.currentMessageId))

        // Permission denial is a stopped state, not a successful completion.
        if (response.denied) {
          markRunningToolBlocks(conn.currentMessageId, conversationId, 'error')
          chatStore.updateMessage(conn.currentMessageId, { status: 'stopped' }, conversationId)
          chatStore.endSession(conversationId)
          chatStore.endConversationStreaming(conversationId)
          disableCascade(conversationId)
          chatStore.clearPendingPermission(conversationId)
          conn.activeTools.clear()
          chatStore.saveConversation(conversationId, true)
          cleanupConnection(conversationId)
          return
        }

        // If a prior event already marked terminal failure, keep that status.
        if (currentStatus === 'error' || currentStatus === 'stopped') {
          markRunningToolBlocks(conn.currentMessageId, conversationId, 'error')
          chatStore.endSession(conversationId)
          chatStore.endConversationStreaming(conversationId)
          disableCascade(conversationId)
          chatStore.clearPendingPermission(conversationId)
          conn.activeTools.clear()
          chatStore.saveConversation(conversationId, true)
          cleanupConnection(conversationId)
          return
        }

        // Mark any remaining running tool_use blocks as complete
        markRunningToolBlocks(conn.currentMessageId, conversationId, 'complete')
        chatStore.completeMessageWithSave(conn.currentMessageId, conversationId)
        chatStore.endSession(conversationId)
        chatStore.endConversationStreaming(conversationId)
        notifyChatCompleted(conversationId)

        // Find conversation with retry (store may not be synced yet)
        const conv = await findConversationWithRetry(conversationId)

        // Auto-commit changes in worktree, then sync preview if active
        const commitPromise = (conv?.hasWorktree && conv.worktreePath)
          ? $fetch('/api/chat/worktree-commit', {
              method: 'POST',
              body: { worktreePath: conv.worktreePath, conversationId },
            }).then((result: any) => {
              if (conv.previewBranch && conv.worktreePath) {
                return fetch('/api/chat/preview-sync', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ previewBranch: conv.previewBranch, worktreePath: conv.worktreePath }),
                }).then(() => result)
              }
              return result
            }).then((result: any) => {
              // Update UI if branch changed or commits were made
              if (result?.success && result.currentBranch !== conv.worktreeBranch) {
                const oldBranch = conv.worktreeBranch
                chatStore.updateWorktreeBranch(conversationId, result.currentBranch)
                appendTextBlock(
                  conn.currentMessageId,
                  `\n\n> **Branch changed**: AI switched from \`${oldBranch}\` to \`${result.currentBranch}\`\n\n`,
                  conversationId,
                )
              } else if (result?.success && conv.worktreeBranch) {
                // No branch change, but commits may have been made - update lastCommitTime to refresh UI
                chatStore.updateWorktreeBranch(conversationId, conv.worktreeBranch)
              }

              chatStore.saveConversation(conversationId, false)
              return result
            }).catch((err: unknown) => {
              console.warn('[useChatStream] Auto-commit/preview-sync failed:', err)
            })
          : Promise.resolve()

        // Cascade: after auto-commit settles, send next step if queued
        const cascade = cascadeStates.get(conversationId)
        if (cascade && cascade.queue.length > 0) {
          const nextStep = cascade.queue.shift()!
          const featureId = cascade.featureId
          commitPromise.then(() => {
            // Small delay to let auto-commit settle
            setTimeout(() => {
              sendCascadeStep(conversationId, featureId, nextStep)
            }, 1500)
          })
          // Clean up if queue is now empty
          if (cascade.queue.length === 0) {
            cascadeStates.delete(conversationId)
          }
        }

        chatStore.clearPendingPermission(conversationId)
        chatStore.saveConversation(conversationId, true)
        conn.activeTools.clear()
        cleanupConnection(conversationId)
        cascadeStates.delete(conversationId)
        return
      }

      if (response.type === 'pong') {
        return
      }

      // Handle session reset — server is retrying without --resume
      if (response.type === 'session_reset') {
        console.warn(`[useChatStream] Session reset for ${conversationId}:`, response.reason)
        chatStore.setProviderSessionId('', conversationId)
        appendTextBlock(
          conn.currentMessageId,
          '\n\n> **Session Reset**: Previous session could not be resumed. Retrying with a fresh session...\n\n',
          conversationId,
        )
        return
      }

      // Handle worktree recovery notice
      if (response.type === 'worktree_recovered') {
        console.log(`[useChatStream] Worktree recovered for ${conversationId}`)
        appendTextBlock(
          conn.currentMessageId,
          '\n\n> **Worktree recovered**: The work directory was restored after a system restart.\n\n',
          conversationId,
        )
        return
      }

      // Handle context reset confirmation
      if (response.type === 'context_reset') {
        console.log(`[useChatStream] Context reset confirmed for ${conversationId}`)
        return
      }

      // Handle aborted confirmation
      if (response.type === 'aborted') {
        console.log(`[useChatStream] Abort confirmed for ${conversationId}`)
        return
      }

      // Handle permission request from server
      if (response.type === 'permission_request') {
        // Claude CLI exits while waiting for permission approval.
        // Move UI out of "streaming" until user responds.
        clearHealthCheck(conn)
        chatStore.endConversationStreaming(conversationId)

        const request: PermissionRequest = parsePermissionRequestFromText(
          response.description || '',
          response.tool || 'Permission',
        )

        chatStore.setPendingPermission(request, conversationId)

        let permText = `\n\n**Permission Required**: ${request.tool}`
        if (request.filePath) permText += ` - ${request.filePath}`
        appendTextBlock(conn.currentMessageId, permText + '\n', conversationId)
        return
      }

      // Handle permission prompt from PTY (legacy format)
      if (response.type === 'permission_prompt' && response.text) {
        // Legacy permission prompt path has the same lifecycle as permission_request.
        clearHealthCheck(conn)
        chatStore.endConversationStreaming(conversationId)

        const request: PermissionRequest = parsePermissionRequestFromText(response.text, 'Permission')

        chatStore.setPendingPermission(request, conversationId)

        const permText = `\n\n**${request.tool}**: ${request.filePath || request.command || request.description}\n`
        appendTextBlock(conn.currentMessageId, permText, conversationId)
        return
      }

      if (response.type === 'provider_json' && response.data) {
        processSDKMessage(response.data, conversationId)
      }
    } catch (e) {
      console.error(`[useChatStream] Failed to parse WebSocket message for ${conversationId}:`, e, 'Raw data:', data?.slice(0, 200))
      markRunningToolBlocks(conn.currentMessageId, conversationId, 'error')
      chatStore.updateMessage(conn.currentMessageId, { status: 'error' }, conversationId)
      chatStore.setSessionError(`Failed to parse server response: ${e instanceof Error ? e.message : 'Invalid JSON'}`, conversationId)
      chatStore.endSession(conversationId)
      chatStore.endConversationStreaming(conversationId)
      disableCascade(conversationId)
      chatStore.saveConversation(conversationId, true)
      cleanupConnection(conversationId)
    }
  }

  /**
   * Ensure a message has contentBlocks initialized
   */
  function ensureBlocks(messageId: string, conversationId: string) {
    chatStore.initContentBlocks(messageId, conversationId)
  }

  /**
   * Append a TextBlock with the given text (for system notifications like permission, session reset)
   */
  function appendTextBlock(messageId: string, text: string, conversationId: string) {
    ensureBlocks(messageId, conversationId)
    const block: TextBlock = { id: generateBlockId(), type: 'text', text }
    chatStore.appendContentBlockWithSave(messageId, block, conversationId)
  }

  function hasSessionInitBlock(messageId: string, conversationId: string): boolean {
    const conv = chatStore.conversations.find((c: { id: string }) => c.id === conversationId)
    const msg = conv?.messages.find((m: { id: string }) => m.id === messageId)
    return !!msg?.contentBlocks?.some((block) => block.type === 'session_init')
  }

  /**
   * Process SDK message and build structured content blocks (per-conversation)
   */
  function processSDKMessage(msg: SDKMessage, conversationId: string) {
    const conn = connections.get(conversationId)
    if (!conn) return
    chatStore.pushDebugEvent({
      direction: 'in',
      channel: 'provider',
      eventType: msg.type,
      payload: msg,
    }, conversationId)

    // Capture provider session ID for resume capability, but never from error-shaped events.
    const eventType = typeof msg.type === 'string' ? msg.type.toLowerCase() : ''
    const subtype = 'subtype' in msg && typeof (msg as { subtype?: unknown }).subtype === 'string'
      ? String((msg as { subtype: string }).subtype).toLowerCase()
      : ''
    const isErrorLike = eventType.includes('error') || eventType.includes('failed') || subtype.startsWith('error')
    const extractedSessionId = !isErrorLike ? extractProviderSessionId(msg) : null
    if (extractedSessionId) {
      chatStore.setProviderSessionId(extractedSessionId, conversationId)
    }

    // Handle permission_request from SDK
    if (msg.type === 'permission_request') {
      const permMsg = msg as PermissionRequestMessage
      const perm = permMsg.permission

      const request: PermissionRequest = {
        tool: perm.tool,
        filePath: perm.file_path || perm.path,
        command: perm.command,
        description: perm.description,
        input: perm,
      }

      chatStore.setPendingPermission(request, conversationId)

      let permText = `\n\n**Permission Required**: ${perm.tool}`
      if (request.filePath) permText += ` - ${request.filePath}`
      else if (request.command) permText += ` - \`${request.command}\``
      appendTextBlock(conn.currentMessageId, permText + '\n', conversationId)
      return
    }

    // Handle 'user' type message with tool_result containing permission error
    if (msg.type === 'user') {
      const userMsg = msg as {
        type: 'user'
        message?: { content?: Array<{ type: string; content?: string; is_error?: boolean }> }
        content?: Array<{ type: string; content?: string; is_error?: boolean }>
      }

      const contentArray = userMsg.message?.content || userMsg.content

      if (contentArray) {
        for (const block of contentArray) {
          if (block.type === 'tool_result' && block.is_error && block.content) {
            const content = block.content
            if (content.includes('requested permissions') || content.includes('haven\'t granted')) {
              const request: PermissionRequest = parsePermissionRequestFromText(content, 'Permission')

              chatStore.setPendingPermission(request, conversationId)

              let permText = `\n\n**Permission Required**: ${request.tool}`
              if (request.filePath) permText += ` - ${request.filePath}`
              else if (request.command) permText += ` - \`${request.command}\``
              appendTextBlock(conn.currentMessageId, permText + '\n', conversationId)
              return
            }
          }
        }
      }
    }

    // Handle system message (session init info)
    if (msg.type === 'system') {
      const sysMsg = msg as SystemMessage
      if (sysMsg.subtype === 'init' && sysMsg.model) {
        ensureBlocks(conn.currentMessageId, conversationId)
        const block: SessionInitBlock = {
          id: generateBlockId(),
          type: 'session_init',
          model: sysMsg.model,
          tools: sysMsg.tools || [],
          permissionMode: sysMsg.permissionMode || '',
          cwd: sysMsg.cwd || '',
        }
        chatStore.appendContentBlockWithSave(conn.currentMessageId, block, conversationId)
      }
      return
    }

    // Handle stream_event
    if (msg.type === 'stream_event') {
      const streamEvent = msg as StreamEvent
      const event = streamEvent.event

      if (event.type === 'content_block_start' && event.content_block) {
        const contentBlock = event.content_block

        if (contentBlock.type === 'text') {
          ensureBlocks(conn.currentMessageId, conversationId)
          const blockId = generateBlockId()
          const block: TextBlock = { id: blockId, type: 'text', text: contentBlock.text || '' }
          chatStore.appendContentBlockWithSave(conn.currentMessageId, block, conversationId)
          conn.currentTextBlockId = blockId
        }

        if (contentBlock.type === 'thinking') {
          ensureBlocks(conn.currentMessageId, conversationId)
          const blockId = generateBlockId()
          const block: ThinkingBlock = { id: blockId, type: 'thinking', thinking: contentBlock.thinking || '' }
          chatStore.appendContentBlockWithSave(conn.currentMessageId, block, conversationId)
          conn.currentThinkingBlockId = blockId
        }

        if ((contentBlock.type === 'tool_use' || contentBlock.type === 'server_tool_use') && contentBlock.id && contentBlock.name) {
          ensureBlocks(conn.currentMessageId, conversationId)
          const blockId = generateBlockId()
          const block: ToolUseBlock = {
            id: blockId,
            type: 'tool_use',
            toolUseId: contentBlock.id,
            name: contentBlock.name,
            input: {},
            inputSummary: '',
            status: 'running',
          }
          chatStore.appendContentBlockWithSave(conn.currentMessageId, block, conversationId)
          conn.activeTools.set(event.index ?? 0, {
            blockId,
            toolUseId: contentBlock.id,
            name: contentBlock.name,
            inputJson: '',
          })
        }
      }

      if (event.type === 'content_block_delta' && event.delta) {
        if (event.delta.text && conn.currentTextBlockId) {
          chatStore.updateBlockWithSave(conn.currentMessageId, conn.currentTextBlockId, (block) => {
            if (block.type === 'text') {
              (block as TextBlock).text += event.delta!.text!
            }
          }, conversationId, { syncContent: false })
          // Keep flat content in sync incrementally during streaming deltas.
          chatStore.appendToMessage(conn.currentMessageId, event.delta.text, conversationId)
        }

        if (event.delta.thinking && conn.currentThinkingBlockId) {
          chatStore.updateBlockWithSave(conn.currentMessageId, conn.currentThinkingBlockId, (block) => {
            if (block.type === 'thinking') {
              (block as ThinkingBlock).thinking += event.delta!.thinking!
            }
          }, conversationId, { syncContent: false })
        }

        if (event.delta.partial_json && event.index !== undefined) {
          const tool = conn.activeTools.get(event.index)
          if (tool) {
            tool.inputJson += event.delta.partial_json
          }
        }
      }

      if (event.type === 'content_block_stop') {
        // If a text block was being streamed, clear the tracker
        if (conn.currentTextBlockId) {
          conn.currentTextBlockId = null
        }

        // If a thinking block was being streamed, clear the tracker
        if (conn.currentThinkingBlockId) {
          conn.currentThinkingBlockId = null
        }

        // Handle tool block completion
        if (event.index !== undefined) {
          const tool = conn.activeTools.get(event.index)
          if (tool) {
            // Parse tool input
            let input: Record<string, unknown> = {}
            try {
              input = JSON.parse(tool.inputJson)
            } catch {
              // ignore parse errors
            }

            // Intercept ExitPlanMode — show approval UI
            if (tool.name === 'ExitPlanMode') {
              const approval: PlanApproval = {
                allowedPrompts: input.allowedPrompts as PlanApproval['allowedPrompts'],
              }
              chatStore.setPendingPlanApproval(approval, conversationId)
            }

            // Update the ToolUseBlock with parsed input and mark as pending (waiting for result)
            chatStore.updateBlockWithSave(conn.currentMessageId, tool.blockId, (block) => {
              if (block.type === 'tool_use') {
                const tb = block as ToolUseBlock
                tb.input = input
                tb.inputSummary = formatToolInputSummary(input)
                tb.status = 'pending'
              }
            }, conversationId)
          }
        }
      }

      return
    }

    // Handle tool_result — create ToolResultBlock with full content (no truncation)
    if (msg.type === 'tool_result') {
      const result = msg as ToolResultMessage
      ensureBlocks(conn.currentMessageId, conversationId)

      // Update the matching ToolUseBlock status
      const toolBlock = chatStore.findToolUseBlock(conn.currentMessageId, result.tool_use_id, conversationId)
      if (toolBlock && toolBlock.type === 'tool_use') {
        chatStore.updateBlockById(conn.currentMessageId, toolBlock.id, (block) => {
          if (block.type === 'tool_use') {
            (block as ToolUseBlock).status = result.is_error ? 'error' : 'complete'
          }
        }, conversationId)
      }

      // Create ToolResultBlock
      const block: ToolResultBlock = {
        id: generateBlockId(),
        type: 'tool_result',
        toolUseId: result.tool_use_id,
        content: result.content || '',
        isError: !!result.is_error,
      }
      chatStore.appendContentBlockWithSave(conn.currentMessageId, block, conversationId)

      if (result.is_error) {
        console.warn('[useChatStream] Tool error:', result.content?.slice(0, 500))
      }
      return
    }

    // Handle result message
    if (msg.type === 'result') {
      const result = msg as ResultMessage

      if (result.is_error || result.subtype === 'error_max_turns' || result.subtype === 'error_during_execution') {
        chatStore.updateMessage(conn.currentMessageId, { status: 'error' }, conversationId)
        disableCascade(conversationId)
        if (result.subtype === 'error_max_turns') {
          chatStore.setSessionError('Maximum conversation turns reached. Please start a new conversation.', conversationId)
        } else if (result.subtype === 'error_during_execution') {
          chatStore.setSessionError('An error occurred during provider execution.', conversationId)
        }
        console.error('[useChatStream] Result error:', result.subtype)
      }

      // Add result summary block for successful completions
      if (result.subtype === 'success' && result.usage) {
        ensureBlocks(conn.currentMessageId, conversationId)
        const block: ResultSummaryBlock = {
          id: generateBlockId(),
          type: 'result_summary',
          totalCostUsd: result.total_cost_usd ?? 0,
          durationMs: result.duration_ms ?? 0,
          numTurns: result.num_turns ?? 0,
          usage: {
            inputTokens: result.usage.input_tokens ?? 0,
            outputTokens: result.usage.output_tokens ?? 0,
            cacheCreationInputTokens: result.usage.cache_creation_input_tokens ?? 0,
            cacheReadInputTokens: result.usage.cache_read_input_tokens ?? 0,
          },
        }
        chatStore.appendContentBlockWithSave(conn.currentMessageId, block, conversationId)
      }
    }
  }

  /**
   * Send message via WebSocket (per-conversation)
   */
  async function sendMessage(message: string, messageId: string, conversationId: string, options?: { cwd?: string; worktreeBranch?: string; featureId?: string }) {
    if (typeof window === 'undefined') {
      return
    }

    // Update connection state
    const requestId = createRequestId()

    try {
      const socket = await ensureConnection(conversationId)
      const conn = connections.get(conversationId)
      if (conn) {
        conn.currentMessageId = messageId
        conn.activeTools.clear()
        conn.currentTextBlockId = null
        conn.currentThinkingBlockId = null
        startHealthCheck(conn)
      }

      // Context-reset commands: start fresh session without --resume
      const isContextResetCommand = isSpeckitResetCommand(message)
      if (isContextResetCommand) {
        chatStore.setProviderSessionId('', conversationId)
      }

      const providerSessionId = chatStore.getProviderSessionId(conversationId)

      const conv = chatStore.conversations.find((c: { id: string }) => c.id === conversationId)
      const providerId = conv?.providerId || settingsStore.providerSelection.providerId || DEFAULT_PROVIDER_ID
      const providerModelKey = conv?.providerModelKey || settingsStore.providerSelection.modelKey || DEFAULT_MODEL_KEY

      if (conv && (!conv.providerId || !conv.providerModelKey)) {
        chatStore.setConversationProviderSelection(conversationId, providerId, providerModelKey)
        chatStore.saveConversation(conversationId, true)
      }

      const payload = {
        type: 'chat',
        message,
        requestId,
        sessionId: providerSessionId || undefined,
        permissionMode: chatStore.permissionMode,
        conversationId,
        cwd: options?.cwd,
        worktreeBranch: options?.worktreeBranch,
        featureId: options?.featureId,
        providerId,
        providerModelKey,
      }

      if (providerId === 'codex' && !hasSessionInitBlock(messageId, conversationId)) {
        ensureBlocks(messageId, conversationId)
        const isBypassLike = chatStore.permissionMode === 'bypass' || chatStore.permissionMode === 'auto'
        // Codex tool availability is not tied to ask/bypass mode.
        // Keep a stable synthetic count so session header does not imply "no tools" in ask mode.
        const syntheticToolCount = 32
        const block: SessionInitBlock = {
          id: generateBlockId(),
          type: 'session_init',
          model: providerModelKey,
          tools: Array.from({ length: syntheticToolCount }, (_, idx) => `tool-${idx + 1}`),
          permissionMode: isBypassLike ? 'bypassPermissions' : chatStore.permissionMode,
          cwd: options?.cwd || conv?.cwd || '',
        }
        chatStore.appendContentBlockWithSave(messageId, block, conversationId)
      }

      chatStore.pushDebugEvent({
        direction: 'out',
        channel: 'ws',
        eventType: 'chat',
        payload,
      }, conversationId)
      socket.send(JSON.stringify(payload))
    } catch (error) {
      chatStore.updateMessage(messageId, { status: 'error' }, conversationId)
      chatStore.setSessionError((error as Error).message || 'Connection failed', conversationId)
      chatStore.endSession(conversationId)
      chatStore.endConversationStreaming(conversationId)
      chatStore.saveConversation(conversationId, true)
      cleanupConnection(conversationId)
    }
  }

  /**
   * Send permission response (allow/deny) for a specific conversation
   */
  function sendPermissionResponse(allow: boolean, conversationId?: string) {
    const convId = conversationId ?? chatStore.activeConversationId
    if (!convId) return

    const conn = connections.get(convId)
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
      return
    }

    const payload = {
      type: 'permission_response',
      allow,
    }
    chatStore.pushDebugEvent({
      direction: 'out',
      channel: 'ws',
      eventType: 'permission_response',
      payload,
    }, convId)
    conn.ws.send(JSON.stringify(payload))

    // Re-enter streaming only when resuming execution.
    if (allow) {
      chatStore.startConversationStreaming(convId)
      startHealthCheck(conn)
    }

    const statusText = allow ? 'Allowed' : 'Denied'
    appendTextBlock(conn.currentMessageId, `${statusText}\n`, convId)
    chatStore.clearPendingPermission(convId)
  }

  /**
   * Enable cascade: queue remaining speckit steps to auto-run after each completion
   */
  function enableCascade(featureId: string, conversationId: string, remainingSteps: string[]) {
    cascadeStates.set(conversationId, {
      featureId,
      queue: [...remainingSteps],
    })
  }

  /**
   * Disable cascade for a specific conversation
   */
  function disableCascade(conversationId?: string) {
    if (conversationId) {
      cascadeStates.delete(conversationId)
    } else {
      cascadeStates.clear()
    }
  }

  /**
   * Send the next cascade step as a follow-up message in the same conversation
   */
  async function sendCascadeStep(conversationId: string, featureId: string, step: string) {
    // Make sure the conversation is still selected
    if (chatStore.activeConversationId !== conversationId) {
      chatStore.selectConversation(conversationId)
    }

    // Support skill: prefixed steps (e.g. 'skill:better-spec') — fetch rendered prompt from API
    let prompt: string
    if (step.startsWith('skill:')) {
      const skillId = step.replace('skill:', '')
      try {
        const rendered = await $fetch<{ prompt: string }>(`/api/skills/${skillId}/prompt`, {
          method: 'POST',
          body: { featureId },
        })
        prompt = rendered.prompt
      } catch (err) {
        console.error(`[useChatStream] Failed to render skill prompt for ${skillId}:`, err)
        return
      }
    } else {
      prompt = `/speckit.${step} ${featureId}`
    }
    chatStore.addUserMessage(prompt, conversationId)
    chatStore.saveConversation(conversationId, true)

    const conv = chatStore.conversations.find((c: { id: string }) => c.id === conversationId)
    const assistantMessage = chatStore.addAssistantMessage(conversationId)
    chatStore.startSession(createSessionId(), conversationId)
    chatStore.startConversationStreaming(conversationId)

    const streamOpts = buildStreamOptsFromConversation(conv)
    await sendMessage(prompt, assistantMessage.id, conversationId, streamOpts)
  }

  /**
   * Abort stream for a specific conversation
   */
  function abort(conversationId?: string) {
    const convId = conversationId ?? chatStore.activeConversationId
    if (!convId) return

    const conn = connections.get(convId)
    if (conn) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        const payload = { type: 'abort' }
        chatStore.pushDebugEvent({
          direction: 'out',
          channel: 'ws',
          eventType: 'abort',
          payload,
        }, convId)
        conn.ws.send(JSON.stringify(payload))
        conn.ws.close()
      }
      if (conn.currentMessageId) {
        markRunningToolBlocks(conn.currentMessageId, convId, 'error')
        chatStore.updateMessage(conn.currentMessageId, { status: 'stopped' }, convId)
        chatStore.endSession(convId)
        chatStore.saveConversation(convId, true)
      }
      connections.delete(convId)
    }

    chatStore.endConversationStreaming(convId)
    chatStore.clearPendingPermission(convId)
    disableCascade(convId)
  }

  /**
   * Disconnect a specific conversation's WebSocket (for cleanup from delete flow)
   */
  function disconnectConversation(conversationId: string) {
    const conn = connections.get(conversationId)
    if (conn) {
      clearHealthCheck(conn)
      conn.ws.close()
      connections.delete(conversationId)
    }
    cascadeStates.delete(conversationId)
  }

  /**
   * Disconnect all WebSocket connections
   */
  function disconnect() {
    for (const [id, conn] of connections) {
      clearHealthCheck(conn)
      conn.ws.close()
      connections.delete(id)
    }
    cascadeStates.clear()
  }

  /**
   * Approve plan and start implementation (switches from plan → auto mode, sends follow-up)
   */
  async function approvePlan(conversationId?: string) {
    const convId = conversationId ?? chatStore.activeConversationId
    if (!convId) return

    chatStore.clearPendingPlanApproval(convId)

    // Switch permission mode from plan to auto for implementation
    chatStore.setPermissionMode('auto')

    // Send follow-up message to trigger implementation
    const prompt = 'Approved. Proceed with the implementation.'
    chatStore.addUserMessage(prompt, convId)
    chatStore.saveConversation(convId, true)

    const assistantMessage = chatStore.addAssistantMessage(convId)
    chatStore.startSession(createSessionId(), convId)
    chatStore.startConversationStreaming(convId)

    const conv = chatStore.conversations.find((c: { id: string }) => c.id === convId)
    const streamOpts = buildStreamOptsFromConversation(conv, true)
    await sendMessage(prompt, assistantMessage.id, convId, streamOpts)
  }

  /**
   * Reject plan (clears approval state, user can type feedback)
   */
  function rejectPlan(conversationId?: string) {
    const convId = conversationId ?? chatStore.activeConversationId
    if (!convId) return

    chatStore.clearPendingPlanApproval(convId)
  }

  // Cleanup on unmount
  onUnmounted(() => {
    disconnect()
  })

  return {
    sendMessage,
    sendPermissionResponse,
    approvePlan,
    rejectPlan,
    abort,
    disconnect,
    disconnectConversation,
    enableCascade,
    disableCascade,
    resetContext,
  }
}
