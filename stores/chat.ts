import { defineStore } from 'pinia'
import { ref, computed, readonly } from 'vue'
import type {
  ChatMessage,
  ChatImageAttachment,
  ChatSession,
  SessionStatus,
  ArchivedConversation,
  Conversation,
  ToolUse,
  PermissionMode,
  PermissionRequest,
  PlanApproval,
  FinalizeResponse,
  ConflictFile,
  ConflictListResponse,
  RebaseAbortResponse,
  AiResolveResponse,
  ContentBlock,
  ContentBlockType,
  DebugEvent,
} from '~/types/chat'
import {
  PANEL_DEFAULT_WIDTH,
  PANEL_MIN_WIDTH,
  PANEL_MAX_WIDTH,
  MAX_CONVERSATIONS,
  WARN_CONVERSATIONS_THRESHOLD,
  generateMessageId,
  generateConversationId,
  generateConversationTitle,
} from '~/types/chat'
import { DEFAULT_MODEL_KEY, DEFAULT_PROVIDER_ID } from '~/types/aiProvider'
import {
  loadConversations as loadFromStorage,
  saveConversations as saveToStorage,
} from '~/utils/conversationStorage'
import { buildMessageContentFromBlocks } from '~/utils/contentBlocks'

// Panel width and permission mode are persisted via /api/settings

/** Per-conversation runtime state (not persisted) */
interface ConversationStreamState {
  session: ChatSession | null
  pendingPermission: PermissionRequest | null
  pendingPlanApproval: PlanApproval | null
  lastError: string | null
  debugEvents: DebugEvent[]
}

