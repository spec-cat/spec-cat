<script setup lang="ts">
import { useChatStore } from '~/stores/chat'
import { useAutoScroll } from '~/composables/useAutoScroll'
import { useMessageWindow } from '~/composables/useMessageWindow'
import ChatMessage from './ChatMessage.vue'
import { ExclamationCircleIcon } from '@heroicons/vue/24/outline'

const chatStore = useChatStore()
const { containerRef, onScroll, maybeScrollToBottom, scrollToBottom } = useAutoScroll()

const {
  visibleMessages,
  hasOlderMessages,
  isLoadingMore,
  resetWindow,
  onScrollForLoadMore,
} = useMessageWindow({
  allMessages: computed(() => chatStore.messages),
  containerRef,
})

// Combined scroll handler
function handleScroll() {
  onScroll()
  onScrollForLoadMore()
}

// Skip smooth scroll on initial mount / conversation switch
let skipAnimation = true

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

// On mount (panel just opened), scroll instantly — no animation
onMounted(() => {
  skipAnimation = true
  scrollToBottom('instant')
})

// Scroll instantly on conversation switch
watch(
  () => chatStore.activeConversationId,
  () => {
    resetWindow()
    skipAnimation = true
    scrollToBottom('instant')
  }
)

// Auto-scroll when new messages arrive or content changes
watch(
  () => chatStore.messages.length,
  () => {
    if (skipAnimation) {
      skipAnimation = false
      scrollToBottom('instant')
      return
    }
    maybeScrollToBottom()
  }
)

// Also watch the last message content for streaming updates
watch(
  () => chatStore.lastMessage?.content,
  () => {
    maybeScrollToBottom()
  }
)

// Auto-scroll when status changes
watch(
  [isProcessing, () => chatStore.lastError],
  () => {
    maybeScrollToBottom()
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
    <div v-else class="divide-y divide-retro-border/30">
      <!-- Load more indicator -->
      <div
        v-if="isLoadingMore"
        class="flex justify-center py-3"
      >
        <div class="flex items-center gap-2">
          <div class="flex gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-retro-muted animate-bounce" style="animation-delay: 0ms" />
            <span class="w-1.5 h-1.5 rounded-full bg-retro-muted animate-bounce" style="animation-delay: 150ms" />
            <span class="w-1.5 h-1.5 rounded-full bg-retro-muted animate-bounce" style="animation-delay: 300ms" />
          </div>
          <span class="text-xs font-mono text-retro-muted">Loading older messages...</span>
        </div>
      </div>
      <div
        v-else-if="hasOlderMessages"
        class="flex justify-center py-2"
      >
        <span class="text-xs font-mono text-retro-muted/60">Scroll up for older messages</span>
      </div>

      <ChatMessage
        v-for="message in visibleMessages"
        :key="message.id"
        v-memo="[
          message.id,
          message.status,
          message.content,
          message.contentBlocks?.length || 0,
          message.tools?.length || 0,
        ]"
        :message="message"
      />
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
