<script setup lang="ts">
import { useChatStore } from '~/stores/chat'
import { useChatStream } from '~/composables/useChatStream'
import { PaperAirplaneIcon, StopIcon, ArrowPathIcon, ChevronDownIcon } from '@heroicons/vue/24/solid'
import {
  PaperClipIcon,
  XMarkIcon,
  ClipboardDocumentListIcon,  // plan
  QuestionMarkCircleIcon,     // ask
  BoltIcon,                   // auto
  ShieldExclamationIcon,      // bypass
} from '@heroicons/vue/24/outline'
import { PERMISSION_MODE_LABELS, type PermissionMode, type ChatImageAttachment } from '~/types/chat'
import type { SearchMode, SearchResponse } from '~/types/specSearch'
import type { AIProviderMetadata, AIProviderSelection } from '~/types/aiProvider'
import { DEFAULT_MODEL_KEY, DEFAULT_PROVIDER_ID } from '~/types/aiProvider'
import { useSettingsStore } from '~/stores/settings'

const props = defineProps<{
  disabled?: boolean
}>()

const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const { sendMessage: streamMessage, sendPermissionResponse, approvePlan, rejectPlan, abort, resetContext } = useChatStream()

const inputText = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isSending = ref(false)
const showModeMenu = ref(false)
const showModelMenu = ref(false)
const pendingAttachments = ref<ChatImageAttachment[]>([])
let pendingResizeRaf: number | null = null
const pendingConversationSelection = ref<AIProviderSelection | null>(null)

const { data: providerResponse, pending: providersLoading } = useAsyncData<{ providers: AIProviderMetadata[] }>(
  'chat-input-ai-providers',
  () => $fetch<{ providers: AIProviderMetadata[] }>('/api/ai/providers'),
  { server: false, default: () => ({ providers: [] }) },
)

const providers = computed(() => providerResponse.value?.providers ?? [])

interface ModelOption {
  key: string
  providerId: string
  providerName: string
  modelKey: string
  modelLabel: string
  label: string
  compatible: boolean
}

interface ModelOptionGroup {
  providerId: string
  providerName: string
  options: ModelOption[]
}

const requiresPermissions = computed(() => chatStore.permissionMode === 'ask' || chatStore.permissionMode === 'plan')
const modelOptions = computed<ModelOption[]>(() => {
  const labelCounts = new Map<string, number>()
  for (const provider of providers.value) {
    for (const model of provider.models) {
      labelCounts.set(model.label, (labelCounts.get(model.label) ?? 0) + 1)
    }
  }

  const options = providers.value.flatMap((provider) => provider.models.map((model) => {
    const compatible = provider.capabilities.streaming
      && (!requiresPermissions.value || provider.capabilities.permissions)
    const isDuplicatedModelLabel = (labelCounts.get(model.label) ?? 0) > 1
    return {
      key: `${provider.id}::${model.key}`,
      providerId: provider.id,
      providerName: provider.name,
      modelKey: model.key,
      modelLabel: model.label,
      label: isDuplicatedModelLabel ? `${model.label} · ${provider.name}` : model.label,
      compatible,
    }
  }))
  return options.sort((a, b) =>
    a.modelLabel.localeCompare(b.modelLabel, undefined, { sensitivity: 'base' }) ||
    a.providerName.localeCompare(b.providerName, undefined, { sensitivity: 'base' })
  )
})
const modelOptionGroups = computed<ModelOptionGroup[]>(() => {
  const groupMap = new Map<string, ModelOptionGroup>()
  for (const option of modelOptions.value) {
    const existing = groupMap.get(option.providerId)
    if (existing) {
      existing.options.push(option)
      continue
    }
    groupMap.set(option.providerId, {
      providerId: option.providerId,
      providerName: option.providerName,
      options: [option],
    })
  }

  const providerOrder = new Map<string, number>([
    ['codex', 0],
    ['claude', 1],
  ])
  const groups = Array.from(groupMap.values())
  groups.sort((a, b) => {
    const aOrder = providerOrder.get(a.providerId) ?? 99
    const bOrder = providerOrder.get(b.providerId) ?? 99
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.providerName.localeCompare(b.providerName, undefined, { sensitivity: 'base' })
  })
  return groups
})

function getSelectionKey(selection: AIProviderSelection): string {
  return `${selection.providerId}::${selection.modelKey}`
}

