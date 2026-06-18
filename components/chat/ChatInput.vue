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
  QueueListIcon,
} from '@heroicons/vue/24/outline'
import { PERMISSION_MODE_LABELS, type PermissionMode, type ChatImageAttachment } from '~/types/chat'
import type { SearchMode, SearchResponse } from '~/types/specSearch'
import { buildStreamOptsFromConversation } from '~/utils/chatStream'
import {
  buildContextQuery,
  buildSpecSearchQuery,
  classifyChatCommand,
  formatContextDiagnostics,
  formatSpecSearchResponse,
  type ContextDiagnostics,
  type SpecSearchCommand,
} from '~/utils/chatCommands'
import {
  MAX_IMAGE_ATTACHMENTS,
  MAX_IMAGE_SIZE_BYTES,
  createAttachmentId,
  formatAttachmentSize,
  readFileAsDataUrl,
  validateImageFile,
} from '~/utils/imageAttachments'
import {
  buildQueuedMessage,
  removeFromQueue as removeFromQueueUtil,
  type QueuedMessage,
} from '~/utils/messageQueue'

const props = defineProps<{
  disabled?: boolean
}>()

const chatStore = useChatStore()
const { sendMessage: streamMessage, sendPermissionResponse, approvePlan, rejectPlan, abort, resetContext } = useChatStream()

const inputText = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isSending = ref(false)
const showModeMenu = ref(false)
const pendingAttachments = ref<ChatImageAttachment[]>([])
let pendingResizeRaf: number | null = null

const messageQueues = ref<Record<string, QueuedMessage[]>>({})

const messageQueue = computed<QueuedMessage[]>(() => {
  const id = chatStore.activeConversationId
  if (!id) return []
  return messageQueues.value[id] ?? []
})

function setQueueForConversation(conversationId: string, queue: QueuedMessage[]) {
  if (queue.length === 0) {
    const { [conversationId]: _removed, ...rest } = messageQueues.value
    messageQueues.value = rest
  } else {
    messageQueues.value = { ...messageQueues.value, [conversationId]: queue }
  }
}

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
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
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

