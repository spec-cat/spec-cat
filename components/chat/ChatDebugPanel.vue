<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useChatStore } from '~/stores/chat'
import { TrashIcon } from '@heroicons/vue/24/outline'

const chatStore = useChatStore()
const { debugEvents } = storeToRefs(chatStore)

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function directionClass(direction: 'in' | 'out' | 'system'): string {
  if (direction === 'in') return 'text-retro-cyan'
  if (direction === 'out') return 'text-retro-yellow'
  return 'text-retro-muted'
}
</script>

<template>
  <div class="h-64 border-t border-retro-border bg-retro-dark/50 flex flex-col">
    <div class="h-9 flex items-center justify-between px-3 border-b border-retro-border/40">
      <div class="text-[11px] font-mono text-retro-text">
        Debug Stream (CLI/Provider)
      </div>
      <button
        class="p-1 rounded hover:bg-retro-panel transition-colors"
        title="Clear debug events"
        @click="chatStore.clearDebugEvents()"
      >
        <TrashIcon class="w-3.5 h-3.5 text-retro-muted" />
      </button>
    </div>

    <div v-if="debugEvents.length === 0" class="flex-1 flex items-center justify-center text-xs font-mono text-retro-muted">
      No debug events yet
    </div>

    <div v-else class="flex-1 overflow-y-auto scrollbar-custom">
      <div
        v-for="eventItem in debugEvents"
        :key="eventItem.id"
        class="px-3 py-2 border-b border-retro-border/20"
      >
        <div class="flex items-center gap-2 text-[10px] font-mono">
          <span class="text-retro-muted">{{ formatTime(eventItem.timestamp) }}</span>
          <span :class="directionClass(eventItem.direction)">{{ eventItem.direction.toUpperCase() }}</span>
          <span class="text-retro-muted">{{ eventItem.channel }}</span>
          <span class="text-retro-green truncate">{{ eventItem.eventType }}</span>
        </div>
        <pre class="mt-1 text-[11px] font-mono text-retro-text whitespace-pre-wrap break-words">{{ eventItem.payload }}</pre>
      </div>
    </div>
  </div>
</template>