const currentSelection = computed<AIProviderSelection>(() => {
  const conv = chatStore.activeConversation
  if (conv?.providerId && conv.providerModelKey) {
    return { providerId: conv.providerId, modelKey: conv.providerModelKey }
  }
  if (pendingConversationSelection.value) {
    return pendingConversationSelection.value
  }
  return settingsStore.providerSelection
})

const selectedModelKey = computed(() => getSelectionKey(currentSelection.value))
const selectedModelOption = computed(() =>
  modelOptions.value.find(option => option.key === selectedModelKey.value) || null
)
const selectedModelLabel = computed(() => selectedModelOption.value?.label || 'Select model')

function applyConversationSelection(conversationId: string, selection: AIProviderSelection) {
  chatStore.setConversationProviderSelection(conversationId, selection.providerId, selection.modelKey)
  chatStore.clearProviderSession(conversationId)
  chatStore.saveConversation(conversationId, true)
}

function applyPendingConversationSelectionIfNeeded(conversationId: string) {
  if (!pendingConversationSelection.value) return
  applyConversationSelection(conversationId, pendingConversationSelection.value)
  pendingConversationSelection.value = null
}

function selectModel(option: ModelOption) {
  if (!option || !option.compatible) return

  const selection: AIProviderSelection = {
    providerId: option.providerId,
    modelKey: option.modelKey,
  }

  const conversationId = chatStore.activeConversationId
  if (conversationId) {
    applyConversationSelection(conversationId, selection)
    pendingConversationSelection.value = null
    showModelMenu.value = false
    return
  }
  pendingConversationSelection.value = selection
  showModelMenu.value = false
}

const MAX_IMAGE_ATTACHMENTS = 4
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

const modeIcons = {
  plan: ClipboardDocumentListIcon,
  ask: QuestionMarkCircleIcon,
  auto: BoltIcon,
  bypass: ShieldExclamationIcon,
}

const modeColors = {
  plan: 'text-retro-cyan',
  ask: 'text-retro-green',
  auto: 'text-retro-yellow',
  bypass: 'text-retro-red',
}

function selectMode(mode: PermissionMode) {
  chatStore.setPermissionMode(mode)
  showModeMenu.value = false
}

// Close menu when clicking outside
function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.mode-selector')) {
    showModeMenu.value = false
  }
  if (!target.closest('.model-selector')) {
    showModelMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  void settingsStore.hydrate()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  if (pendingResizeRaf !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(pendingResizeRaf)
    pendingResizeRaf = null
  }
})

const canSend = computed(() => {
  return (inputText.value.trim().length > 0 || pendingAttachments.value.length > 0) &&
    !chatStore.isActiveConversationStreaming &&
    !isSending.value &&
    !chatStore.pendingPermission &&
    !hasPendingPlanApproval.value
})

const canStop = computed(() => {
  return chatStore.isActiveConversationStreaming && !chatStore.pendingPermission
})

const hasPendingPermission = computed(() => {
  return chatStore.pendingPermission !== null
})

const hasPendingPlanApproval = computed(() => {
  return chatStore.pendingPlanApproval !== null
})

function allowPermission() {
  sendPermissionResponse(true, chatStore.activeConversationId!)
}

function denyPermission() {
  sendPermissionResponse(false, chatStore.activeConversationId!)
}

function handleApprovePlan() {
  approvePlan(chatStore.activeConversationId!)
}

function handleRejectPlan() {
  rejectPlan(chatStore.activeConversationId!)
}

function clearPendingAttachments() {
  pendingAttachments.value = []
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function removeAttachment(id: string) {
  pendingAttachments.value = pendingAttachments.value.filter(attachment => attachment.id !== id)
}

function formatAttachmentSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read image'))
      }
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}

async function handleFilePick(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  if (files.length === 0) return

  const { useToast } = await import('~/composables/useToast')
  const toast = useToast()

  let capacity = MAX_IMAGE_ATTACHMENTS - pendingAttachments.value.length
  if (capacity <= 0) {
    toast.warning(`You can attach up to ${MAX_IMAGE_ATTACHMENTS} images per message.`)
    input.value = ''
    return
  }

  for (const file of files) {
    if (capacity <= 0) break
    if (!file.type.startsWith('image/')) {
      toast.warning(`Skipped "${file.name}": only image files are supported.`)
      continue
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.warning(`Skipped "${file.name}": max size is 5 MB.`)
      continue
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      pendingAttachments.value.push({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        dataUrl,
      })
      capacity--
    } catch {
      toast.error(`Failed to attach "${file.name}".`)
    }
  }

  input.value = ''
}

