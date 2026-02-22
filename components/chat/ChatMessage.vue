<script setup lang="ts">
import type { ChatMessage, ChatImageAttachment, ContentBlock, TextBlock, ToolResultBlock } from '~/types/chat'
import { hasContentBlocks } from '~/types/chat'
import { UserIcon, CpuChipIcon } from '@heroicons/vue/24/outline'
import { useMarkdown } from '~/composables/useMarkdown'

interface Props {
  message: ChatMessage
}

const props = defineProps<Props>()
const { renderMarkdown } = useMarkdown()

const isUser = computed(() => props.message.role === 'user')
const isStreaming = computed(() => props.message.status === 'streaming')
const isError = computed(() => props.message.status === 'error')
const isStopped = computed(() => props.message.status === 'stopped')

/** Whether this message uses structured content blocks */
const useBlocks = computed(() => hasContentBlocks(props.message))

const toolResultsByUseId = computed(() => {
  const map = new Map<string, ToolResultBlock>()
  for (const block of props.message.contentBlocks ?? []) {
    if (block.type === 'tool_result') {
      map.set(block.toolUseId, block)
    }
  }
  return map
})

/** Blocks to render (skip tool_result — rendered inside ChatToolBlock) */
const renderableBlocks = computed(() => {
  if (!props.message.contentBlocks) return []

  const filtered = props.message.contentBlocks.filter(b => b.type !== 'tool_result')
  const merged: ContentBlock[] = []

  for (const block of filtered) {
    const prev = merged.length > 0 ? merged[merged.length - 1] : null
    if (prev?.type === 'text' && block.type === 'text') {
      const prevText = (prev as TextBlock).text || ''
      const nextText = block.text || ''
      ;(prev as TextBlock).text = `${prevText}${nextText}`
      continue
    }
    merged.push({ ...block })
  }

  return merged
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

// Markdown rendering for fallback flat content
const formattedContent = computed(() => {
  return renderMarkdown(props.message.content)
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
          :tool-results-by-use-id="toolResultsByUseId"
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
        class="text-sm font-mono text-retro-text break-words chat-markdown"
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
