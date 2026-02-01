/**
 * Auto Mode Store
 * Client-side state for the background spec processing scheduler.
 * Connects via WebSocket for real-time status updates.
 * Creates/reuses conversations for each Auto Mode feature (T007: FR-004, FR-008).
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  AutoModeSession,
  AutoModeTask,
  AutoModeWSMessage,
  AutoModeToggleResponse,
  AutoModeStatusResponse,
} from '~/types/autoMode'
import type { Conversation, ChatMessage } from '~/types/chat'
import { generateConversationId, generateMessageId } from '~/types/chat'
import { useSettingsStore } from '~/stores/settings'
import { useChatStore } from '~/stores/chat'
import { formatToolInputSummary } from '~/utils/chatStream'

export const useAutoModeStore = defineStore('autoMode', () => {
  const enabled = ref(false)
  const session = ref<AutoModeSession | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // WebSocket connection (non-reactive)
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  // Track current assistant message per feature (for appending text chunks)
  const activeMessageIds = new Map<string, string>()

  // Computed
  const isActive = computed(() => session.value?.state === 'active')
  const tasks = computed(() => session.value?.tasks ?? [])
  const queuedCount = computed(() => tasks.value.filter(t => t.state === 'queued').length)
  const runningTask = computed(() => tasks.value.find(t => t.state === 'running') ?? null)
  const completedCount = computed(() => tasks.value.filter(t => t.state === 'completed').length)
  const failedCount = computed(() => tasks.value.filter(t => t.state === 'failed').length)
  const totalCount = computed(() => tasks.value.length)

  /** Initialize from persisted state and fetch server status (T013: FR-015) */
  async function initialize() {
    if (typeof window !== 'undefined') {
      try {
        const settings = await $fetch<Record<string, unknown>>('/api/settings')
        if (settings?.autoModeEnabled === true) {
          enabled.value = true
        }
      } catch {
        // Settings may not be available yet
      }
    }

    try {
      const res = await $fetch<AutoModeStatusResponse>('/api/auto-mode/status')
      enabled.value = res.enabled
      session.value = res.session
    } catch {
      // Server may not be ready yet
    }

    connectWebSocket()
  }

  /** Toggle Auto Mode on/off (T009: FR-013, FR-016) */
  async function toggle() {
    loading.value = true
    error.value = null

    try {
      // Read concurrency from settings store
      const settingsStore = useSettingsStore()
      const concurrency = settingsStore.autoModeConcurrency

      const res = await $fetch<AutoModeToggleResponse>('/api/auto-mode/toggle', {
        method: 'POST',
        body: { enabled: !enabled.value, concurrency },
      })

      if (res.success) {
        enabled.value = res.enabled
        persistEnabled(res.enabled)
      } else {
        error.value = res.error || 'Toggle failed'
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  /** Handle incoming WebSocket messages */
  function handleWSMessage(message: AutoModeWSMessage) {
    switch (message.type) {
      case 'auto_mode_status':
        enabled.value = message.enabled
        session.value = message.session
        persistEnabled(message.enabled)
        break

      case 'auto_mode_task_update':
        if (session.value) {
          const idx = session.value.tasks.findIndex(t => t.featureId === message.task.featureId)
          if (idx >= 0) {
            session.value.tasks[idx] = message.task
          }
        }
        // Create/link conversation when task starts running with worktree info (T007: FR-004, FR-008)
        if (message.task.state === 'running' && message.task.worktreePath && message.task.worktreeBranch) {
          ensureConversationForTask(message.task)
        }
        break

      case 'auto_mode_error':
        error.value = message.error
        break

      case 'auto_mode_step_start':
        handleStepStart(message.featureId, message.step)
        break

      case 'auto_mode_step_complete':
        handleStepComplete(message.featureId)
        break

      case 'auto_mode_message':
        handleConversationMessage(message.featureId, message.sdkMessage)
        break
    }
  }

  /** Find conversation for a feature */
  function findConversationForFeature(featureId: string): Conversation | null {
    const chatStore = useChatStore()
    return chatStore.findConversationByFeature(featureId)
  }

  /** Handle step start: add a user message showing the command */
  function handleStepStart(featureId: string, step: string) {
    if (typeof window === 'undefined') return

    const chatStore = useChatStore()
    const conv = findConversationForFeature(featureId)
    if (!conv) return

    // Add user message with the command
    const userMsg: ChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: `/speckit.${step} ${featureId}`,
      timestamp: new Date().toISOString(),
    }
    chatStore.addMessage(userMsg, conv.id)

    // Add empty assistant message to stream into
    const assistantMsg: ChatMessage = {
      id: generateMessageId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      status: 'streaming',
    }
    chatStore.addMessage(assistantMsg, conv.id)
    activeMessageIds.set(featureId, assistantMsg.id)

    chatStore.startConversationStreaming(conv.id)
    chatStore.saveConversation(conv.id, false)
  }

  /** Handle step complete: mark assistant message as complete */
  function handleStepComplete(featureId: string) {
    if (typeof window === 'undefined') return

    const chatStore = useChatStore()
    const conv = findConversationForFeature(featureId)
    if (!conv) return

    const msgId = activeMessageIds.get(featureId)
    if (msgId) {
      chatStore.updateMessage(msgId, { status: 'complete' }, conv.id)
      activeMessageIds.delete(featureId)
    }

    chatStore.endConversationStreaming(conv.id)
    chatStore.saveConversation(conv.id, true)
  }

  /** Handle SDK message: extract text from assistant messages and append to conversation */
  function handleConversationMessage(featureId: string, sdkMessage: any) {
    if (typeof window === 'undefined') return

    const chatStore = useChatStore()
    const conv = findConversationForFeature(featureId)
    if (!conv) return

    const msgId = activeMessageIds.get(featureId)
    if (!msgId) return

    // Extract text from assistant messages
    if (sdkMessage.type === 'assistant' && sdkMessage.message?.content) {
      for (const block of sdkMessage.message.content) {
        if (block.type === 'text' && block.text) {
          chatStore.appendToMessageWithSave(msgId, block.text, conv.id)
        } else if (block.type === 'tool_use' && block.name) {
          // Show tool usage inline
          const inputStr = block.input ? formatToolInputSummary(block.input) : ''
          const toolText = `\n\n▶ **${block.name}** ${inputStr}\n`
          chatStore.appendToMessageWithSave(msgId, toolText, conv.id)
        }
      }
    }

    // Handle tool results
    if (sdkMessage.type === 'tool_result' || sdkMessage.type === 'user') {
      // For user messages containing tool results, extract result text
      const content = sdkMessage.message?.content || sdkMessage.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result' && block.content) {
            const resultContent = typeof block.content === 'string'
              ? block.content
              : Array.isArray(block.content)
                ? block.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
                : ''
            if (resultContent) {
              const preview = resultContent.slice(0, 300)
              const suffix = resultContent.length > 300 ? '...' : ''
              const status = block.is_error ? '✗ Error:' : '✓'
              chatStore.appendToMessageWithSave(msgId, `${status} ${preview}${suffix}\n`, conv.id)
            }
          }
        }
      }
    }
  }

  /** Create or reuse a conversation for an Auto Mode task (T007: FR-004, FR-008) */
  function ensureConversationForTask(task: AutoModeTask) {
    if (typeof window === 'undefined') return

    const chatStore = useChatStore()

    // Reuse existing conversation for this feature
    const existing = chatStore.findConversationByFeature(task.featureId)
    if (existing) {
      // Update worktree info and autoMode flag if needed
      const conv = chatStore.conversations.find(c => c.id === existing.id)
      if (conv) {
        if (!conv.autoMode) {
          (conv as Conversation).autoMode = true
        }
        if (task.worktreePath && !conv.worktreePath) {
          (conv as Conversation).worktreePath = task.worktreePath;
          (conv as Conversation).worktreeBranch = task.worktreeBranch;
          (conv as Conversation).baseBranch = task.baseBranch;
          (conv as Conversation).cwd = task.worktreePath;
          (conv as Conversation).hasWorktree = true
        }
        chatStore.saveAllConversations()
      }
      return
    }

    // Create new conversation with Auto Mode metadata
    const id = generateConversationId()
    const conv: Conversation = {
      id,
      title: `Auto: ${task.featureId}`,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cwd: task.worktreePath || '',
      featureId: task.featureId,
      autoMode: true,
      worktreePath: task.worktreePath,
      worktreeBranch: task.worktreeBranch,
      baseBranch: task.baseBranch,
      hasWorktree: true,
    }

    chatStore.addAutoModeConversation(conv)
  }

  // ---- WebSocket ----

  function connectWebSocket() {
    if (typeof window === 'undefined') return
    if (ws && ws.readyState === WebSocket.OPEN) return

    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/auto-mode-ws`

    ws = new WebSocket(url)

    ws.onmessage = (event) => {
      try {
        const msg: AutoModeWSMessage = JSON.parse(event.data)
        handleWSMessage(msg)
      } catch {
        // Ignore parse errors
      }
    }

    ws.onclose = () => {
      ws = null
      // Reconnect after 5 seconds
      reconnectTimer = setTimeout(() => connectWebSocket(), 5000)
    }

    ws.onerror = () => {
      // Will trigger onclose
    }
  }

  function disconnectWebSocket() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      ws.close()
      ws = null
    }
  }

  function persistEnabled(value: boolean) {
    if (typeof window !== 'undefined') {
      $fetch('/api/settings', { method: 'POST', body: { autoModeEnabled: value } }).catch((e) => {
        console.error('Failed to persist autoModeEnabled:', e)
      })
    }
  }

  return {
    // State
    enabled,
    session,
    loading,
    error,

    // Computed
    isActive,
    tasks,
    queuedCount,
    runningTask,
    completedCount,
    failedCount,
    totalCount,

    // Actions
    initialize,
    toggle,
    disconnectWebSocket,
  }
})