// T056: Check if last message had an error and can be retried
const canRetry = computed(() => {
  if (chatStore.isActiveConversationStreaming || isSending.value) return false
  const lastMsg = chatStore.lastMessage
  return lastMsg?.role === 'assistant' && lastMsg?.status === 'error'
})

interface ContextDiagnostics {
  generatedAt: string
  requestedCwd: string
  effectiveCwd: string
  providerId: string
  providerModelKey: string
  permissionMode: string
  providerSessionId: string | null
  sessionState: 'resume' | 'fresh'
  featureId: string | null
  specContext: {
    active: boolean
    reason: string
    files: string[]
  }
  instructionFiles: Array<{
    path: string
    source: 'cwd' | 'ancestor'
    kind: 'file' | 'directory'
    hint: string
    mtime: string | null
  }>
}

function formatContextDiagnostics(diag: ContextDiagnostics): string {
  const instructionLines = diag.instructionFiles.length > 0
    ? diag.instructionFiles.map((file) => {
        const scope = file.source === 'cwd' ? 'cwd' : 'ancestor'
        const mtime = file.mtime ? ` (mtime: ${file.mtime})` : ''
        return `- \`${file.path}\` [${scope}] - ${file.hint}${mtime}`
      })
    : ['- (none detected from current cwd ancestry)']

  const specFiles = diag.specContext.files.length > 0
    ? diag.specContext.files.map((file) => `- \`${file}\``)
    : ['- (none)']

  return [
    '## Context Snapshot',
    '',
    `- Time: ${diag.generatedAt}`,
    `- Session state: **${diag.sessionState}**`,
    `- Provider session ID: \`${diag.providerSessionId ?? '(empty)'}\``,
    `- Provider: \`${diag.providerId}\` / \`${diag.providerModelKey}\``,
    `- Permission mode: \`${diag.permissionMode}\``,
    `- CWD (requested): \`${diag.requestedCwd}\``,
    `- CWD (effective): \`${diag.effectiveCwd}\``,
    `- Feature: \`${diag.featureId ?? '(none)'}\``,
    '',
    '### Spec Context Injection',
    `- Active on next turn: **${diag.specContext.active ? 'yes' : 'no'}**`,
    `- Reason: ${diag.specContext.reason}`,
    ...specFiles,
    '',
    '### Detected Instruction Files',
    ...instructionLines,
  ].join('\n')
}

interface SpecSearchCommand {
  q: string
  mode?: SearchMode
  featureId?: string
  fileType?: string
  limit?: number
}

function tokenizeCommandArgs(input: string): string[] {
  const matches = input.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  return matches.map((token) => {
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      return token.slice(1, -1)
    }
    return token
  })
}

function parseSpecSearchCommand(input: string): SpecSearchCommand | null {
  const match = input.match(/^\/(?:spec-search|specsearch)\b(.*)$/i)
  if (!match) return null

  const tokens = tokenizeCommandArgs(match[1]?.trim() ?? '')
  const queryTokens: string[] = []
  const parsed: SpecSearchCommand = { q: '' }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    if (token === '--mode' && tokens[i + 1]) {
      const candidate = tokens[++i]
      if (candidate === 'keyword' || candidate === 'semantic' || candidate === 'hybrid') {
        parsed.mode = candidate
      }
      continue
    }
    if (token.startsWith('--mode=')) {
      const candidate = token.slice('--mode='.length)
      if (candidate === 'keyword' || candidate === 'semantic' || candidate === 'hybrid') {
        parsed.mode = candidate
      }
      continue
    }
    if (token === '--feature' && tokens[i + 1]) {
      parsed.featureId = tokens[++i]
      continue
    }
    if (token.startsWith('--feature=')) {
      parsed.featureId = token.slice('--feature='.length)
      continue
    }
    if (token === '--file-type' && tokens[i + 1]) {
      parsed.fileType = tokens[++i]
      continue
    }
    if (token.startsWith('--file-type=')) {
      parsed.fileType = token.slice('--file-type='.length)
      continue
    }
    if (token === '--limit' && tokens[i + 1]) {
      const limit = Number.parseInt(tokens[++i], 10)
      if (Number.isFinite(limit) && limit > 0) {
        parsed.limit = limit
      }
      continue
    }
    if (token.startsWith('--limit=')) {
      const limit = Number.parseInt(token.slice('--limit='.length), 10)
      if (Number.isFinite(limit) && limit > 0) {
        parsed.limit = limit
      }
      continue
    }

    queryTokens.push(token)
  }

  parsed.q = queryTokens.join(' ').trim()
  return parsed
}

