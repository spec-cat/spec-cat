<script setup lang="ts">
import type { ChatMessage, ChatImageAttachment } from '~/types/chat'
import { hasContentBlocks } from '~/types/chat'
import { UserIcon, CpuChipIcon } from '@heroicons/vue/24/outline'

interface Props {
  message: ChatMessage
}

const props = defineProps<Props>()

const isUser = computed(() => props.message.role === 'user')
const isStreaming = computed(() => props.message.status === 'streaming')
const isError = computed(() => props.message.status === 'error')
const isStopped = computed(() => props.message.status === 'stopped')

/** Whether this message uses structured content blocks */
const useBlocks = computed(() => hasContentBlocks(props.message))

/** Blocks to render (skip tool_result — rendered inside ChatToolBlock) */
const renderableBlocks = computed(() => {
  if (!props.message.contentBlocks) return []
  return props.message.contentBlocks.filter(b => b.type !== 'tool_result')
})

const hasRenderableBlocks = computed(() => useBlocks.value && renderableBlocks.value.length > 0)
const hasFlatContent = computed(() => props.message.content.trim().length > 0)
const attachments = computed<ChatImageAttachment[]>(() => props.message.attachments ?? [])

const formatTime = (timestamp: string): string => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Simple markdown rendering for code blocks (fallback when no contentBlocks)
const formattedContent = computed(() => {
  let content = props.message.content

  // Escape HTML first
  content = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks (```...```)
  content = content.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    '<pre class="bg-retro-panel p-3 rounded my-2 overflow-x-auto"><code class="text-retro-cyan">$2</code></pre>'
  )

  // Inline code (`...`)
  content = content.replace(
    /`([^`]+)`/g,
    '<code class="bg-retro-panel px-1 rounded text-retro-cyan">$1</code>'
  )

  // Bold (**...**)
  content = content.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="text-retro-text font-bold">$1</strong>'
  )

  // Line breaks
  content = content.replace(/\n/g, '<br>')

  return content
})
</script>

<template>
  <div
    class="flex gap-3 p-3"
    :class="[
      isUser ? 'bg-retro-dark/50' : 'bg-transparent',
      isError ? 'border-l-2 border-retro-red' : '',
    ]"
  >
    <!-- Avatar -->
    <div
      class="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center"
      :class="isUser ? 'bg-retro-cyan/20' : 'bg-retro-green/20'"
    >
      <UserIcon v-if="isUser" class="w-4 h-4 text-retro-cyan" />
      <CpuChipIcon v-else class="w-4 h-4 text-retro-green" />
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <!-- Header -->
      <div class="flex items-center gap-2 mb-1">
        <span class="text-xs font-mono" :class="isUser ? 'text-retro-cyan' : 'text-retro-green'">
          {{ isUser ? 'You' : 'Assistant' }}
        </span>
        <span class="text-xs font-mono text-retro-muted">
          {{ formatTime(message.timestamp) }}
        </span>
        <span v-if="isStreaming" class="text-xs font-mono text-retro-yellow animate-pulse">
          typing...
        </span>
        <span v-if="isStopped" class="text-xs font-mono text-retro-muted">
          (stopped)
        </span>
        <span v-if="isError" class="text-xs font-mono text-retro-red">
          (error)
        </span>
      </div>

      <!-- Structured content blocks (rich UI with tool boxes) -->
      <template v-if="hasRenderableBlocks">
        <ChatContentBlock
          v-for="block in renderableBlocks"
          :key="block.id"
          :block="block"
          :all-blocks="message.contentBlocks!"
        />
      </template>

      <div
        v-if="isUser && attachments.length > 0"
        class="mb-2 flex flex-wrap gap-2"
      >
        <a
          v-for="attachment in attachments"
          :key="attachment.id"
          :href="attachment.dataUrl"
          :download="attachment.name"
          target="_blank"
          rel="noopener noreferrer"
          class="w-28 rounded border border-retro-border/70 bg-retro-black/70 p-1 hover:border-retro-cyan/60"
        >
          <img
            :src="attachment.dataUrl"
            :alt="attachment.name"
            class="h-20 w-full rounded object-cover"
          />
          <div class="mt-1 truncate text-[10px] font-mono text-retro-muted">
            {{ attachment.name }}
          </div>
        </a>
      </div>

      <!-- Fallback: flat content (legacy messages or non-renderable block sets) -->
      <div
        v-if="!hasRenderableBlocks && hasFlatContent"
        class="text-sm font-mono text-retro-text break-words"
        v-html="formattedContent"
      />

      <!-- Last-resort guard: avoid rendering an empty assistant row -->
      <div
        v-if="!hasRenderableBlocks && !hasFlatContent && !isUser && !isStreaming"
        class="text-xs font-mono text-retro-muted italic"
      >
        (no visible response content)
      </div>

      <!-- Streaming cursor -->
      <span
        v-if="isStreaming"
        class="inline-block w-2 h-4 bg-retro-cyan animate-pulse ml-0.5"
      />
    </div>
  </div>
</template>
