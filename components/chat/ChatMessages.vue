<script setup lang="ts">
import { useChatStore } from '~/stores/chat'
import { useAutoScroll } from '~/composables/useAutoScroll'
import { useVirtualMessageList } from '~/composables/useVirtualMessageList'
import ChatMessage from './ChatMessage.vue'
import { ExclamationCircleIcon } from '@heroicons/vue/24/outline'
import type { ChatMessage as ChatMessageType, ContentBlock } from '~/types/chat'

const chatStore = useChatStore()
const { containerRef, onScroll, maybeScrollToBottom, scrollToBottom, forceScrollToBottom } = useAutoScroll()

const {
  visibleItems,
  totalHeight,
  onVirtualScroll,
  setItemRef,
} = useVirtualMessageList({
  allMessages: computed(() => chatStore.messages),
  containerRef,
})

// Combined scroll handler
function handleScroll() {
  onScroll()
  onVirtualScroll()
}

// Check if currently streaming (per-conversation)
const isProcessing = computed(() => {
  return chatStore.isActiveConversationStreaming
})

// Get the last message status
const lastMessageStatus = computed(() => {
  const last = chatStore.lastMessage
  if (!last || last.role !== 'assistant') return null
  return last.status
})
const hasAppliedInitialBottom = ref(false)

function contentBlockRenderSignature(message: ChatMessageType): string {
  const blocks = message.contentBlocks
  if (!blocks || blocks.length === 0) return ''

  return blocks
    .map((block: ContentBlock) => {
      switch (block.type) {
        case 'tool_use':
          return `u:${block.id}:${block.status}:${block.inputSummary}`
        case 'tool_result':
          return `r:${block.id}:${block.toolUseId}:${block.isError ? 1 : 0}:${block.content.length}`
        case 'text':
          return `t:${block.id}:${block.text.length}`
        case 'thinking':
          return `k:${block.id}:${block.thinking.length}`
        case 'result_summary':
          return `s:${block.id}:${block.numTurns}:${block.durationMs}`
        case 'session_init':
          return `i:${block.id}:${block.model}:${block.tools.length}`
        default:
          return ''
      }
    })
    .join('|')
}

// ResizeObserver to handle container resize (e.g., when input area grows/shrinks)
const resizeObserverCleanup = ref<(() => void) | null>(null)

function setupResizeObserver() {
  if (resizeObserverCleanup.value) {
    resizeObserverCleanup.value()
    resizeObserverCleanup.value = null
  }

  if (!containerRef.value || typeof ResizeObserver === 'undefined') return

  const resizeObserver = new ResizeObserver(() => {
    // When container resizes, maintain scroll position at bottom if we were already there
    maybeScrollToBottom('instant')
  })

  resizeObserver.observe(containerRef.value)

  resizeObserverCleanup.value = () => {
    resizeObserver.disconnect()
  }
}

// On mount (panel just opened), scroll instantly — no animation
onMounted(() => {
  scrollToBottom('instant')
  setupResizeObserver()
})

onUnmounted(() => {
  if (resizeObserverCleanup.value) {
    resizeObserverCleanup.value()
  }
})

// Scroll instantly on conversation switch
watch(
  () => chatStore.activeConversationId,
  () => {
    hasAppliedInitialBottom.value = false
    scrollToBottom('instant')
  }
)

// Re-setup ResizeObserver when container ref changes
watch(containerRef, () => {
  setupResizeObserver()
})

// Ensure initial render after refresh lands at bottom once messages are actually present.
watch(
  () => [chatStore.activeConversationId, chatStore.messages.length] as const,
  ([convId, messageCount]) => {
    if (!convId || messageCount === 0 || hasAppliedInitialBottom.value) return
    hasAppliedInitialBottom.value = true
    forceScrollToBottom('instant')
  },
  { immediate: true }
)