function truncateMarkdown(input: string, maxLen = 1400): string {
  const text = input.trim()
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}\n...`
}

function formatSpecSearchResponse(
  command: SpecSearchCommand,
  response: SearchResponse,
): string {
  const lines: string[] = []
  lines.push('## Spec Search Results')
  lines.push('')
  lines.push(`- Query: \`${command.q}\``)
  lines.push(`- Mode: \`${response.mode}\``)
  if (command.featureId) lines.push(`- Feature filter: \`${command.featureId}\``)
  if (command.fileType) lines.push(`- File type filter: \`${command.fileType}\``)
  lines.push(`- Hits: **${response.totalCount}** (${response.searchTime}ms)`)
  if (response.warning) {
    lines.push(`- Warning: ${response.warning}`)
  }

  if (response.results.length === 0) {
    lines.push('')
    lines.push('No matching indexed chunks were found.')
    return lines.join('\n')
  }

  lines.push('')
  for (const [index, result] of response.results.entries()) {
    const chunk = result.chunk
    lines.push(`### ${index + 1}. \`${chunk.sourcePath}:${chunk.lineStart}\``)
    lines.push(`- Match: \`${result.matchType}\` (score: ${result.score.toFixed(3)})`)
    if (chunk.headingHierarchy.length > 0) {
      lines.push(`- Headings: ${chunk.headingHierarchy.join(' > ')}`)
    }
    lines.push('')
    lines.push(truncateMarkdown(chunk.content))
    lines.push('')
  }

  return lines.join('\n')
}

