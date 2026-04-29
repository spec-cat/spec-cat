/**
 * Chat Stream Composable
 * Handles per-conversation WebSocket streaming for chat responses
 */

import { useChatStore } from '~/stores/chat'
import { useSettingsStore } from '~/stores/settings'
import type {
  PermissionRequest,
  PlanApproval,
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
  ResultSummaryBlock,
  SessionInitBlock,
  ChatImageAttachment,
  UIStreamEvent,
} from '~/types/chat'
import { DEFAULT_MODEL_KEY, DEFAULT_PROVIDER_ID } from '~/types/aiProvider'
import { generateBlockId } from '~/types/chat'
import {
  buildCloseReason,
  buildStreamOptsFromConversation,
  createRequestId,
  createSessionId,
  formatToolInputSummary,
  isSpeckitResetCommand,
  parsePermissionRequestFromText,
} from '~/utils/chatStream'
import {
  buildRecoveryKey,
  getWsUrl,
  isPageFocused,
  markToolBlocks,
} from '~/utils/chatStreamHelpers'
import { createCascadeRegistry } from '~/utils/cascadeQueue'
import { reduceReplayEvents } from '~/utils/streamReplayReducer'
import {
  buildResultSummaryBlock,
  buildSessionInitBlock,
  buildTextBlock,
  buildThinkingBlock,
  buildToolResultBlock,
  buildToolUseStart,
  findActiveToolByIndexOrBlock,
} from '~/utils/eventBlockFactories'
import {
  checkExistingConnection,
  createConnectionState,
  isStaleConnection,
  type ConnectionState as WSConnectionState,
} from '~/utils/wsConnectionState'

interface WSResponse {
  type: 'ui_event' | 'provider_json' | 'done' | 'error' | 'pong' | 'permission_prompt' | 'permission_request' | 'session_reset' | 'worktree_recovered' | 'aborted' | 'context_reset' | 'replay_start' | 'replay_end' | 'subscribed' | 'notification'
  event?: UIStreamEvent  // Canonical UI stream event (for ui_event type)
  data?: any // Legacy provider JSON payload
  error?: string
  requestId?: string
  text?: string  // For permission_prompt
  tool?: string  // For permission_request
  description?: string  // For permission_request
  reason?: string  // For session_reset
  denied?: boolean  // For done after permission denial
  jobId?: string  // For subscribe/replay responses and notifications
  jobStatus?: string  // For subscribe/replay responses
  eventCount?: number  // For replay_start
  nextCursor?: number  // For replay_end
  conversationId?: string  // For subscribed and notifications
  notificationEvent?: string  // For notifications (job_created, job_completed)
  source?: string  // For notifications (job source: user/scheduler/cascade)
  status?: string  // For notifications (job final status)
}

type ConnectionState = WSConnectionState<WSResponse>

// Module-level connection pool (shared across all composable instances)
const connections = new Map<string, ConnectionState>()

// Reference count for composable instances — only disconnect when the last one unmounts
let composableRefCount = 0

// Per-conversation cascade state
const cascadeRegistry = createCascadeRegistry()
const rolloutRecoveryAttempts = new Set<string>()

// Health check constants
const HEALTH_CHECK_INTERVAL_MS = 30_000  // Check every 30s
const STREAMING_TIMEOUT_MS = 180_000     // 180s with no messages → timeout
const STREAMING_TIMEOUT_SECONDS = Math.round(STREAMING_TIMEOUT_MS / 1000)