export const useChatStore = defineStore('chat', () => {
  // Panel UI
  const isPanelOpen = ref(false)
  const panelWidth = ref(PANEL_DEFAULT_WIDTH)

  // Permission mode
  const permissionMode = ref<PermissionMode>('ask')

  // Working directory
  const cwd = ref<string>('')

  // Conversations (T036)
  const conversations = ref<Conversation[]>([])
  const archivedConversations = ref<ArchivedConversation[]>([])
  const activeConversationId = ref<string | null>(null)
  const conversationViewMode = ref<'active' | 'archive'>('active')

  // Track which conversations are currently streaming (for independent contexts)
  const streamingConversations = ref<Set<string>>(new Set())

  // Per-conversation runtime state map (not persisted)
  const conversationStreamStates = new Map<string, ConversationStreamState>()
  const debugStreamEnabled = ref(false)
  // Reactivity trigger — increment to force computed re-evaluation when stream state changes
  const streamStateTick = ref(0)

  // Debounce timers for auto-save during streaming (per-conversation)
  const saveDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const STREAM_SAVE_DEBOUNCE_MS = 1200

  // Global preview state: which conversation is currently previewed (runtime only, not persisted)
  const previewingConversationId = ref<string | null>(null)

  // Conflict resolution state
  const conflictState = ref<{
    conversationId: string
    worktreePath: string
    baseBranch: string
    commitMessage: string
    files: ConflictFile[]
    resolvedFiles: Set<string>
    loading: boolean
    error: string | null
    /** 'finalize' = cleanup after rebase; 'sync' = keep worktree */
    mode: 'finalize' | 'sync'
  } | null>(null)

  // ===== Per-conversation stream state helpers =====

  function getConvStreamState(conversationId: string | null): ConversationStreamState | null {
    if (!conversationId) return null
    return conversationStreamStates.get(conversationId) ?? null
  }

  function ensureConvStreamState(conversationId: string): ConversationStreamState {
    let state = conversationStreamStates.get(conversationId)
    if (!state) {
      state = { session: null, pendingPermission: null, pendingPlanApproval: null, lastError: null, debugEvents: [] }
      conversationStreamStates.set(conversationId, state)
    }
    return state
  }

  // ===== Messages: computed from active conversation =====

  const activeConversation = computed(() =>
    conversations.value.find(c => c.id === activeConversationId.value) || null
  )
  const messages = computed(() => activeConversation.value?.messages ?? [])

  // ===== Backward-compatible computed getters (read from active conversation's stream state) =====

  const session = computed(() => { streamStateTick.value; return getConvStreamState(activeConversationId.value)?.session ?? null })
  const pendingPermission = computed(() => { streamStateTick.value; return getConvStreamState(activeConversationId.value)?.pendingPermission ?? null })
  const pendingPlanApproval = computed(() => { streamStateTick.value; return getConvStreamState(activeConversationId.value)?.pendingPlanApproval ?? null })
  const lastError = computed(() => { streamStateTick.value; return getConvStreamState(activeConversationId.value)?.lastError ?? null })
  const debugEvents = computed(() => { streamStateTick.value; return getConvStreamState(activeConversationId.value)?.debugEvents ?? [] })
  const isStreaming = computed(() => session.value?.status === 'streaming')
  const providerSessionId = computed(() => {
    return activeConversation.value?.providerSessionId ?? ''
  })
  const hasMessages = computed(() => messages.value.length > 0)
  const lastMessage = computed(() => messages.value[messages.value.length - 1] || null)

  // Check if a specific conversation is streaming
  function isConversationStreaming(conversationId: string): boolean {
    return streamingConversations.value.has(conversationId)
  }

  // Check if the active conversation is streaming
  const isActiveConversationStreaming = computed(() => {
    if (!activeConversationId.value) return false
    return streamingConversations.value.has(activeConversationId.value)
  })

  // Conversation computed (T036)
  const hasConversations = computed(() => conversations.value.length > 0)
  const hasArchivedConversations = computed(() => archivedConversations.value.length > 0)
  const conversationCount = computed(() => conversations.value.length)
  const isNearStorageLimit = computed(() => conversationCount.value >= WARN_CONVERSATIONS_THRESHOLD)

  // Lists are kept sorted by actions to avoid repeated copy/sort on every reactive tick.
  const sortedConversations = computed(() => conversations.value)
  const sortedArchivedConversations = computed(() => archivedConversations.value)

  // Preview state computed (FR-010, FR-012)
  const previewingConversation = computed(() =>
    previewingConversationId.value
      ? conversations.value.find(c => c.id === previewingConversationId.value) || null
      : null
  )

  function isConversationPreviewing(id: string): boolean {
    return previewingConversationId.value === id
  }

  function setConversationViewMode(mode: 'active' | 'archive') {
    conversationViewMode.value = mode
  }

  async function syncPreviewBranchIfActive(conv: Conversation | null | undefined): Promise<void> {
    if (!conv?.previewBranch || !conv.worktreePath) return

    try {
      const res = await $fetch<{ success: boolean; error?: string }>('/api/chat/preview-sync', {
        method: 'POST',
        body: {
          previewBranch: conv.previewBranch,
          worktreePath: conv.worktreePath,
        },
      })
      if (!res.success) {
        throw new Error(res.error || 'Unknown preview sync failure')
      }
    } catch (error) {
      console.warn('[chat] Failed to sync preview branch after worktree update', {
        conversationId: conv.id,
        previewBranch: conv.previewBranch,
        worktreePath: conv.worktreePath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function archiveConversation(id: string): Promise<{ success: boolean; error?: string }> {
    if (isConversationStreaming(id)) {
      return { success: false, error: 'Cannot archive while this conversation is streaming' }
    }
    const index = conversations.value.findIndex(c => c.id === id)
    if (index === -1) return { success: false, error: 'Conversation not found' }

    try {
      const response = await $fetch<{
        success: boolean
        archived?: ArchivedConversation
        conversations?: Conversation[]
        archivedConversations?: ArchivedConversation[]
      }>(`/api/conversations/${id}/archive`, {
        method: 'POST',
      })

      if (response.success && response.archived) {
        const timer = saveDebounceTimers.get(id)
        if (timer) {
          clearTimeout(timer)
          saveDebounceTimers.delete(id)
        }
        conversationStreamStates.delete(id)

        conversations.value = Array.isArray(response.conversations)
          ? response.conversations
          : conversations.value.filter(c => c.id !== id)
        archivedConversations.value = Array.isArray(response.archivedConversations)
          ? response.archivedConversations
          : [response.archived, ...archivedConversations.value]
        sortArchivedConversations()

        if (previewingConversationId.value === id) {
          previewingConversationId.value = null
        }
        if (activeConversationId.value === id) {
          activeConversationId.value = conversations.value[0]?.id ?? null
        }

        if (typeof window !== 'undefined') {
          $fetch('/api/settings', {
            method: 'POST',
            body: { activeConversationId: activeConversationId.value },
          }).catch((e) => {
            console.error('Failed to save active conversation:', e)
          })
        }

        return { success: true }
      }
      return { success: false, error: 'Failed to archive conversation' }
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Failed to archive conversation',
      }
    }
  }

  async function restoreArchivedConversation(
    archiveId: string,
    baseBranch?: string,
  ): Promise<{ success: boolean; conversationId?: string; error?: string }> {
    const limits = checkStorageLimits()
    if (limits.atLimit) {
      return {
        success: false,
        error: `Cannot restore. Active conversations reached ${MAX_CONVERSATIONS}.`,
      }
    }

    if (!archivedConversations.value.some(c => c.id === archiveId)) {
      return { success: false, error: 'Archived conversation not found' }
    }

    try {
      const response = await $fetch<{
        success: boolean
        conversation?: Conversation
        conversations?: Conversation[]
        archivedConversations?: ArchivedConversation[]
      }>(`/api/conversations/archives/${archiveId}/restore`, {
        method: 'POST',
        body: { baseBranch },
      })

      if (response.success && response.conversation) {
        conversations.value = Array.isArray(response.conversations)
          ? response.conversations
          : [response.conversation, ...conversations.value]
        if (Array.isArray(response.archivedConversations)) {
          archivedConversations.value = response.archivedConversations
        } else {
          archivedConversations.value = archivedConversations.value.filter(c => c.id !== archiveId)
        }
        conversationViewMode.value = 'active'
        selectConversation(response.conversation.id)
        sortConversations()
        saveAllConversations()
        return { success: true, conversationId: response.conversation.id }
      }

      return { success: false, error: 'Failed to restore archived conversation' }
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Failed to restore archived conversation',
      }
    }
  }

  async function deleteArchivedConversation(archiveId: string): Promise<{ success: boolean; error?: string }> {
    const index = archivedConversations.value.findIndex(c => c.id === archiveId)
    if (index === -1) {
      return { success: false, error: 'Archived conversation not found' }
    }

    try {
      const response = await $fetch<{
        success: boolean
        archivedConversations?: ArchivedConversation[]
      }>(`/api/conversations/archives/${archiveId}`, {
        method: 'DELETE',
      })

      if (!response.success) {
        return { success: false, error: 'Failed to delete archived conversation' }
      }

      if (Array.isArray(response.archivedConversations)) {
        archivedConversations.value = response.archivedConversations
      } else {
        archivedConversations.value.splice(index, 1)
      }
      sortArchivedConversations()
      return { success: true }
    } catch {
      archivedConversations.value.splice(index, 1)
      saveAllConversations()
      return { success: true }
    }
  }

  /**
   * Initialize store (load persisted values from server)
   */
  async function initialize() {
    if (typeof window === 'undefined') return

    try {
      const saved = await $fetch<Record<string, unknown>>('/api/settings')
      if (saved) {
        if (typeof saved.panelWidth === 'number') {
          const width = saved.panelWidth
          if (width >= PANEL_MIN_WIDTH && width <= PANEL_MAX_WIDTH) {
            panelWidth.value = width
          }
        }
        // Restore panel open state
        if (typeof saved.isPanelOpen === 'boolean') {
          isPanelOpen.value = saved.isPanelOpen
        }
        // Restore active conversation ID
        if (typeof saved.activeConversationId === 'string') {
          activeConversationId.value = saved.activeConversationId
        }
        // permissionMode is now managed by settingsStore — sync from it
        const { useSettingsStore } = await import('~/stores/settings')
        const settingsStore = useSettingsStore()
        await settingsStore.hydrate()
        permissionMode.value = settingsStore.permissionMode
      }
    } catch (error) {
      console.error('Failed to load chat settings:', error)
    }
  }

  /**
   * Set permission mode — updates both local state and global settings store
   */
  function setPermissionMode(mode: PermissionMode) {
    permissionMode.value = mode
    // Delegate persistence to settings store
    if (typeof window !== 'undefined') {
      import('~/stores/settings').then(({ useSettingsStore }) => {
        const settingsStore = useSettingsStore()
        settingsStore.setPermissionMode(mode)
      })
    }
  }

  /**
   * Set pending permission request (per-conversation)
   */
  function setPendingPermission(request: PermissionRequest, conversationId?: string) {
    const id = conversationId ?? activeConversationId.value
    if (!id) return
    const state = ensureConvStreamState(id)
    state.pendingPermission = request
    streamStateTick.value++
  }

  /**
   * Clear pending permission request (per-conversation)
   */
  function clearPendingPermission(conversationId?: string) {
    const id = conversationId ?? activeConversationId.value
    if (!id) return
    const state = conversationStreamStates.get(id)
    if (state) {
      state.pendingPermission = null
      streamStateTick.value++
    }
  }

  /**
   * Set pending plan approval (per-conversation)
   */
  function setPendingPlanApproval(approval: PlanApproval, conversationId?: string) {
    const id = conversationId ?? activeConversationId.value
    if (!id) return
    const state = ensureConvStreamState(id)
    state.pendingPlanApproval = approval
    streamStateTick.value++
  }

  /**
   * Clear pending plan approval (per-conversation)
   */
  function clearPendingPlanApproval(conversationId?: string) {
    const id = conversationId ?? activeConversationId.value
    if (!id) return
    const state = conversationStreamStates.get(id)
    if (state) {
      state.pendingPlanApproval = null
      streamStateTick.value++
    }
  }

  /**
   * Toggle panel open/close
   */
  function togglePanel() {
    isPanelOpen.value = !isPanelOpen.value
    savePanelState()
  }

  /**
   * Open panel
   */
  function openPanel() {
    isPanelOpen.value = true
    savePanelState()
  }

  /**
   * Close panel
   */
  function closePanel() {
    isPanelOpen.value = false
    savePanelState()
  }

  /**
   * Save panel state to server
   */
  function savePanelState() {
    if (typeof window !== 'undefined') {
      $fetch('/api/settings', {
        method: 'POST',
        body: { isPanelOpen: isPanelOpen.value }
      }).catch((e) => {
        console.error('Failed to save panel state:', e)
      })
    }
  }

  /**
   * Set panel width (with constraints)
   */
  function setPanelWidth(width: number) {
    const constrainedWidth = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, width))
    panelWidth.value = constrainedWidth

    // Persist to server
    if (typeof window !== 'undefined') {
      $fetch('/api/settings', { method: 'POST', body: { panelWidth: constrainedWidth } }).catch((e) => {
        console.error('Failed to save panel width:', e)
      })
    }
  }

  /**
   * Set working directory
   */
  function setCwd(path: string) {
    cwd.value = path
  }

  /**
   * Set provider session ID (per-conversation)
   */
  function setProviderSessionId(id: string, conversationId?: string) {
    const convId = conversationId ?? activeConversationId.value
    if (!convId) return
    const conv = conversations.value.find(c => c.id === convId)
    if (conv) {
      conv.providerSessionId = id
    }
  }

  /**
   * Update worktree branch for a conversation (called when AI switches branches)
   */
  function updateWorktreeBranch(conversationId: string, newBranch: string) {
    const conv = conversations.value.find(c => c.id === conversationId)
    if (conv) {
      conv.worktreeBranch = newBranch
      conv.lastCommitTime = new Date().toISOString()
    }
  }

  /**
   * If the current worktree branch name matches a spec feature ID, link it.
   * This allows branch-first workflows to still highlight/reuse feature conversations.
   */
  async function syncConversationFeatureFromBranch(conversationId: string): Promise<string | null> {
    const conv = conversations.value.find(c => c.id === conversationId)
    if (!conv?.worktreeBranch) return null

    const branchName = conv.worktreeBranch.trim()
    if (!branchName) return null

    try {
      const data = await $fetch<{ features: Array<{ id: string }> }>('/api/specs/features')
      const matched = data.features.find(f => f.id === branchName)
      if (!matched) return null

      if (conv.featureId !== matched.id) {
        conv.featureId = matched.id
        conv.updatedAt = new Date().toISOString()
        saveAllConversations()
      }
      return matched.id
    } catch (error) {
      console.warn('[chat] Failed to map branch to feature', {
        conversationId,
        branchName,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  function setConversationProviderSelection(conversationId: string, providerId: string, providerModelKey: string) {
    const conv = conversations.value.find(c => c.id === conversationId)
    if (!conv) return
    conv.providerId = providerId
    conv.providerModelKey = providerModelKey
  }

  /**
   * Clear provider session ID (forces new AI conversation context)
   */
  function clearProviderSession(conversationId?: string) {
    const convId = conversationId ?? activeConversationId.value
    if (!convId) return
    const conv = conversations.value.find(c => c.id === convId)
    if (conv) {
      conv.providerSessionId = ''
    }
  }

  /**
   * Get provider session ID for a specific conversation
   */
  function getProviderSessionId(conversationId: string): string {
    const conv = conversations.value.find(c => c.id === conversationId)
    return conv?.providerSessionId ?? ''
  }

  /**
   * Start streaming for a specific conversation
   */
  function startConversationStreaming(conversationId: string) {
    streamingConversations.value.add(conversationId)
  }

  /**
   * End streaming for a specific conversation
   */
  function endConversationStreaming(conversationId: string) {
    streamingConversations.value.delete(conversationId)
  }

  // ===== Message mutation functions (operate on conversation directly) =====

  function getConversationMessages(conversationId: string): ChatMessage[] | null {
    const conv = conversations.value.find(c => c.id === conversationId)
    return conv?.messages ?? null
  }

  /**
   * Add a new message to a conversation
   */
  function addMessage(message: ChatMessage, conversationId?: string) {
    const id = conversationId ?? activeConversationId.value
    if (!id) return
    const conv = conversations.value.find(c => c.id === id)
    if (conv) {
      conv.messages.push(message)
    }
  }

  /**
   * Create and add a user message
   */
  function addUserMessage(content: string, conversationId?: string, attachments?: ChatImageAttachment[]): ChatMessage {
    const message: ChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
      timestamp: new Date().toISOString(),
    }
    addMessage(message, conversationId)
    return message
  }

  /**
   * Create and add an assistant message (starts as streaming)
   */
  function addAssistantMessage(conversationId?: string): ChatMessage {
    const message: ChatMessage = {
      id: generateMessageId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      status: 'streaming',
    }
    addMessage(message, conversationId)
    return message
  }

  /**
   * Update an existing message by ID
   */
  function updateMessage(id: string, updates: Partial<ChatMessage>, conversationId?: string) {
    const convId = conversationId ?? activeConversationId.value
    if (!convId) return
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv) return
    const index = conv.messages.findIndex(m => m.id === id)
    if (index !== -1) {
      conv.messages[index] = { ...conv.messages[index], ...updates }
    }
  }

  /**
   * Append content to a message (for streaming)
   */
  function appendToMessage(id: string, chunk: string, conversationId?: string) {
    const convId = conversationId ?? activeConversationId.value
    if (!convId) return
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv) return
    const index = conv.messages.findIndex(m => m.id === id)
    if (index !== -1) {
      conv.messages[index].content += chunk
    }
  }

  /**
   * Add a tool to a message (deprecated — use appendContentBlock with ToolUseBlock)
   */
  function addToolToMessage(id: string, tool: ToolUse, conversationId?: string) {
    const convId = conversationId ?? activeConversationId.value
    if (!convId) return
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv) return
    const index = conv.messages.findIndex(m => m.id === id)
    if (index !== -1) {
      const message = conv.messages[index]
      const tools = message.tools ? [...message.tools, tool] : [tool]
      conv.messages[index] = { ...message, tools }
    }
  }

  /**
   * Update a tool in a message (deprecated — use updateBlockById)
   */
  function updateToolInMessage(id: string, toolId: string, updates: Partial<ToolUse>, conversationId?: string) {
    const convId = conversationId ?? activeConversationId.value
    if (!convId) return
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv) return
    const index = conv.messages.findIndex(m => m.id === id)
    if (index !== -1) {
      const message = conv.messages[index]
      if (message.tools) {
        const toolIndex = message.tools.findIndex(t => t.id === toolId)
        if (toolIndex !== -1) {
          const updatedTools = [...message.tools]
          updatedTools[toolIndex] = { ...updatedTools[toolIndex], ...updates }
          conv.messages[index] = { ...message, tools: updatedTools }
        }
      }
    }
    // Save after tool update
    saveConversation(convId, false)
  }

  // ===== Content Block Mutation Methods =====

  /**
   * Rebuild flat content string from content blocks (for search/compat)
   */
  function syncContentFromBlocks(message: ChatMessage) {
    if (!message.contentBlocks) return
    message.content = buildMessageContentFromBlocks(message.contentBlocks)
  }

  /**
   * Initialize contentBlocks array on a message
   */
  function initContentBlocks(messageId: string, conversationId?: string) {
    const convId = conversationId ?? activeConversationId.value
    if (!convId) return
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv) return
    const msg = conv.messages.find(m => m.id === messageId)
    if (msg && !msg.contentBlocks) {
      msg.contentBlocks = []
    }
  }

  /**
   * Append a content block to a message
   */
  function appendContentBlock(messageId: string, block: ContentBlock, conversationId?: string) {
    const convId = conversationId ?? activeConversationId.value
    if (!convId) return
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv) return
    const msg = conv.messages.find(m => m.id === messageId)
    if (!msg) return
    if (!msg.contentBlocks) msg.contentBlocks = []
    msg.contentBlocks.push(block)
    syncContentFromBlocks(msg)
  }

  /**
   * Update a specific content block by its ID
   */
  function updateBlockById(messageId: string, blockId: string, updater: (block: ContentBlock) => void, conversationId?: string) {
    const convId = conversationId ?? activeConversationId.value
    if (!convId) return
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv) return
    const msg = conv.messages.find(m => m.id === messageId)
    if (!msg?.contentBlocks) return
    const blockIndex = msg.contentBlocks.findIndex(b => b.id === blockId)
    if (blockIndex === -1) return

    // Replace by reference after mutation so Vue reliably re-renders tool status changes.
    const current = msg.contentBlocks[blockIndex]
    const next = { ...current } as ContentBlock
    updater(next)
    msg.contentBlocks[blockIndex] = next
  }

  /**
   * Update a block by ID with debounced save (for streaming deltas)
   */
  function updateBlockWithSave(
    messageId: string,
    blockId: string,
    updater: (block: ContentBlock) => void,
    conversationId?: string,
    options?: { syncContent?: boolean },
  ) {
    const convId = conversationId ?? activeConversationId.value
    if (!convId) return
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv) return
    const msg = conv.messages.find(m => m.id === messageId)
    if (!msg) return
    updateBlockById(messageId, blockId, updater, convId)
    if (options?.syncContent !== false) {
      // Keep flat content synced unless the caller is handling incremental updates.
      syncContentFromBlocks(msg)
    }
    saveConversation(convId, false)
  }

  /**
   * Append a content block with debounced save
   */
  function appendContentBlockWithSave(messageId: string, block: ContentBlock, conversationId?: string) {
    const convId = conversationId ?? activeConversationId.value
    if (!convId) return
    appendContentBlock(messageId, block, convId)
    saveConversation(convId, false)
  }

  /**
   * Find a tool_use block by toolUseId
   */
  function findToolUseBlock(messageId: string, toolUseId: string, conversationId?: string): ContentBlock | null {
    const convId = conversationId ?? activeConversationId.value
    if (!convId) return null
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv) return null
    const msg = conv.messages.find(m => m.id === messageId)
    if (!msg?.contentBlocks) return null
    return msg.contentBlocks.find(b => b.type === 'tool_use' && b.toolUseId === toolUseId) ?? null
  }

  /**
   * Set session status (per-conversation)
   */
  function setSessionStatus(status: SessionStatus, conversationId?: string) {
    const id = conversationId ?? activeConversationId.value
    if (!id) return
    const state = conversationStreamStates.get(id)
    if (state?.session) {
      state.session.status = status
      streamStateTick.value++
    }
  }

  /**
   * Start a new session (per-conversation)
   */
  function startSession(sessionId: string, conversationId?: string) {
    const id = conversationId ?? activeConversationId.value
    if (!id) return
    const state = ensureConvStreamState(id)
    state.session = {
      sessionId,
      cwd: cwd.value,
      status: 'streaming',
      startedAt: new Date().toISOString(),
    }
    state.lastError = null
    streamStateTick.value++
  }

  /**
   * End session (mark as idle, per-conversation)
   */
  function endSession(conversationId?: string) {
    const id = conversationId ?? activeConversationId.value
    if (!id) return
    const state = conversationStreamStates.get(id)
    if (state?.session) {
      state.session.status = 'idle'
      streamStateTick.value++
    }
  }

  /**
   * Set session error (per-conversation)
   */
  function setSessionError(error: string, conversationId?: string) {
    const id = conversationId ?? activeConversationId.value
    if (!id) return
    const state = ensureConvStreamState(id)
    if (state.session) {
      state.session.status = 'error'
      state.session.error = error
    }
    state.lastError = error
    streamStateTick.value++
  }

  /**
   * Add runtime debug event (per-conversation, not persisted)
   */
  function pushDebugEvent(
    event: {
      direction: DebugEvent['direction']
      channel: DebugEvent['channel']
      eventType: string
      payload: unknown
    },
    conversationId?: string,
  ) {
    if (!debugStreamEnabled.value) return
    const id = conversationId ?? activeConversationId.value
    if (!id) return
    const state = ensureConvStreamState(id)

    const normalizedPayload = (() => {
      if (typeof event.payload === 'string') return event.payload
      try {
        return JSON.stringify(event.payload, null, 2)
      } catch {
        return String(event.payload)
      }
    })()

    const MAX_PAYLOAD_CHARS = 8000
    const MAX_DEBUG_EVENTS = 300
    const payload = normalizedPayload.length > MAX_PAYLOAD_CHARS
      ? `${normalizedPayload.slice(0, MAX_PAYLOAD_CHARS)}\n... (truncated)`
      : normalizedPayload

    state.debugEvents.push({
      id: `dbg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      direction: event.direction,
      channel: event.channel,
      eventType: event.eventType || 'unknown',
      payload,
    })

    if (state.debugEvents.length > MAX_DEBUG_EVENTS) {
      state.debugEvents.splice(0, state.debugEvents.length - MAX_DEBUG_EVENTS)
    }

    streamStateTick.value++
  }

  function setDebugStreamEnabled(enabled: boolean) {
    debugStreamEnabled.value = enabled
  }

  function clearDebugEvents(conversationId?: string) {
    const id = conversationId ?? activeConversationId.value
    if (!id) return
    const state = conversationStreamStates.get(id)
    if (!state) return
    state.debugEvents = []
    streamStateTick.value++
  }

  /**
   * Clear all messages for the active conversation
   */
  function clearMessages() {
    if (!activeConversationId.value) return
    const conv = conversations.value.find(c => c.id === activeConversationId.value)
    if (conv) {
      conv.messages = []
    }
    // Clear stream state for active conversation
    const id = activeConversationId.value
    conversationStreamStates.delete(id)
    streamStateTick.value++
  }

  /**
   * Clear error (per-conversation)
   */
  function clearError(conversationId?: string) {
    const id = conversationId ?? activeConversationId.value
    if (!id) return
    const state = conversationStreamStates.get(id)
    if (state) {
      state.lastError = null
      if (state.session) {
        state.session.error = undefined
      }
      streamStateTick.value++
    }
  }

  // ===== Conversation Management (T037-T041, T046-T048) =====

  /**
   * Load conversations from server-side storage (T037)
   */
  async function loadConversations() {
    const loaded = await loadFromStorage()
    conversations.value = loaded.conversations
    archivedConversations.value = loaded.archivedConversations

    if (loaded.discardedArchives > 0) {
      console.warn(`[chat] Skipped ${loaded.discardedArchives} corrupted archived conversation(s)`)
    }
    // Sort by most recently updated (T048)
    sortConversations()
    sortArchivedConversations()
    // Restore preview state from persisted previewBranch (FR-010)
    if (!previewingConversationId.value) {
      const previewing = conversations.value.find(c => !!c.previewBranch && !c.finalized)
      if (previewing) {
        previewingConversationId.value = previewing.id
      }
    }
    // Restore active conversation if it exists in loaded conversations
    if (activeConversationId.value) {
      const conv = conversations.value.find(c => c.id === activeConversationId.value)
      if (conv && conv.cwd) {
        cwd.value = conv.cwd
      } else if (!conv) {
        // Active conversation no longer exists, clear it
        activeConversationId.value = null
        isPanelOpen.value = false
      }
    }
  }

  /**
   * Save all conversations to server-side storage (T038)
   */
  function saveAllConversations() {
    saveToStorage(conversations.value, archivedConversations.value)
  }

  /**
   * Save a specific conversation with debounce (T046)
   */
  function saveConversation(conversationId: string, immediate = false) {
    const conv = conversations.value.find(c => c.id === conversationId)
    if (!conv) return

    if (immediate) {
      const existingTimer = saveDebounceTimers.get(conversationId)
      if (existingTimer) {
        clearTimeout(existingTimer)
        saveDebounceTimers.delete(conversationId)
      }
      conv.updatedAt = new Date().toISOString()
      saveAllConversations()
    } else {
      const existingTimer = saveDebounceTimers.get(conversationId)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }
      const timer = setTimeout(() => {
        conv.updatedAt = new Date().toISOString()
        saveAllConversations()
        saveDebounceTimers.delete(conversationId)
      }, STREAM_SAVE_DEBOUNCE_MS)
      saveDebounceTimers.set(conversationId, timer)
    }
  }

  /**
   * Save current conversation (convenience wrapper)
   */
  function saveCurrentConversation(immediate = false) {
    if (!activeConversationId.value) return
    saveConversation(activeConversationId.value, immediate)
  }

  /**
   * Sort conversations by newest created first
   */
  function sortConversations() {
    conversations.value.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  function sortArchivedConversations() {
    archivedConversations.value.sort((a, b) =>
      new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime()
    )
  }

  /**
   * Create a new conversation (T039) — now async for worktree creation
   * Returns empty string if creation is blocked at the 100-conversation limit.
   */
  async function createConversation(options?: { featureId?: string; baseBranch?: string }): Promise<string> {
    // Check storage limits — block creation at hard limit (FR-002)
    const limits = checkStorageLimits()
    if (limits.atLimit) {
      return ''
    }

    const id = generateConversationId()

    // For feature-originated conversations, validate worktree first before creating conversation
    // This prevents the chat card from appearing and then disappearing on branch conflict
    let worktreeResult: { success: boolean; worktreePath?: string; branch?: string; baseBranch?: string; providerSessionId?: string; error?: string } | null = null
    if (options?.featureId) {
      const res = await $fetch<{ success: boolean; worktreePath?: string; branch?: string; baseBranch?: string; providerSessionId?: string; error?: string }>('/api/chat/worktree', {
        method: 'POST',
        body: { conversationId: id, featureId: options.featureId, baseBranch: options.baseBranch },
      })
      if (!res.success && res.error) {
        throw new Error(res.error)
      }
      worktreeResult = res
    }

    let providerSelection: { providerId: string; modelKey: string } | null = null
    if (typeof window !== 'undefined') {
      try {
        const { useSettingsStore } = await import('~/stores/settings')
        const settingsStore = useSettingsStore()
        await settingsStore.hydrate()
        providerSelection = settingsStore.providerSelection
      } catch (error) {
        console.warn('[chat] Failed to load provider selection for new conversation', error)
      }
    }

    const resolvedProviderSelection = providerSelection || {
      providerId: DEFAULT_PROVIDER_ID,
      modelKey: DEFAULT_MODEL_KEY,
    }

    const conv: Conversation = {
      id,
      title: 'New Conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cwd: cwd.value || process.cwd?.() || '',
      featureId: options?.featureId,
      providerId: resolvedProviderSelection.providerId,
      providerModelKey: resolvedProviderSelection.modelKey,
    }

    // Apply worktree info if already fetched (feature-originated)
    if (worktreeResult?.success && worktreeResult.worktreePath && worktreeResult.branch) {
      conv.worktreePath = worktreeResult.worktreePath
      conv.worktreeBranch = worktreeResult.branch
      conv.cwd = worktreeResult.worktreePath
      conv.hasWorktree = true
      if (worktreeResult.baseBranch) {
        conv.baseBranch = worktreeResult.baseBranch
      }
      if (worktreeResult.providerSessionId) {
        conv.providerSessionId = worktreeResult.providerSessionId
      }
    }

    conversations.value.unshift(conv)
    activeConversationId.value = id

    // Save active conversation ID to settings
    if (typeof window !== 'undefined') {
      $fetch('/api/settings', {
        method: 'POST',
        body: { activeConversationId: id }
      }).catch((e) => {
        console.error('Failed to save active conversation:', e)
      })
    }

    // For non-feature conversations, create worktree after adding to list (graceful fallback)
    if (!options?.featureId) {
      try {
        const res = await $fetch<{ success: boolean; worktreePath?: string; branch?: string; baseBranch?: string; error?: string }>('/api/chat/worktree', {
          method: 'POST',
          body: { conversationId: id, baseBranch: options?.baseBranch },
        })

        if (res.success && res.worktreePath && res.branch) {
          const reactiveConv = conversations.value.find(c => c.id === id)
          if (reactiveConv) {
            reactiveConv.worktreePath = res.worktreePath
            reactiveConv.worktreeBranch = res.branch
            reactiveConv.cwd = res.worktreePath
            reactiveConv.hasWorktree = true
            if (res.baseBranch) {
              reactiveConv.baseBranch = res.baseBranch
            }
          }
        }
      } catch (err) {
        // Graceful fallback — conversation works without worktree isolation
        console.warn('[chat] Failed to create worktree for conversation', id, err)
      }
    }

    saveAllConversations()
    return id
  }

  /**
   * Select and load a conversation (T040)
   */
  function selectConversation(id: string) {
    const conv = conversations.value.find(c => c.id === id)
    if (!conv) return

    activeConversationId.value = id
    isPanelOpen.value = true

    // Update CWD if conversation has one
    if (conv.cwd) {
      cwd.value = conv.cwd
    }

    // Branch-first flow: if featureId is not linked yet, backfill from an exact
    // branch/spec directory match so feature panels can highlight correctly.
    if (!conv.featureId && conv.worktreeBranch) {
      void syncConversationFeatureFromBranch(id)
    }

    // Save active conversation ID to settings
    if (typeof window !== 'undefined') {
      $fetch('/api/settings', {
        method: 'POST',
        body: { activeConversationId: id, isPanelOpen: true }
      }).catch((e) => {
        console.error('Failed to save active conversation:', e)
      })
    }
  }

  /**
   * Delete a conversation (T041) — now async for worktree cleanup
   */
  async function deleteConversation(id: string) {
    const index = conversations.value.findIndex(c => c.id === id)
    if (index === -1) return

    const conv = conversations.value[index]

    // Clear preview state if this conversation was being previewed
    if (previewingConversationId.value === id) {
      previewingConversationId.value = null
    }

    // Clean up worktree if present
    if (conv.hasWorktree && conv.worktreePath && conv.worktreeBranch) {
      try {
        await $fetch('/api/chat/worktree', {
          method: 'DELETE',
          body: { worktreePath: conv.worktreePath, branch: conv.worktreeBranch },
        })
      } catch (err) {
        console.warn('[chat] Failed to clean up worktree for conversation', id, err)
      }
    }

    conversations.value.splice(index, 1)

    // Clean up stream state
    conversationStreamStates.delete(id)
    const timer = saveDebounceTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      saveDebounceTimers.delete(id)
    }

    // If deleted conversation was active, clear the panel
    if (activeConversationId.value === id) {
      activeConversationId.value = null
      // Clear from settings
      if (typeof window !== 'undefined') {
        $fetch('/api/settings', {
          method: 'POST',
          body: { activeConversationId: null }
        }).catch((e) => {
          console.error('Failed to clear active conversation:', e)
        })
      }
    }

    saveAllConversations()
  }

  /**
   * Finalize a conversation: squash commits, merge to base branch, clean up worktree
   */
  async function finalizeConversation(id: string, commitMessage: string, targetBranch?: string): Promise<FinalizeResponse> {
    const conv = conversations.value.find(c => c.id === id)
    if (!conv) {
      return { success: false, error: 'Conversation not found' }
    }
    if (!conv.hasWorktree) {
      return { success: false, error: 'No worktree associated with this conversation' }
    }

    const baseBranch = targetBranch || conv.baseBranch

    try {
      const res = await $fetch<FinalizeResponse>('/api/chat/finalize', {
        method: 'POST',
        body: {
          conversationId: id,
          commitMessage,
          baseBranch,
          worktreePath: conv.worktreePath,
          worktreeBranch: conv.worktreeBranch,
        },
      })

      if (res.success) {
        // Clear preview state if this conversation was being previewed
        if (previewingConversationId.value === id) {
          previewingConversationId.value = null
        }
        // Clear worktree-related fields and mark as finalized
        conv.worktreePath = undefined
        conv.worktreeBranch = undefined
        conv.hasWorktree = false
        conv.baseBranch = undefined
        conv.previewBranch = undefined
        conv.finalized = true
        conv.updatedAt = new Date().toISOString()
        saveAllConversations()
      } else if (res.rebaseInProgress && res.conflictFiles?.length) {
        // Enter conflict resolution mode
        await startConflictResolution(id, conv.worktreePath!, baseBranch || 'main', commitMessage)
      }

      return res
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Rebase worktree onto latest base branch without finalizing (sync only)
   */
  async function rebaseConversation(id: string, targetBranch?: string): Promise<FinalizeResponse> {
    const conv = conversations.value.find(c => c.id === id)
    if (!conv) {
      return { success: false, error: 'Conversation not found' }
    }
    if (!conv.hasWorktree) {
      return { success: false, error: 'No worktree associated with this conversation' }
    }

    const rebaseBranch = targetBranch || conv.baseBranch

    try {
      const res = await $fetch<FinalizeResponse>('/api/chat/rebase', {
        method: 'POST',
        body: {
          conversationId: id,
          baseBranch: rebaseBranch,
          worktreePath: conv.worktreePath,
        },
      })

      if (res.rebaseInProgress && res.conflictFiles?.length) {
        // Enter conflict resolution mode (sync mode — keep worktree after)
        await startConflictResolution(id, conv.worktreePath!, rebaseBranch || 'main', '', 'sync')
      } else if (res.success) {
        await syncPreviewBranchIfActive(conv)
        // Update conversation's baseBranch to the target branch after successful rebase
        conv.baseBranch = rebaseBranch
        saveAllConversations()
      }

      return res
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Start conflict resolution: fetch conflicted file contents
   */
  async function startConflictResolution(
    conversationId: string,
    worktreePath: string,
    baseBranch: string,
    commitMessage: string,
    mode: 'finalize' | 'sync' = 'finalize',
  ) {
    conflictState.value = {
      conversationId,
      worktreePath,
      baseBranch,
      commitMessage,
      files: [],
      resolvedFiles: new Set(),
      loading: true,
      error: null,
      mode,
    }

    try {
      const res = await $fetch<ConflictListResponse>('/api/rebase/conflicts', {
        params: { worktreePath },
      })
      if (conflictState.value) {
        conflictState.value.files = res.files
        conflictState.value.loading = false
      }
    } catch (err) {
      if (conflictState.value) {
        conflictState.value.error = err instanceof Error ? err.message : String(err)
        conflictState.value.loading = false
      }
    }
  }

  /**
   * Resolve a single conflict file: write content and mark as resolved
   */
  async function resolveConflictFile(filePath: string, content: string): Promise<boolean> {
    if (!conflictState.value) return false

    try {
      const res = await $fetch<{ success: boolean; error?: string }>('/api/rebase/resolve', {
        method: 'PUT',
        body: {
          worktreePath: conflictState.value.worktreePath,
          filePath,
          content,
        },
      })
      if (res.success && conflictState.value) {
        conflictState.value.resolvedFiles.add(filePath)
      }
      return res.success
    } catch {
      return false
    }
  }

  /**
   * Continue rebase after all conflicts are resolved.
   * Routes to finalize cleanup or sync-only based on conflictState.mode.
   */
  async function continueRebase(): Promise<FinalizeResponse> {
    if (!conflictState.value) {
      return { success: false, error: 'No conflict resolution in progress' }
    }

    const { conversationId, commitMessage, baseBranch, mode, worktreePath } = conflictState.value

    // Choose endpoint based on mode
    const endpoint = mode === 'sync' ? '/api/rebase/continue-sync' : '/api/rebase/continue'

    try {
      const conv = conversations.value.find(c => c.id === conversationId)
      const res = await $fetch<FinalizeResponse>(endpoint, {
        method: 'POST',
        body: { conversationId, commitMessage, baseBranch, worktreePath, worktreeBranch: conv?.worktreeBranch },
      })

      if (res.success) {
        if (mode === 'finalize') {
          // Clear preview state if this conversation was being previewed
          if (previewingConversationId.value === conversationId) {
            previewingConversationId.value = null
          }
          // Finalization complete — clear worktree fields and mark as finalized
          const conv = conversations.value.find(c => c.id === conversationId)
          if (conv) {
            conv.worktreePath = undefined
            conv.worktreeBranch = undefined
            conv.hasWorktree = false
            conv.baseBranch = undefined
            conv.previewBranch = undefined
            conv.finalized = true
            conv.updatedAt = new Date().toISOString()
            saveAllConversations()
          }
        } else if (mode === 'sync') {
          // Sync mode (rebase): update baseBranch to the rebase target
          const conv = conversations.value.find(c => c.id === conversationId)
          if (conv) {
            await syncPreviewBranchIfActive(conv)
            conv.baseBranch = baseBranch
            conv.updatedAt = new Date().toISOString()
            saveAllConversations()
          }
        }
        conflictState.value = null
      } else if (res.rebaseInProgress && res.conflictFiles?.length) {
        // More conflicts — refresh
        await startConflictResolution(conversationId, worktreePath, baseBranch, commitMessage, mode)
      }

      return res
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Abort rebase and exit conflict resolution mode
   */
  async function abortRebase(): Promise<boolean> {
    if (!conflictState.value) return false

    try {
      const res = await $fetch<RebaseAbortResponse>('/api/rebase/abort', {
        method: 'POST',
        body: { worktreePath: conflictState.value.worktreePath },
      })
      conflictState.value = null
      return res.success
    } catch {
      conflictState.value = null
      return false
    }
  }

  /**
  * AI-resolve a single conflict file: send content to the AI provider for intelligent merge [FR-018]
   */
  async function aiResolveConflictFile(filePath: string): Promise<boolean> {
    if (!conflictState.value) return false

    const file = conflictState.value.files.find(f => f.path === filePath)
    if (!file) return false

    try {
      const res = await $fetch<AiResolveResponse>('/api/rebase/ai-resolve', {
        method: 'POST',
        body: {
          worktreePath: conflictState.value.worktreePath,
          filePath,
          conflictContent: file.content,
        },
      })

      if (res.success && res.resolvedContent !== undefined) {
        // Update the file content in conflictState
        file.content = res.resolvedContent
        // Auto-resolve: write to disk and mark as resolved
        return await resolveConflictFile(filePath, res.resolvedContent)
      }
      return false
    } catch {
      return false
    }
  }

  /**
   * AI-resolve all unresolved conflict files sequentially [FR-019]
   */
  async function aiResolveAllConflicts(): Promise<void> {
    if (!conflictState.value) return

    const unresolved = conflictState.value.files.filter(
      f => !conflictState.value!.resolvedFiles.has(f.path)
    )

    for (const file of unresolved) {
      await aiResolveConflictFile(file.path)
    }
  }

  /**
   * Preview: checkout worktree HEAD in main worktree via a temp branch
   */
  async function previewConversation(id: string): Promise<{ success: boolean; error?: string }> {
    const conv = conversations.value.find(c => c.id === id)
    if (!conv) return { success: false, error: 'Conversation not found' }
    if (!conv.hasWorktree || !conv.worktreePath || !conv.baseBranch) {
      return { success: false, error: 'No worktree to preview' }
    }

    try {
      const res = await $fetch<{ success: boolean; previewBranch?: string; error?: string }>('/api/chat/preview', {
        method: 'POST',
        body: {
          conversationId: id,
          worktreePath: conv.worktreePath,
          baseBranch: conv.baseBranch,
        },
      })

      if (res.success && res.previewBranch) {
        conv.previewBranch = res.previewBranch
        previewingConversationId.value = id
        conv.updatedAt = new Date().toISOString()
        saveAllConversations()
      }
      return { success: res.success, error: res.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * End preview: switch main worktree back to baseBranch, delete preview branch
   */
  async function unpreviewConversation(id: string): Promise<{ success: boolean; error?: string }> {
    const conv = conversations.value.find(c => c.id === id)
    if (!conv) return { success: false, error: 'Conversation not found' }
    if (!conv.previewBranch || !conv.baseBranch) {
      previewingConversationId.value = null
      return { success: false, error: 'No active preview' }
    }

    try {
      const res = await $fetch<{ success: boolean; error?: string }>('/api/chat/preview', {
        method: 'DELETE',
        body: {
          previewBranch: conv.previewBranch,
          baseBranch: conv.baseBranch,
        },
      })

      if (res.success) {
        conv.previewBranch = undefined
        previewingConversationId.value = null
        conv.updatedAt = new Date().toISOString()
        saveAllConversations()
      }
      return { success: res.success, error: res.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Toggle preview for a conversation (FR-011).
   * If this conversation is already previewing, end preview.
   * If another conversation is previewing, switch to this one.
   */
  async function togglePreview(id: string): Promise<{ success: boolean; error?: string }> {
    // Already previewing this conversation — end it
    if (previewingConversationId.value === id) {
      const res = await unpreviewConversation(id)
      return res
    }

    // Another conversation is previewing — end that first
    if (previewingConversationId.value) {
      const endResult = await unpreviewConversation(previewingConversationId.value)
      if (!endResult.success) {
        return { success: false, error: `Failed to end previous preview: ${endResult.error}` }
      }
    }

    // Start preview for the new conversation
    return await previewConversation(id)
  }

  /**
   * Find an existing conversation associated with a feature ID
   */
  function findConversationByFeature(featureId: string): Conversation | null {
    const normalizedFeatureId = featureId.trim()
    if (!normalizedFeatureId) return null

    const candidates = conversations.value.filter((conversation) => {
      if (conversation.featureId === normalizedFeatureId) {
        return true
      }
      return conversation.worktreeBranch?.trim() === normalizedFeatureId
    })

    if (candidates.length === 0) return null

    return candidates.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0] || null
  }

  /**
   * Add a pre-built conversation from Auto Mode (T007: FR-004, FR-008)
   * Worktree is already created server-side by the scheduler.
   */
  function addAutoModeConversation(conv: Conversation) {
    conversations.value.unshift(conv)
    sortConversations()
    saveAllConversations()
  }

  /**
   * Rename a conversation (T049)
   */
  function renameConversation(id: string, title: string) {
    const conv = conversations.value.find(c => c.id === id)
    if (conv) {
      conv.title = title.trim()
      conv.updatedAt = new Date().toISOString()
      sortConversations()
      saveAllConversations()
    }
  }

  /**
   * Update conversation title from first user message (T047)
   */
  function updateConversationTitleIfNeeded(conversationId?: string) {
    const id = conversationId ?? activeConversationId.value
    if (!id) return

    const conv = conversations.value.find(c => c.id === id)
    if (!conv) return

    // Only auto-generate title if it's still the default
    if (conv.title !== 'New Conversation') return

    // Find first user message
    const firstUserMessage = conv.messages.find(m => m.role === 'user')
    if (firstUserMessage) {
      const hasText = firstUserMessage.content.trim().length > 0
      if (hasText) {
        conv.title = generateConversationTitle(firstUserMessage.content)
      } else if (firstUserMessage.attachments && firstUserMessage.attachments.length > 0) {
        conv.title = firstUserMessage.attachments.length === 1
          ? '[Image] New Conversation'
          : `[${firstUserMessage.attachments.length} Images] New Conversation`
      }
    }
  }

  /**
   * Check storage limits (T015, T058)
   * Returns limit status — callers decide whether to block creation
   */
  function checkStorageLimits(): { atLimit: boolean; nearLimit: boolean; count: number } {
    const count = conversations.value.length
    return {
      atLimit: count >= MAX_CONVERSATIONS,
      nearLimit: count >= WARN_CONVERSATIONS_THRESHOLD,
      count,
    }
  }

  // ===== Enhanced Message Actions (with auto-save) =====

  /**
   * Create and add a user message (with conversation handling) — now async
   */
  async function addUserMessageWithConversation(content: string, attachments?: ChatImageAttachment[]): Promise<ChatMessage> {
    // Create conversation if none active
    if (!activeConversationId.value) {
      await createConversation()
    }

    const message = addUserMessage(content, undefined, attachments)

    // Update title if needed (T047)
    updateConversationTitleIfNeeded()

    // Save immediately (T046)
    saveCurrentConversation(true)

    return message
  }

  /**
   * Append to message with debounced save (for streaming)
   */
  function appendToMessageWithSave(id: string, chunk: string, conversationId?: string) {
    const convId = conversationId ?? activeConversationId.value
    appendToMessage(id, chunk, convId ?? undefined)
    // Debounced save during streaming (T046)
    if (convId) {
      saveConversation(convId, false)
    }
  }

  /**
   * Complete message and save
   */
  function completeMessageWithSave(id: string, conversationId?: string) {
    const convId = conversationId ?? activeConversationId.value
    updateMessage(id, { status: 'complete' }, convId ?? undefined)
    // Immediate save on completion
    if (convId) {
      saveConversation(convId, true)
    }
  }

  return {
    // State (readonly for external consumers)
    messages,
    session,
    isPanelOpen,
    panelWidth: readonly(panelWidth),
    permissionMode: readonly(permissionMode),
    pendingPermission,
    pendingPlanApproval,
    cwd: readonly(cwd),
    lastError,
    debugEvents,
    debugStreamEnabled: readonly(debugStreamEnabled),
    providerSessionId,

    // Conversation state (T036)
    conversations: readonly(conversations),
    archivedConversations: readonly(archivedConversations),
    activeConversationId: readonly(activeConversationId),
    conversationViewMode: readonly(conversationViewMode),
    conflictState: readonly(conflictState),
    previewingConversationId: readonly(previewingConversationId),

    // Computed
    isStreaming,
    hasMessages,
    lastMessage,
    isActiveConversationStreaming,

    // Conversation computed
    hasConversations,
    hasArchivedConversations,
    activeConversation,
    conversationCount,
    isNearStorageLimit,
    sortedConversations,
    sortedArchivedConversations,
    previewingConversation,
    streamingConversations: readonly(streamingConversations),

    // Actions
    initialize,
    togglePanel,
    openPanel,
    closePanel,
    setPanelWidth,
    setPermissionMode,
    setPendingPermission,
    clearPendingPermission,
    setPendingPlanApproval,
    clearPendingPlanApproval,
    setCwd,
    setProviderSessionId,
    clearProviderSession,
    getProviderSessionId,
    updateWorktreeBranch,
    setConversationProviderSelection,
    startConversationStreaming,
    endConversationStreaming,
    isConversationStreaming,
    addMessage,
    addUserMessage,
    addAssistantMessage,
    updateMessage,
    appendToMessage,
    addToolToMessage,
    updateToolInMessage,
    initContentBlocks,
    appendContentBlock,
    appendContentBlockWithSave,
    updateBlockById,
    updateBlockWithSave,
    findToolUseBlock,
    syncContentFromBlocks,
    setSessionStatus,
    startSession,
    endSession,
    setSessionError,
    setDebugStreamEnabled,
    pushDebugEvent,
    clearDebugEvents,
    clearMessages,
    clearError,

    // Conversation actions
    loadConversations,
    saveAllConversations,
    saveCurrentConversation,
    saveConversation,
    createConversation,
    selectConversation,
    deleteConversation,
    archiveConversation,
    restoreArchivedConversation,
    deleteArchivedConversation,
    setConversationViewMode,
    findConversationByFeature,
    syncConversationFeatureFromBranch,
    addAutoModeConversation,
    renameConversation,
    checkStorageLimits,
    finalizeConversation,
    rebaseConversation,
    resolveConflictFile,
    continueRebase,
    abortRebase,
    aiResolveConflictFile,
    aiResolveAllConflicts,
    previewConversation,
    unpreviewConversation,
    togglePreview,
    isConversationPreviewing,
    addUserMessageWithConversation,
    appendToMessageWithSave,
    completeMessageWithSave,
  }
})