async function handleDirectSpecSearch(command: SpecSearchCommand): Promise<void> {
  const conversationId = chatStore.activeConversationId ?? await chatStore.createConversation()
  const assistantMessage = chatStore.addAssistantMessage(conversationId)

  if (!command.q) {
    chatStore.updateMessage(
      assistantMessage.id,
      {
        content: [
          'Usage: `/spec-search <query> [--mode keyword|semantic|hybrid] [--feature <feature-id>] [--file-type <type>] [--limit <n>]`',
          '',
          'Examples:',
          '- `/spec-search FR-001`',
          '- `/spec-search "indexing indicator" --mode hybrid --feature 008-spec-search --limit 5`',
        ].join('\n'),
        status: 'complete',
      },
      conversationId,
    )
    return
  }

  const activeConv = chatStore.activeConversation
  const query = {
    q: command.q,
    mode: command.mode ?? 'hybrid',
    featureId: command.featureId ?? activeConv?.featureId,
    fileType: command.fileType,
    limit: String(command.limit ?? 5),
  }

  try {
    const response = await $fetch<SearchResponse>('/api/specs/search', { query })
    chatStore.updateMessage(
      assistantMessage.id,
      {
        content: formatSpecSearchResponse(
          {
            ...command,
            mode: query.mode as SearchMode,
            featureId: query.featureId,
          },
          response,
        ),
        status: 'complete',
      },
      conversationId,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run spec search'
    chatStore.updateMessage(
      assistantMessage.id,
      {
        content: `Spec search failed: ${message}`,
        status: 'error',
      },
      conversationId,
    )
  }
}

async function handleShowContext() {
  const activeConv = chatStore.activeConversation
  const query: Record<string, string> = {
    permissionMode: chatStore.permissionMode,
  }

  if (activeConv?.hasWorktree && activeConv.worktreePath) {
    query.cwd = activeConv.worktreePath
  } else if (activeConv?.cwd) {
    query.cwd = activeConv.cwd
  }
  if (activeConv?.featureId) {
    query.featureId = activeConv.featureId
  }
  if (activeConv?.providerId) {
    query.providerId = activeConv.providerId
  }
  if (activeConv?.providerModelKey) {
    query.providerModelKey = activeConv.providerModelKey
  }
  if (activeConv?.providerSessionId) {
    query.providerSessionId = activeConv.providerSessionId
  }

  const diag = await $fetch<ContextDiagnostics>('/api/chat/context', { query })
  const conversationId = chatStore.activeConversationId ?? await chatStore.createConversation()
  const message = chatStore.addAssistantMessage(conversationId)
  chatStore.updateMessage(
    message.id,
    {
      content: formatContextDiagnostics(diag),
      status: 'complete',
    },
    conversationId,
  )
}

async function sendMessage() {
  const message = inputText.value.trim()
  const attachments = [...pendingAttachments.value]
  if ((message.length === 0 && attachments.length === 0) || chatStore.isActiveConversationStreaming || isSending.value || props.disabled) return
  const hadActiveConversation = !!chatStore.activeConversationId

  // Check for /reset command
  if (message === '/reset' || message === '/reset-context') {
    await handleResetContext()
    return
  }
  if (message === '/context' || message === '/ctx') {
    await handleShowContext()
    inputText.value = ''
    clearPendingAttachments()
    resetTextareaHeight()
    return
  }
  const specSearchCommand = parseSpecSearchCommand(message)
  if (specSearchCommand) {
    await handleDirectSpecSearch(specSearchCommand)
    inputText.value = ''
    clearPendingAttachments()
    resetTextareaHeight()
    return
  }

  isSending.value = true
  inputText.value = ''
  clearPendingAttachments()
  resetTextareaHeight()

  try {
    // Add user message to store (creates conversation if needed — async for worktree)
    await chatStore.addUserMessageWithConversation(message, attachments)

    // Get conversation ID after potential creation
    const conversationId = chatStore.activeConversationId!
    if (!hadActiveConversation) {
      applyPendingConversationSelectionIfNeeded(conversationId)
    }

    // Add placeholder assistant message
    const assistantMessage = chatStore.addAssistantMessage()

    // Start session and mark conversation as streaming
    chatStore.startSession(`session-${Date.now()}`)
    chatStore.startConversationStreaming(conversationId)

    // Pass worktree cwd and featureId so the AI provider runs in the isolated directory with spec context
    const activeConv = chatStore.activeConversation
    const streamOpts: { cwd?: string; worktreeBranch?: string; featureId?: string; attachments?: ChatImageAttachment[] } = {}
    if (activeConv?.hasWorktree && activeConv.worktreePath) {
      streamOpts.cwd = activeConv.worktreePath
      streamOpts.worktreeBranch = activeConv.worktreeBranch
    }
    if (activeConv?.featureId) {
      streamOpts.featureId = activeConv.featureId
    }
    if (attachments.length > 0) {
      streamOpts.attachments = attachments
    }
    await streamMessage(message, assistantMessage.id, conversationId,
      Object.keys(streamOpts).length > 0 ? streamOpts : undefined)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to send message'
    chatStore.setSessionError(errorMessage)

    // Update the assistant message to show error
    const lastMsg = chatStore.lastMessage
    if (lastMsg && lastMsg.role === 'assistant') {
      chatStore.updateMessage(lastMsg.id, { status: 'error' })
    }

    // End streaming on error
    if (chatStore.activeConversationId) {
      chatStore.endSession(chatStore.activeConversationId)
      chatStore.endConversationStreaming(chatStore.activeConversationId)
    }
  } finally {
    isSending.value = false
  }
}

async function stopGeneration() {
  try {
    abort(chatStore.activeConversationId!)
  } catch {
    // Ignore stop errors
  }
}

// Reset AI context (clear provider session without deleting messages)
async function handleResetContext() {
  if (!chatStore.activeConversationId) return

  inputText.value = ''
  clearPendingAttachments()
  resetTextareaHeight()
  isSending.value = true

  try {
    await resetContext(chatStore.activeConversationId)
    
    // Add system notification message in chat
    const message = chatStore.addAssistantMessage(chatStore.activeConversationId)
    chatStore.updateMessage(
      message.id, 
      { 
        content: '✨ **Context cleared** — The AI conversation context has been reset. Starting fresh from here.',
        status: 'complete' 
      },
      chatStore.activeConversationId
    )
    
    // Show success toast
    const { useToast } = await import('~/composables/useToast')
    const toast = useToast()
    toast.success('AI context has been reset. The conversation will start fresh.')
  } catch (error) {
    console.error('Failed to reset context:', error)
    const { useToast } = await import('~/composables/useToast')
    const toast = useToast()
    toast.error('Failed to reset context. Please try again.')
  } finally {
    isSending.value = false
  }
}

// T056: Retry the last failed message
async function retryLastMessage() {
  // Find the last user message before the error
  const messages = chatStore.messages
  let lastUserMessage: { content: string; attachments: ChatImageAttachment[] } | null = null

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserMessage = {
        content: messages[i].content,
        attachments: messages[i].attachments ?? [],
      }
      break
    }
  }

  if (!lastUserMessage || !chatStore.activeConversationId) return

  const conversationId = chatStore.activeConversationId

  // Clear the error
  chatStore.clearError()

  isSending.value = true

  try {
    // Add new placeholder assistant message
    const assistantMessage = chatStore.addAssistantMessage()

    // Start session and mark conversation as streaming
    chatStore.startSession(`session-${Date.now()}`)
    chatStore.startConversationStreaming(conversationId)

    // Pass worktree cwd and featureId so the AI provider runs in the isolated directory with spec context
    const activeConv = chatStore.activeConversation
    const streamOpts: { cwd?: string; worktreeBranch?: string; featureId?: string; attachments?: ChatImageAttachment[] } = {}
    if (activeConv?.hasWorktree && activeConv.worktreePath) {
      streamOpts.cwd = activeConv.worktreePath
      streamOpts.worktreeBranch = activeConv.worktreeBranch
    }
    if (activeConv?.featureId) {
      streamOpts.featureId = activeConv.featureId
    }
    if (lastUserMessage.attachments.length > 0) {
      streamOpts.attachments = lastUserMessage.attachments
    }
    await streamMessage(lastUserMessage.content, assistantMessage.id, conversationId,
      Object.keys(streamOpts).length > 0 ? streamOpts : undefined)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to retry message'
    chatStore.setSessionError(errorMessage)

    const lastNewMsg = chatStore.lastMessage
    if (lastNewMsg && lastNewMsg.role === 'assistant') {
      chatStore.updateMessage(lastNewMsg.id, { status: 'error' })
    }

    // End streaming on error
    chatStore.endSession(conversationId)
    chatStore.endConversationStreaming(conversationId)
  } finally {
    isSending.value = false
  }
}