// Can submit input (send directly OR queue while streaming)
const canSubmit = computed(() => {
  return (inputText.value.trim().length > 0 || pendingAttachments.value.length > 0) &&
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
    const validation = validateImageFile(file)
    if (!validation.ok) {
      if (validation.reason === 'not-image') {
        toast.warning(`Skipped "${file.name}": only image files are supported.`)
      } else {
        toast.warning(`Skipped "${file.name}": max size is 5 MB.`)
      }
      continue
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      pendingAttachments.value.push({
        id: createAttachmentId(),
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
  const query = buildSpecSearchQuery(command, { featureId: activeConv?.featureId })

  try {
    const response = await $fetch<SearchResponse>('/api/specs/search', { query })
    chatStore.updateMessage(
      assistantMessage.id,
      {
        content: formatSpecSearchResponse(
          { ...command, mode: query.mode, featureId: query.featureId },
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
  const query = buildContextQuery(chatStore.activeConversation, chatStore.permissionMode)

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

function buildStreamOptionsForActiveConversation(attachments: ChatImageAttachment[] = []) {
  const base = buildStreamOptsFromConversation(chatStore.activeConversation, true) ?? {}
  if (attachments.length > 0) {
    return { ...base, attachments }
  }
  return Object.keys(base).length > 0 ? base : undefined
}

function startAssistantStreamingTurn(conversationId: string) {
  const assistantMessage = chatStore.addAssistantMessage(conversationId)
  chatStore.startSession(`session-${Date.now()}`, conversationId)
  chatStore.startConversationStreaming(conversationId)
  // Save immediately so the assistant message is persisted before streaming
  // starts — enables tryResumeStreaming to find it after a page reload
  chatStore.saveConversation(conversationId, true)
  return assistantMessage
}

function failAssistantStreamingTurn(conversationId: string, messageId: string, error: unknown, fallbackMessage: string) {
  const errorMessage = error instanceof Error ? error.message : fallbackMessage
  chatStore.setSessionError(errorMessage, conversationId)
  chatStore.updateMessage(messageId, { status: 'error' }, conversationId)
  chatStore.endSession(conversationId)
  chatStore.endConversationStreaming(conversationId)
}

async function sendMessage(overrideText?: string, overrideAttachments?: ChatImageAttachment[]) {
  const isFromQueue = overrideText !== undefined
  const message = (overrideText ?? inputText.value).trim()
  const attachments = overrideAttachments ?? [...pendingAttachments.value]
  if ((message.length === 0 && attachments.length === 0) || chatStore.isActiveConversationStreaming || isSending.value || props.disabled) return
  let conversationId: string | null = null
  let assistantMessageId: string | null = null

  const command = classifyChatCommand(message)
  if (command.kind !== 'none') {
    if (command.kind === 'reset') {
      await handleResetContext()
      return
    }
    if (command.kind === 'context') await handleShowContext()
    else if (command.kind === 'spec-search') await handleDirectSpecSearch(command.command)
    if (!isFromQueue) {
      inputText.value = ''
      clearPendingAttachments()
      resetTextareaHeight()
    }
    return
  }

  isSending.value = true
  if (!isFromQueue) {
    inputText.value = ''
    clearPendingAttachments()
    resetTextareaHeight()
  }

  try {
    // Add user message to store (creates conversation if needed — async for worktree)
    await chatStore.addUserMessageWithConversation(message, attachments)

    // Get conversation ID after potential creation
    conversationId = chatStore.activeConversationId
    if (!conversationId) {
      throw new Error('Failed to create or select a conversation')
    }
    const assistantMessage = startAssistantStreamingTurn(conversationId)
    assistantMessageId = assistantMessage.id

    await streamMessage(
      message,
      assistantMessage.id,
      conversationId,
      buildStreamOptionsForActiveConversation(attachments),
    )
  } catch (error) {
    if (conversationId && assistantMessageId) {
      failAssistantStreamingTurn(conversationId, assistantMessageId, error, 'Failed to send message')
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message'
      chatStore.setSessionError(errorMessage)
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

function handleSubmit() {
  if (chatStore.isActiveConversationStreaming) {
    queueMessage()
  } else {
    sendMessage()
  }
}

function queueMessage() {
  const conversationId = chatStore.activeConversationId
  if (!conversationId) return
  const queued = buildQueuedMessage({
    text: inputText.value,
    attachments: pendingAttachments.value,
  })
  if (!queued) return

  setQueueForConversation(conversationId, [...messageQueue.value, queued])
  inputText.value = ''
  clearPendingAttachments()
  resetTextareaHeight()
  focusInput()
}

function removeFromQueue(id: string) {
  const conversationId = chatStore.activeConversationId
  if (!conversationId) return
  setQueueForConversation(conversationId, removeFromQueueUtil(messageQueue.value, id))
}

async function processQueue() {
  const conversationId = chatStore.activeConversationId
  if (!conversationId) return
  const queue = messageQueues.value[conversationId] ?? []
  if (queue.length === 0) return
  if (chatStore.isActiveConversationStreaming || isSending.value) return
  // A permission request / plan approval pauses the provider but flips the
  // streaming flag off. Don't drain the queue into that pause — the queued
  // message would race the pending approval and target the wrong turn.
  if (chatStore.pendingPermission || chatStore.pendingPlanApproval) return

  const [next, ...rest] = queue
  setQueueForConversation(conversationId, rest)
  await sendMessage(next.text, next.attachments)
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
  let assistantMessageId: string | null = null

  try {
    const assistantMessage = startAssistantStreamingTurn(conversationId)
    assistantMessageId = assistantMessage.id

    await streamMessage(
      lastUserMessage.content,
      assistantMessage.id,
      conversationId,
      buildStreamOptionsForActiveConversation(lastUserMessage.attachments),
    )
  } catch (error) {
    if (assistantMessageId) {
      failAssistantStreamingTurn(conversationId, assistantMessageId, error, 'Failed to retry message')
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Failed to retry message'
      chatStore.setSessionError(errorMessage, conversationId)
    }
  } finally {
    isSending.value = false
  }
}

function handleKeyDown(e: KeyboardEvent) {
  // Enter to send or queue (without shift for new line)
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
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

// Auto-focus when streaming ends; process queued messages.
// Also re-run when a pending permission/plan approval clears, since those pause
// the turn without the streaming flag transitioning.
watch(
  () => [
    chatStore.isActiveConversationStreaming,
    chatStore.pendingPermission !== null,
    chatStore.pendingPlanApproval !== null,
  ] as const,
  ([streaming, hasPermission, hasPlan], prev) => {
    const wasPaused = prev ? (prev[0] || prev[1] || prev[2]) : false
    const isPaused = streaming || hasPermission || hasPlan
    if (wasPaused && !isPaused) {
      if (messageQueue.value.length > 0) {
        nextTick(() => processQueue())
      } else {
        focusInput()
      }
    }
  },
)

// Auto-focus when active conversation changes (new conversation created or switched)
watch(() => chatStore.activeConversationId, () => {
  clearPendingAttachments()
  focusInput()
  // Resume processing a persisted queue when switching back to a conversation
  // that has queued messages and is no longer streaming.
  if (!chatStore.isActiveConversationStreaming && messageQueue.value.length > 0) {
    nextTick(() => processQueue())
  }
})
</script>

<template>
  <div class="flex-shrink-0 flex-grow-0 border-t border-retro-border bg-retro-dark p-3">
    <!-- Mode selector -->
    <div class="flex flex-wrap items-center gap-2 mb-2">
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

      <span class="hidden text-xs font-mono text-retro-muted sm:inline">
        {{ chatStore.permissionMode === 'plan' ? 'Plan only' :
           chatStore.permissionMode === 'ask' ? 'Ask before actions' :
           chatStore.permissionMode === 'auto' ? 'Auto approve' :
           'All permissions' }}
      </span>
    </div>

    <!-- Permission request UI -->
    <div v-if="hasPendingPermission" class="mb-3 p-3 bg-retro-yellow/10 border border-retro-yellow/50 rounded">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <div class="flex flex-shrink-0 gap-2">
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
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex-1 min-w-0">
          <div class="text-xs font-mono text-retro-cyan font-bold mb-1">
            Plan Ready for Review
          </div>
          <div class="text-xs font-mono text-retro-muted">
            Approve to switch to Auto mode and start implementation.
          </div>
        </div>
        <div class="flex flex-shrink-0 gap-2">
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

    <!-- Message queue -->
    <div v-if="messageQueue.length > 0" class="mb-2">
      <div class="text-[10px] font-mono text-retro-muted mb-1 uppercase tracking-wide">
        Queued ({{ messageQueue.length }})
      </div>
      <div class="space-y-1">
        <div
          v-for="(item, index) in messageQueue"
          :key="item.id"
          class="flex items-center gap-2 px-2.5 py-1.5 bg-retro-panel/50 border border-retro-border/30 rounded"
        >
          <span class="text-[10px] font-mono text-retro-yellow flex-shrink-0">#{{ index + 1 }}</span>
          <span class="flex-1 text-xs font-mono text-retro-text truncate">{{ item.text }}</span>
          <span v-if="item.attachments.length > 0" class="text-[10px] font-mono text-retro-muted flex-shrink-0">
            +{{ item.attachments.length }} img
          </span>
          <button
            class="flex-shrink-0 p-0.5 text-retro-muted hover:text-retro-red transition-colors"
            title="Cancel queued message"
            @click="removeFromQueue(item.id)"
          >
            <XMarkIcon class="w-3.5 h-3.5" />
          </button>
        </div>
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
        :disabled="disabled || hasPendingPermission || hasPendingPlanApproval"
        @click="fileInputRef?.click()"
      >
        <PaperClipIcon class="w-5 h-5" />
      </button>

      <!-- Input -->
      <div class="flex-1 relative min-h-[40px]">
        <textarea
          ref="inputRef"
          v-model="inputText"
          :disabled="disabled || hasPendingPermission || hasPendingPlanApproval"
          :placeholder="disabled
            ? 'This conversation is finalized (read-only)'
            : chatStore.isActiveConversationStreaming
              ? 'Type to queue a message...'
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

      <!-- Send / Queue button -->
      <button
        v-if="!hasPendingPermission"
        :disabled="!canSubmit"
        :title="chatStore.isActiveConversationStreaming ? 'Queue message' : 'Send message'"
        class="flex-shrink-0 h-10 w-10 inline-flex items-center justify-center p-0 rounded
               disabled:opacity-50 disabled:cursor-not-allowed
               transition-colors"
        :class="chatStore.isActiveConversationStreaming
          ? 'bg-retro-yellow/20 text-retro-yellow hover:bg-retro-yellow/30'
          : 'bg-retro-cyan/20 text-retro-cyan hover:bg-retro-cyan/30'"
        @click="handleSubmit"
      >
        <QueueListIcon v-if="chatStore.isActiveConversationStreaming" class="w-5 h-5" />
        <PaperAirplaneIcon v-else class="w-5 h-5" />
      </button>

      <!-- Stop button (visible alongside queue button during streaming) -->
      <button
        v-if="canStop"
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
    <div class="mt-1 hidden text-xs font-mono text-retro-muted sm:block">
      Press Enter to send (or queue while AI is responding), Shift+Enter for new line. Slash commands: `/context`, `/reset`, `/new`, `/clear`, `/spec-search`.
    </div>
  </div>
</template>