export function useChatStream() {
  const chatStore = useChatStore()
  const settingsStore = useSettingsStore()

  composableRefCount++

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
          chatStore.setSessionError(`Streaming timed out — no response from server for ${STREAMING_TIMEOUT_SECONDS} seconds`, convId)
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

  function flushTextChunk(conn: ConnectionState, conversationId: string, chunk: string) {
    if (!chunk || !conn.currentTextBlockId) return
    chatStore.updateBlockWithSave(conn.currentMessageId, conn.currentTextBlockId, (block) => {
      if (block.type === 'text') {
        (block as TextBlock).text += chunk
      }
    }, conversationId, { syncContent: false })
    // Keep flat content in sync incrementally while we stream text.
    chatStore.appendToMessage(conn.currentMessageId, chunk, conversationId)
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
      let settled = false
      const safeResolve = (ws: WebSocket) => {
        if (settled) return
        settled = true
        resolve(ws)
      }
      const safeReject = (error: Error) => {
        if (settled) return
        settled = true
        reject(error)
      }

      const existing = checkExistingConnection(connections, conversationId)
      if (existing.kind === 'open') {
        safeResolve(existing.conn.ws)
        return
      }
      if (existing.kind === 'stale') {
        existing.conn.ws.close()
        connections.delete(conversationId)
      }

      const url = getWsUrl()
      const ws = new WebSocket(url)
      const connState = createConnectionState<WSResponse>(ws, conversationId)
      connections.set(conversationId, connState)

      ws.onopen = () => {
        safeResolve(ws)
      }

      ws.onerror = (event) => {
        console.error(`[useChatStream] WebSocket error for conversation ${conversationId}:`, event)
        if (isStaleConnection(connections, conversationId, ws)) return
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
        safeReject(new Error('WebSocket connection failed. Server may be unavailable.'))
      }

      ws.onclose = (event) => {
        // Stale close: a new WebSocket already replaced this one — bail out.
        if (isStaleConnection(connections, conversationId, ws)) return
        const conn = connections.get(conversationId)

        if (conn) clearHealthCheck(conn)
        connections.delete(conversationId)
        cascadeRegistry.disable(conversationId)

        if (!settled) {
          safeReject(new Error(`WebSocket closed before connection was established (code: ${event.code})`))
          return
        }

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
        // Ignore messages from a stale WebSocket that has been replaced
        if (isStaleConnection(connections, conversationId, ws)) return
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

      // During replay, buffer ui_event/done/error for batch processing.
      // Must check before the normal error/done handlers below.
      if (conn.isReplaying) {
        if (response.type === 'ui_event' || response.type === 'done' || response.type === 'error') {
          conn.replayBuffer.push(response)
        }
        // replay_end is handled below in the normal flow
        if (response.type !== 'replay_end') {
          return
        }
      }

      if (response.type === 'error') {
        const recovered = await handleServerError(response, conn, conversationId)
        if (recovered) return
        return
      }

      if (response.type === 'done') {
        await handleDone(response, conn, conversationId)
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

      // Handle subscribe/replay responses
      if (response.type === 'subscribed') {
        console.log(`[useChatStream] Subscribed to ${conversationId}`, response.jobId ? `(job: ${response.jobId}, status: ${response.jobStatus})` : '(no active job)')
        // If server has no active job (e.g. server restarted, job lost),
        // clean up the streaming state so the UI doesn't stay stuck.
        if (!response.jobId) {
          chatStore.endSession(conversationId)
          chatStore.endConversationStreaming(conversationId)
        }
        return
      }
      if (response.type === 'replay_start') {
        console.log(`[useChatStream] Replay start for ${conversationId}: ${response.eventCount} events from job ${response.jobId}`)
        conn.isReplaying = true
        conn.replayBuffer = []
        return
      }
      if (response.type === 'replay_end') {
        console.log(`[useChatStream] Replay end for ${conversationId}: nextCursor=${response.nextCursor}`)
        // Batch-process all buffered events into content blocks
        processReplayBuffer(conn, conversationId)
        conn.isReplaying = false
        conn.replayBuffer = []
        return
      }

      // Handle global notifications (job lifecycle events pushed to all peers)
      if (response.type === 'notification') {
        handleGlobalNotification(response)
        return
      }

      if (response.type === 'permission_request') {
        handlePermissionRequest(response, conn, conversationId)
        return
      }

      if (response.type === 'permission_prompt' && response.text) {
        handlePermissionPrompt(response, conn, conversationId)
        return
      }

      if (response.type === 'ui_event' && response.event) {
        processUIEvent(response.event, conversationId)
      } else if (response.type === 'provider_json' && response.data) {
        // Legacy path ignored - server now emits ui_event for all providers
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
   * Apply a block_delta event: append streamed text/thinking to the matching
   * open block, or accumulate tool input JSON for the active tool.
   */
  function applyBlockDelta(event: Extract<UIStreamEvent, { type: 'block_delta' }>, conn: ConnectionState, conversationId: string) {
    if (event.text && conn.currentTextBlockId) {
      flushTextChunk(conn, conversationId, event.text)
    }

    if (event.thinking && conn.currentThinkingBlockId) {
      chatStore.updateBlockWithSave(conn.currentMessageId, conn.currentThinkingBlockId, (block) => {
        if (block.type === 'thinking') {
          (block as ThinkingBlock).thinking += event.thinking!
        }
      }, conversationId, { syncContent: false })
    }

    if (event.partialJson) {
      const tool = findActiveToolByIndexOrBlock(conn.activeTools, event.index, event.blockId)
      if (tool) tool.inputJson += event.partialJson
    }
  }

  /**
   * Apply a block_end event: finalize a streaming text/thinking block, or
   * promote a pending tool block to the parsed-input "pending" state. Also
   * intercepts ExitPlanMode to raise the plan approval UI.
   */
  function applyBlockEnd(event: Extract<UIStreamEvent, { type: 'block_end' }>, conn: ConnectionState, conversationId: string) {
    const tool = findActiveToolByIndexOrBlock(conn.activeTools, event.index, event.blockId)

    // Only clear text/thinking block IDs when this block_end is NOT for a tool block.
    if (!tool) {
      if (conn.currentTextBlockId) conn.currentTextBlockId = null
      if (conn.currentThinkingBlockId) conn.currentThinkingBlockId = null
      return
    }

    let input: Record<string, unknown> = {}
    try { input = JSON.parse(tool.inputJson) } catch {}

    // Intercept ExitPlanMode — raise approval UI before finalizing the tool.
    if (tool.name === 'ExitPlanMode') {
      const approval: PlanApproval = {
        allowedPrompts: input.allowedPrompts as PlanApproval['allowedPrompts'],
      }
      chatStore.setPendingPlanApproval(approval, conversationId)
    }

    chatStore.updateBlockWithSave(conn.currentMessageId, tool.blockId, (block) => {
      if (block.type === 'tool_use') {
        const tb = block as ToolUseBlock
        tb.input = input
        tb.inputSummary = formatToolInputSummary(input)
        tb.status = 'pending'
      }
    }, conversationId)
  }

  /**
   * Handle a permission_request message (server-driven). Claude CLI exits
   * while awaiting approval, so we move the UI out of "streaming".
   */
  function handlePermissionRequest(response: WSResponse, conn: ConnectionState, conversationId: string) {
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
  }

  /**
   * Legacy permission_prompt from PTY transport. Same lifecycle as
   * permission_request but text-only payload.
   */
  function handlePermissionPrompt(response: WSResponse, conn: ConnectionState, conversationId: string) {
    clearHealthCheck(conn)
    chatStore.endConversationStreaming(conversationId)

    const request: PermissionRequest = parsePermissionRequestFromText(response.text || '', 'Permission')
    chatStore.setPendingPermission(request, conversationId)

    const permText = `\n\n**${request.tool}**: ${request.filePath || request.command || request.description}\n`
    appendTextBlock(conn.currentMessageId, permText, conversationId)
  }

  /**
   * Match patterns for codex permission failures, in which case we should
   * NOT try to recover by clearing the rollout path.
   */
  const CODEX_PERMISSION_ERROR_RE = /codex cannot access session files|failed to clean up stale arg0 temp dirs: Permission denied|failed to initialize rollout recorder: Permission denied|failed to create session: Permission denied|\/\.codex\/.*permission denied/i
  const MISSING_ROLLOUT_PATH_RE = /state db missing rollout path for thread/i

  /**
   * Handle a server-side `error` message. Attempts a one-shot recovery for
   * "missing rollout path" corruption by clearing the session and resending
   * the prompt. Returns true when a recovery retry was dispatched and the
   * caller should stop processing.
   */
  async function handleServerError(response: WSResponse, conn: ConnectionState, conversationId: string): Promise<boolean> {
    console.error(`[useChatStream] Server error for ${conversationId}:`, response.error)
    const errorMsg = response.error || 'Unknown server error'
    conn.lastServerError = errorMsg

    const hasCodexPermissionError = CODEX_PERMISSION_ERROR_RE.test(errorMsg)
    const missingRolloutPath = MISSING_ROLLOUT_PATH_RE.test(errorMsg)

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
            return true
          } catch (retryError) {
            console.error(`[useChatStream] Rollout-path recovery retry failed for ${conversationId}:`, retryError)
          }
        }
      }
    }

    clearHealthCheck(conn)
    markRunningToolBlocks(conn.currentMessageId, conversationId, 'error')
    chatStore.updateMessage(conn.currentMessageId, { status: 'error' }, conversationId)
    if (MISSING_ROLLOUT_PATH_RE.test(errorMsg)) {
      // Ensure the next send is fresh even if server-side reset was missed.
      chatStore.setProviderSessionId('', conversationId)
    }
    rolloutRecoveryAttempts.delete(buildRecoveryKey(conversationId, conn.currentMessageId))
    chatStore.setSessionError(errorMsg, conversationId)
    chatStore.endSession(conversationId)
    chatStore.endConversationStreaming(conversationId)
    disableCascade(conversationId)
    chatStore.saveConversation(conversationId, true)
    cleanupConnection(conversationId)
    return false
  }

  /**
   * Settle a `done` message: mark the assistant turn terminal, optionally
   * auto-commit the worktree, then schedule any queued cascade step.
   */
  async function handleDone(response: WSResponse, conn: ConnectionState, conversationId: string) {
    clearHealthCheck(conn)
    const currentStatus = getMessageStatus(conversationId, conn.currentMessageId)
    rolloutRecoveryAttempts.delete(buildRecoveryKey(conversationId, conn.currentMessageId))

    // Permission denial: stopped state, not a successful completion.
    if (response.denied) {
      markRunningToolBlocks(conn.currentMessageId, conversationId, 'error')
      chatStore.updateMessage(conn.currentMessageId, { status: 'stopped' }, conversationId)
      finalizeTurn(conn, conversationId)
      return
    }

    // Carry over terminal failure status set by an earlier event.
    if (currentStatus === 'error' || currentStatus === 'stopped') {
      markRunningToolBlocks(conn.currentMessageId, conversationId, 'error')
      finalizeTurn(conn, conversationId)
      return
    }

    // Happy path: mark the turn complete and start post-turn side effects.
    markRunningToolBlocks(conn.currentMessageId, conversationId, 'complete')
    chatStore.completeMessageWithSave(conn.currentMessageId, conversationId)
    chatStore.endSession(conversationId)
    chatStore.endConversationStreaming(conversationId)
    notifyChatCompleted(conversationId)

    const conv = await findConversationWithRetry(conversationId)
    const commitPromise = autoCommitAndSyncPreview(conv, conversationId, conn)

    const nextCascade = cascadeRegistry.popNextStep(conversationId)
    if (nextCascade) {
      commitPromise.then(() => {
        // Small delay to let auto-commit settle
        setTimeout(() => {
          sendCascadeStep(conversationId, nextCascade.featureId, nextCascade.step)
        }, 1500)
      })
    }

    chatStore.clearPendingPermission(conversationId)
    chatStore.saveConversation(conversationId, true)
    conn.activeTools.clear()
    // Keep socket/session alive so the next turn can resume provider context.
  }

  /**
   * Common teardown for denied/terminal-error done paths. Keeps the socket
   * open so the next turn can resume provider context.
   */
  function finalizeTurn(conn: ConnectionState, conversationId: string) {
    chatStore.endSession(conversationId)
    chatStore.endConversationStreaming(conversationId)
    disableCascade(conversationId)
    chatStore.clearPendingPermission(conversationId)
    conn.activeTools.clear()
    chatStore.saveConversation(conversationId, true)
  }

  /**
   * Auto-commit worktree changes, then sync any active preview branch, then
   * update UI if the branch changed. Errors are swallowed with a warning —
   * the assistant turn is already considered complete.
   */
  function autoCommitAndSyncPreview(
    conv: { hasWorktree?: boolean; worktreePath?: string; worktreeBranch?: string; previewBranch?: string } | null | undefined,
    conversationId: string,
    conn: ConnectionState,
  ): Promise<any> {
    if (!conv?.hasWorktree || !conv.worktreePath) return Promise.resolve()

    return $fetch('/api/chat/worktree-commit', {
      method: 'POST',
      body: {
        worktreePath: conv.worktreePath,
        conversationId,
        previousBranch: conv.worktreeBranch,
      },
    }).then((result: any) => {
      if (conv.previewBranch && conv.worktreePath) {
        return $fetch<{ success: boolean; error?: string }>('/api/chat/preview-sync', {
          method: 'POST',
          body: { previewBranch: conv.previewBranch, worktreePath: conv.worktreePath },
        }).then((syncResult) => {
          if (!syncResult.success) {
            throw new Error(syncResult.error || 'Unknown preview sync failure')
          }
          return result
        })
      }
      return result
    }).then(async (result: any) => {
      if (result?.success && result.currentBranch !== conv.worktreeBranch) {
        const oldBranch = conv.worktreeBranch || 'unknown'
        chatStore.updateWorktreeBranch(conversationId, result.currentBranch)
        const linkedFeatureId = await chatStore.syncConversationFeatureFromBranch(conversationId)
        const deletedText = result.deletedPreviousBranch ? ` and deleted \`${oldBranch}\`` : ''
        const linkedText = linkedFeatureId ? ` and linked to feature \`${linkedFeatureId}\`` : ''
        appendTextBlock(
          conn.currentMessageId,
          `\n\n> **Branch changed**: AI switched from \`${oldBranch}\` to \`${result.currentBranch}\`${deletedText}${linkedText}\n\n`,
          conversationId,
        )
      } else if (result?.success && conv.worktreeBranch) {
        // Commits may have been made without branch change — bump lastCommitTime for UI refresh.
        chatStore.updateWorktreeBranch(conversationId, conv.worktreeBranch)
      }

      chatStore.saveConversation(conversationId, false)
      return result
    }).catch((err: unknown) => {
      console.warn('[useChatStream] Auto-commit/preview-sync failed:', err)
    })
  }

  // Debounce global notification refreshes to avoid redundant fetches
  let notificationRefreshTimer: ReturnType<typeof setTimeout> | null = null
  const NOTIFICATION_REFRESH_DEBOUNCE_MS = 500

  /**
   * Handle global notification events (job_created, job_completed)
   * Refreshes the conversation list when server-initiated changes occur
   */
  function handleGlobalNotification(response: WSResponse) {
    const eventName = response.notificationEvent
    const source = response.source

    console.log(`[useChatStream] Global notification: ${eventName}`, {
      jobId: response.jobId,
      conversationId: response.conversationId,
      source,
      status: response.status,
    })

    // Refresh conversation list for server-initiated jobs, completion, or persisted data
    const shouldRefresh =
      (eventName === 'job_created' && source !== 'user') ||
      eventName === 'job_completed' ||
      eventName === 'job_persisted'

    if (shouldRefresh) {
      // Debounce to avoid rapid successive refreshes
      if (notificationRefreshTimer) clearTimeout(notificationRefreshTimer)
      notificationRefreshTimer = setTimeout(() => {
        notificationRefreshTimer = null
        chatStore.refreshServerConversations()
      }, NOTIFICATION_REFRESH_DEBOUNCE_MS)
    }
  }

  /**
   * Process canonical UI stream event
   */
  function processUIEvent(event: UIStreamEvent, conversationId: string) {
    const conn = connections.get(conversationId)
    if (!conn) return
    
    chatStore.pushDebugEvent({
      direction: 'in',
      channel: 'ui',
      eventType: event.type,
      payload: event,
    }, conversationId)

    if (event.sessionId) {
      chatStore.setProviderSessionId(event.sessionId, conversationId)
    }

    switch (event.type) {
      case 'session_init': {
        ensureBlocks(conn.currentMessageId, conversationId)
        chatStore.appendContentBlockWithSave(
          conn.currentMessageId,
          buildSessionInitBlock(event),
          conversationId,
        )
        break
      }

      case 'block_start': {
        ensureBlocks(conn.currentMessageId, conversationId)

        if (event.blockType === 'text') {
          const block = buildTextBlock(event)
          chatStore.appendContentBlockWithSave(conn.currentMessageId, block, conversationId)
          conn.currentTextBlockId = block.id
        } else if (event.blockType === 'thinking') {
          const block = buildThinkingBlock(event)
          chatStore.appendContentBlockWithSave(conn.currentMessageId, block, conversationId)
          conn.currentThinkingBlockId = block.id
        } else if (event.blockType === 'tool_use') {
          const toolStart = buildToolUseStart(event)
          if (toolStart) {
            chatStore.appendContentBlockWithSave(conn.currentMessageId, toolStart.block, conversationId)
            conn.activeTools.set(toolStart.index, toolStart.tracking)
          }
        }
        break
      }

      case 'block_delta': {
        applyBlockDelta(event, conn, conversationId)
        break
      }

      case 'block_end': {
        applyBlockEnd(event, conn, conversationId)
        break
      }

      case 'tool_result': {
        ensureBlocks(conn.currentMessageId, conversationId)

        const toolBlock = chatStore.findToolUseBlock(conn.currentMessageId, event.toolUseId, conversationId)
        if (toolBlock && toolBlock.type === 'tool_use') {
          chatStore.updateBlockById(conn.currentMessageId, toolBlock.id, (block) => {
            if (block.type === 'tool_use') {
              (block as ToolUseBlock).status = event.isError ? 'error' : 'complete'
            }
          }, conversationId)
        }

        chatStore.appendContentBlockWithSave(
          conn.currentMessageId,
          buildToolResultBlock(event),
          conversationId,
        )
        break
      }

      case 'permission_request': {
        clearHealthCheck(conn)
        chatStore.endConversationStreaming(conversationId)

        const request: PermissionRequest = {
          tool: event.tool,
          description: event.description,
          input: event.input,
          tools: event.tools,
        }

        chatStore.setPendingPermission(request, conversationId)
        appendTextBlock(conn.currentMessageId, `\n\n**Permission Required**: ${request.tool}\n`, conversationId)
        break
      }

      case 'turn_result': {
        if (event.subtype !== 'success') {
          chatStore.updateMessage(conn.currentMessageId, { status: 'error' }, conversationId)
          disableCascade(conversationId)
          if (event.subtype === 'max_turns') {
            chatStore.setSessionError('Maximum conversation turns reached. Please start a new conversation.', conversationId)
          } else {
            chatStore.setSessionError('Provider reported an execution error.', conversationId)
          }
        }

        const summary = buildResultSummaryBlock(event)
        if (summary) {
          ensureBlocks(conn.currentMessageId, conversationId)
          chatStore.appendContentBlockWithSave(conn.currentMessageId, summary, conversationId)
        }
        break
      }

      case 'error': {
        chatStore.updateMessage(conn.currentMessageId, { status: 'error' }, conversationId)
        chatStore.setSessionError(event.error, conversationId)
        break
      }
    }
  }

  /**
   * Batch-process all buffered replay events into content blocks without
   * triggering per-event Vue reactivity. Mirrors the jobPersister accumulator
   * pattern but runs on the client.
   */
  function processReplayBuffer(conn: ConnectionState, conversationId: string) {
    const events = conn.replayBuffer
    if (events.length === 0) return

    const result = reduceReplayEvents(events)

    // Apply provider session IDs observed during the replay window
    for (const sessionId of result.providerSessionIds) {
      chatStore.setProviderSessionId(sessionId, conversationId)
    }

    // Single reactive update — sets content blocks and flat text at once
    chatStore.batchSetMessageBlocks(
      conn.currentMessageId,
      result.contentBlocks,
      result.flatText,
      result.finalStatus,
      conversationId,
    )

    // Update connection state for any live events that arrive after replay
    conn.currentTextBlockId = result.currentTextBlockId
    conn.currentThinkingBlockId = result.currentThinkingBlockId
    conn.activeTools = result.activeTools

    if (result.isDone) {
      clearHealthCheck(conn)
      chatStore.endSession(conversationId)
      chatStore.endConversationStreaming(conversationId)
      notifyChatCompleted(conversationId)
    }

    console.log(`[useChatStream] Replay batch processed: ${events.length} events → ${result.contentBlocks.length} blocks, status=${result.finalStatus}`)
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

  /**
   * Send message via WebSocket (per-conversation)
   */
  async function sendMessage(
    message: string,
    messageId: string,
    conversationId: string,
    options?: { cwd?: string; worktreeBranch?: string; baseBranch?: string; featureId?: string; attachments?: ChatImageAttachment[] },
  ) {
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
        attachments: options?.attachments,
        requestId,
        sessionId: providerSessionId || undefined,
        permissionMode: chatStore.permissionMode,
        conversationId,
        cwd: options?.cwd,
        worktreeBranch: options?.worktreeBranch,
        baseBranch: options?.baseBranch,
        featureId: options?.featureId,
        providerId,
        providerModelKey,
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
    cascadeRegistry.enable(conversationId, featureId, remainingSteps)
  }

  /**
   * Disable cascade for a specific conversation
   */
  function disableCascade(conversationId?: string) {
    cascadeRegistry.disable(conversationId)
  }

  /**
   * Send the next cascade step as a follow-up message in the same conversation
   */
  async function sendCascadeStep(conversationId: string, featureId: string, step: string) {
    // Make sure the conversation is still selected
    if (chatStore.activeConversationId !== conversationId) {
      chatStore.selectConversation(conversationId)
    }

    const conv = chatStore.conversations.find((c: { id: string }) => c.id === conversationId)

    // Support skill: prefixed steps (e.g. 'skill:better-spec') — fetch rendered prompt from API
    let prompt: string
    if (step.startsWith('skill:')) {
      const skillId = step.replace('skill:', '')
      try {
        const rendered = await $fetch<{ prompt: string }>(`/api/skills/${skillId}/prompt`, {
          method: 'POST',
          body: { featureId, cwd: conv?.worktreePath },
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

    const assistantMessage = chatStore.addAssistantMessage(conversationId)
    chatStore.startSession(createSessionId(), conversationId)
    chatStore.startConversationStreaming(conversationId)

    const streamOpts = buildStreamOptsFromConversation(conv)
    await sendMessage(prompt, assistantMessage.id, conversationId, streamOpts)
  }

  /**
   * Subscribe to a conversation's events (for observing server-initiated jobs).
   * Connects to WebSocket, sends subscribe message, and replays buffered events.
   * The caller should ensure an assistant message exists to receive replay events.
   */
  async function subscribe(conversationId: string, messageId: string, cursor: number = 0) {
    if (typeof window === 'undefined') return

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

      chatStore.startConversationStreaming(conversationId)

      const payload = {
        type: 'subscribe',
        conversationId,
        cursor,
      }
      chatStore.pushDebugEvent({
        direction: 'out',
        channel: 'ws',
        eventType: 'subscribe',
        payload,
      }, conversationId)
      socket.send(JSON.stringify(payload))
    } catch (error) {
      console.error(`[useChatStream] Failed to subscribe to ${conversationId}:`, error)
      chatStore.setSessionError((error as Error).message || 'Subscribe failed', conversationId)
    }
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
    cascadeRegistry.disable(conversationId)
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
    cascadeRegistry.disable()
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

  /**
   * Try to resume streaming for a conversation after page reload.
   * Checks if the server has an active job, clears partial message state,
   * and subscribes to replay buffered events.
   */
  async function tryResumeStreaming(conversationId: string): Promise<boolean> {
    if (typeof window === 'undefined') return false

    try {
      const jobs = await $fetch<Array<{ id: string; status: string; eventCount: number }>>('/api/jobs', {
        params: { conversationId },
      })

      const activeJob = jobs.find(j => j.status === 'running' || j.status === 'waiting_permission' || j.status === 'queued')
      // Also consider completed jobs with buffered events — the job may have
      // finished during the brief page-reload window.  The server's
      // handleSubscribe / getActiveJob still returns the last job regardless of
      // status and can replay its buffered events.
      const resumableJob = activeJob
        || [...jobs].sort((a, b) => b.eventCount - a.eventCount).find(j => j.eventCount > 0)

      const conv = chatStore.conversations.find((c: { id: string }) => c.id === conversationId)
      if (!conv) return false

      // Find the last assistant message (the one that was mid-stream)
      const lastAssistantMsg = [...conv.messages].reverse().find((m: { role: string }) => m.role === 'assistant')

      if (!resumableJob) {
        // No job at all — clean up any stale streaming state from persisted messages
        if (lastAssistantMsg && lastAssistantMsg.status === 'streaming') {
          chatStore.updateMessage(lastAssistantMsg.id, { status: 'error' }, conversationId)
          chatStore.setSessionError('Streaming was interrupted (server job no longer active)', conversationId)
        }
        return false
      }

      if (!lastAssistantMsg) return false

      // Server persisted this message as stopped/complete/error — no resume needed.
      // Only resume if the message is still in 'streaming' state (interrupted mid-flight).
      if (lastAssistantMsg.status !== 'streaming') {
        return false
      }

      console.log('[useChatStream] Resuming streaming for', conversationId, 'job:', resumableJob.id, 'status:', resumableJob.status, 'events:', resumableJob.eventCount)

      // Reset the partial message atomically for clean replay (Bug fix: use store
      // method instead of direct mutation — the readonly proxy and object spread
      // in updateMessage prevented contentBlocks from being cleared)
      chatStore.resetMessageForReplay(lastAssistantMsg.id, conversationId)

      // Start session so isStreaming computed is consistent
      chatStore.startSession(`resume-${Date.now()}`, conversationId)

      // Subscribe with cursor=0 to replay all buffered events
      await subscribe(conversationId, lastAssistantMsg.id, 0)

      return true
    } catch (error) {
      console.error('[useChatStream] Failed to resume streaming:', error)
      return false
    }
  }

  // Cleanup on unmount — only disconnect when the last composable instance unmounts
  onUnmounted(() => {
    composableRefCount--
    if (composableRefCount <= 0) {
      composableRefCount = 0
      disconnect()
    }
  })

  return {
    sendMessage,
    sendPermissionResponse,
    subscribe,
    tryResumeStreaming,
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