// Auto-scroll when new messages arrive or content changes
watch(
  () => chatStore.messages.length,
  () => {
    maybeScrollToBottom('instant')
  }
)

// Also watch the last message content for streaming updates
watch(
  () => chatStore.lastMessage?.content,
  () => {
    maybeScrollToBottom('instant')
  }
)

// Auto-scroll when status changes
watch(
  [isProcessing, () => chatStore.lastError],
  () => {
    maybeScrollToBottom('instant')
  }
)

// Keep pinned to bottom while virtual row heights settle.
// This prevents landing in the middle after refresh when totalHeight grows post-measurement.
watch(
  totalHeight,
  () => {
    maybeScrollToBottom('instant')
  }
)
</script>

<template>
  <div
    ref="containerRef"
    class="flex-1 overflow-y-auto"
    @scroll="handleScroll"
  >
    <!-- Empty state -->
    <div
      v-if="!chatStore.hasMessages"
      class="flex flex-col items-center justify-center h-full p-8 text-center"
    >
      <div class="text-retro-muted text-sm font-mono mb-2">
        No messages yet
      </div>
      <div class="text-retro-muted text-xs font-mono">
        Send a message to start chatting
      </div>
    </div>

    <!-- Messages list -->
    <div v-else class="relative">
      <div class="relative" :style="{ height: `${totalHeight}px` }">
        <div
          v-for="item in visibleItems"
          :key="item.message.id"
          class="absolute left-0 right-0 border-b border-retro-border/30"
          :style="{ transform: `translateY(${item.top}px)` }"
        >
          <div :ref="(el) => setItemRef(item.message.id, el)">
            <ChatMessage
              v-memo="[
                item.message.id,
                item.message.status,
                item.message.content,
                item.message.contentBlocks?.length || 0,
                contentBlockRenderSignature(item.message),
                item.message.tools?.length || 0,
              ]"
              :message="item.message"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Status indicator at bottom -->
    <div class="sticky bottom-0">
      <!-- Processing indicator -->
      <div
        v-if="isProcessing && !chatStore.lastError"
        class="px-4 py-2 bg-retro-dark/90 border-t border-retro-border/50 backdrop-blur-sm"
      >
        <div class="flex items-center gap-2">
          <div class="flex gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-retro-cyan animate-bounce" style="animation-delay: 0ms" />
            <span class="w-1.5 h-1.5 rounded-full bg-retro-cyan animate-bounce" style="animation-delay: 150ms" />
            <span class="w-1.5 h-1.5 rounded-full bg-retro-cyan animate-bounce" style="animation-delay: 300ms" />
          </div>
          <span class="text-xs font-mono text-retro-muted">Processing...</span>
        </div>
      </div>

      <!-- Error banner -->
      <div
        v-if="chatStore.lastError"
        class="px-4 py-2.5 bg-retro-red/20 border-t border-retro-red/50"
      >
        <div class="flex items-start gap-2">
          <ExclamationCircleIcon class="w-4 h-4 text-retro-red flex-shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 mb-0.5">
              <p class="text-xs font-mono font-semibold text-retro-red">Error</p>
              <button
                class="text-xs font-mono text-retro-red/60 hover:text-retro-red underline"
                @click="chatStore.clearError()"
              >
                Dismiss
              </button>
            </div>
            <p class="text-xs font-mono text-retro-red/80 break-words whitespace-pre-wrap">
              {{ chatStore.lastError }}
            </p>
            <p class="text-xs font-mono text-retro-muted mt-1">
              Check browser console (F12) for more details
            </p>
          </div>
        </div>
      </div>

      <!-- Completed indicator (shows briefly after completion) -->
      <div
        v-else-if="lastMessageStatus === 'stopped'"
        class="px-4 py-2 bg-retro-dark/90 border-t border-retro-border/50"
      >
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-retro-muted" />
          <span class="text-xs font-mono text-retro-muted">Stopped</span>
        </div>
      </div>
    </div>
  </div>
</template>