function handleKeyDown(e: KeyboardEvent) {
  // Enter to send (without shift for new line)
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

// Auto-resize textarea
function autoResize() {
  const textarea = inputRef.value
  if (textarea) {
    // If input is empty, reset to default height
    if (!inputText.value.trim()) {
      textarea.style.height = ''
      return
    }
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
  }
}

function scheduleAutoResize() {
  if (pendingResizeRaf !== null) return
  const schedule = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number
  pendingResizeRaf = schedule(() => {
    pendingResizeRaf = null
    autoResize()
  })
}

// Reset textarea height to default
function resetTextareaHeight() {
  const textarea = inputRef.value
  if (textarea) {
    textarea.style.height = ''  // Remove inline style completely to reset to CSS default
  }
}

// Focus the input
function focusInput() {
  nextTick(() => {
    inputRef.value?.focus()
  })
}

watch(inputText, scheduleAutoResize)

// Auto-focus when streaming ends (input becomes enabled)
watch(() => chatStore.isActiveConversationStreaming, (streaming, wasStreaming) => {
  if (wasStreaming && !streaming) {
    focusInput()
  }
})

// Auto-focus when active conversation changes (new conversation created or switched)
watch(() => chatStore.activeConversationId, () => {
  if (chatStore.activeConversationId) {
    pendingConversationSelection.value = null
  }
  clearPendingAttachments()
  focusInput()
})
</script>

<template>
  <div class="flex-shrink-0 flex-grow-0 border-t border-retro-border bg-retro-dark p-3">
    <!-- Model + Mode selector -->
    <div class="flex items-center gap-2 mb-2">
      <div class="relative min-w-0 flex-1 max-w-[154px] model-selector">
        <button
          :disabled="disabled || chatStore.isActiveConversationStreaming || hasPendingPermission || hasPendingPlanApproval || providersLoading || modelOptions.length === 0"
          class="flex items-center justify-between gap-1.5 w-full px-2 py-1 rounded border border-retro-border/50
                 hover:border-retro-border text-xs font-mono text-retro-muted transition-colors
                 disabled:opacity-60 disabled:cursor-not-allowed"
          @click="showModelMenu = !showModelMenu"
        >
          <span class="truncate text-left">{{ selectedModelLabel }}</span>
          <ChevronDownIcon class="w-3 h-3 flex-shrink-0" />
        </button>

        <div
          v-if="showModelMenu"
          class="absolute bottom-full left-0 mb-1 py-1 bg-retro-dark border border-retro-border rounded shadow-lg z-10 min-w-[220px] max-w-[280px]"
        >
          <div
            v-if="modelOptions.length === 0"
            class="px-3 py-1.5 text-xs font-mono text-retro-muted"
          >
            Loading models...
          </div>
          <div
            v-for="group in modelOptionGroups"
            :key="group.providerId"
            class="py-0.5"
          >
            <div class="px-3 py-1 text-[11px] font-mono uppercase tracking-wide text-retro-cyan/80 select-none">
              {{ group.providerName }}
            </div>
            <button
              v-for="option in group.options"
              :key="option.key"
              :disabled="!option.compatible"
              class="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-mono text-left
                     hover:bg-retro-panel transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :class="selectedModelKey === option.key ? 'bg-retro-panel text-retro-text' : 'text-retro-muted'"
              @click="selectModel(option)"
            >
              <span class="truncate">
                {{ option.modelLabel }}{{ option.compatible ? '' : ' (unsupported for current permission mode)' }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div class="relative mode-selector">
        <button
          class="flex items-center gap-1.5 px-2 py-1 rounded border border-retro-border/50
                 hover:border-retro-border text-xs font-mono transition-colors"
          :class="modeColors[chatStore.permissionMode]"
          @click="showModeMenu = !showModeMenu"
        >
          <component :is="modeIcons[chatStore.permissionMode]" class="w-4 h-4" />
          <span>{{ PERMISSION_MODE_LABELS[chatStore.permissionMode] }}</span>
          <ChevronDownIcon class="w-3 h-3" />
        </button>

        <!-- Dropdown menu -->
        <div
          v-if="showModeMenu"
          class="absolute bottom-full left-0 mb-1 py-1 bg-retro-dark border border-retro-border rounded shadow-lg z-10 min-w-[140px]"
        >
          <button
            v-for="mode in (['plan', 'ask', 'auto', 'bypass'] as PermissionMode[])"
            :key="mode"
            class="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-mono text-left
                   hover:bg-retro-panel transition-colors"
            :class="[
              modeColors[mode],
              chatStore.permissionMode === mode ? 'bg-retro-panel' : '',
            ]"
            @click="selectMode(mode)"
          >
            <component :is="modeIcons[mode]" class="w-4 h-4" />
            <span>{{ PERMISSION_MODE_LABELS[mode] }}</span>
          </button>
        </div>
      </div>

      <span class="text-xs font-mono text-retro-muted">
        {{ chatStore.permissionMode === 'plan' ? 'Plan only' :
           chatStore.permissionMode === 'ask' ? 'Ask before actions' :
           chatStore.permissionMode === 'auto' ? 'Auto approve' :
           'All permissions' }}
      </span>
    </div>

    <!-- Permission request UI -->
    <div v-if="hasPendingPermission" class="mb-3 p-3 bg-retro-yellow/10 border border-retro-yellow/50 rounded">
      <div class="flex items-center justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="text-xs font-mono text-retro-yellow font-bold mb-1">
            Permission Required
          </div>
          <div class="text-xs font-mono text-retro-text truncate">
            <span class="text-retro-cyan">{{ chatStore.pendingPermission?.tool }}</span>
            <span v-if="chatStore.pendingPermission?.filePath" class="text-retro-muted">
              - {{ chatStore.pendingPermission.filePath }}
            </span>
            <span v-else-if="chatStore.pendingPermission?.command" class="text-retro-muted">
              - {{ chatStore.pendingPermission.command }}
            </span>
          </div>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button
            class="px-3 py-1.5 text-xs font-mono rounded
                   bg-retro-green/20 text-retro-green border border-retro-green/50
                   hover:bg-retro-green/30 transition-colors"
            @click="allowPermission"
          >
            Allow
          </button>
          <button
            class="px-3 py-1.5 text-xs font-mono rounded
                   bg-retro-red/20 text-retro-red border border-retro-red/50
                   hover:bg-retro-red/30 transition-colors"
            @click="denyPermission"
          >
            Deny
          </button>
        </div>
      </div>
    </div>

    <!-- Plan approval UI (ExitPlanMode) -->
    <div v-if="hasPendingPlanApproval" class="mb-3 p-3 bg-retro-cyan/10 border border-retro-cyan/50 rounded">
      <div class="flex items-center justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="text-xs font-mono text-retro-cyan font-bold mb-1">
            Plan Ready for Review
          </div>
          <div class="text-xs font-mono text-retro-muted">
            Approve to switch to Auto mode and start implementation.
          </div>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button
            class="px-3 py-1.5 text-xs font-mono rounded
                   bg-retro-green/20 text-retro-green border border-retro-green/50
                   hover:bg-retro-green/30 transition-colors"
            @click="handleApprovePlan"
          >
            Approve &amp; Implement
          </button>
          <button
            class="px-3 py-1.5 text-xs font-mono rounded
                   bg-retro-red/20 text-retro-red border border-retro-red/50
                   hover:bg-retro-red/30 transition-colors"
            @click="handleRejectPlan"
          >
            Reject
          </button>
        </div>
      </div>
    </div>

    <div v-if="pendingAttachments.length > 0" class="mb-2 flex flex-wrap gap-2">
      <div
        v-for="attachment in pendingAttachments"
        :key="attachment.id"
        class="relative w-24 rounded border border-retro-border/70 bg-retro-black/80 p-1"
      >
        <img
          :src="attachment.dataUrl"
          :alt="attachment.name"
          class="h-16 w-full rounded object-cover"
        />
        <div class="mt-1 truncate text-[10px] font-mono text-retro-muted">
          {{ attachment.name }}
        </div>
        <div class="truncate text-[10px] font-mono text-retro-muted/80">
          {{ formatAttachmentSize(attachment.size) }}
        </div>
        <button
          class="absolute -right-2 -top-2 rounded-full border border-retro-border bg-retro-panel p-0.5 text-retro-red hover:bg-retro-red/20"
          type="button"
          @click="removeAttachment(attachment.id)"
        >
          <XMarkIcon class="h-3 w-3" />
        </button>
      </div>
    </div>

    <div class="flex gap-2 items-start">
      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        multiple
        class="hidden"
        @change="handleFilePick"
      >
      <button
        class="flex-shrink-0 h-10 w-10 inline-flex items-center justify-center p-0 rounded
               bg-retro-panel/70 text-retro-muted
               hover:text-retro-cyan hover:bg-retro-panel
               disabled:opacity-50 disabled:cursor-not-allowed
               transition-colors"
        type="button"
        title="Attach images"
        :disabled="disabled || chatStore.isActiveConversationStreaming || hasPendingPermission || hasPendingPlanApproval"
        @click="fileInputRef?.click()"
      >
        <PaperClipIcon class="w-5 h-5" />
      </button>

      <!-- Input -->
      <div class="flex-1 relative min-h-[40px]">
        <textarea
          ref="inputRef"
          v-model="inputText"
          :disabled="disabled || chatStore.isActiveConversationStreaming || hasPendingPermission || hasPendingPlanApproval"
          :placeholder="disabled
            ? 'This conversation is finalized (read-only)'
            : 'Type a message...'"
          rows="1"
          class="w-full h-full min-h-[40px] px-3 py-2 bg-retro-black border border-retro-border rounded
                 text-sm font-mono text-retro-text placeholder-retro-muted
                 focus:outline-none focus:border-retro-cyan
                 disabled:opacity-50 disabled:cursor-not-allowed
                 resize-none overflow-hidden"
          @keydown="handleKeyDown"
        />
      </div>

      <!-- Retry button (shows when last message errored) -->
      <button
        v-if="canRetry"
        class="flex-shrink-0 h-10 w-10 inline-flex items-center justify-center p-0 rounded
               bg-retro-yellow/20 text-retro-yellow
               hover:bg-retro-yellow/30
               transition-colors"
        title="Retry last message"
        @click="retryLastMessage"
      >
        <ArrowPathIcon class="w-5 h-5" />
      </button>

      <!-- Send/Stop button -->
      <button
        v-if="!canStop && !hasPendingPermission"
        :disabled="!canSend"
        class="flex-shrink-0 h-10 w-10 inline-flex items-center justify-center p-0 rounded
               bg-retro-cyan/20 text-retro-cyan
               hover:bg-retro-cyan/30
               disabled:opacity-50 disabled:cursor-not-allowed
               transition-colors"
        @click="sendMessage"
      >
        <PaperAirplaneIcon class="w-5 h-5" />
      </button>

      <button
        v-else-if="canStop"
        class="flex-shrink-0 h-10 w-10 inline-flex items-center justify-center p-0 rounded
               bg-retro-red/20 text-retro-red
               hover:bg-retro-red/30
               transition-colors"
        @click="stopGeneration"
      >
        <StopIcon class="w-5 h-5" />
      </button>
    </div>

    <!-- Hint text -->
    <div class="mt-1 text-xs font-mono text-retro-muted">
      Press Enter to send, Shift+Enter for new line. Slash commands: `/context`, `/reset`, `/spec-search`. You can attach up to 4 images (5 MB each).
    </div>
  </div>
</template>
