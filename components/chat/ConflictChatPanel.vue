<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useChatStore } from '~/stores/chat'
import { useSettingsStore } from '~/stores/settings'
import { SparklesIcon, StopCircleIcon } from '@heroicons/vue/24/outline'
import type { ConflictChatMessage } from '~/types/chat'

const chatStore = useChatStore()
const settingsStore = useSettingsStore()

const guidanceInput = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

const messages = computed((): readonly ConflictChatMessage[] => {
  return chatStore.conflictState?.chatMessages ?? []
})

const isResolving = computed(() => {
  return chatStore.conflictState?.lifecycleState === 'resolving'
})

const allResolved = computed(() => {
  if (!chatStore.conflictState) return false
  const total = chatStore.conflictState.files.length
  const resolved = chatStore.conflictState.resolvedFiles.size
  return total > 0 && resolved >= total
})

const unresolvedCount = computed(() => {
  if (!chatStore.conflictState) return 0
  return chatStore.conflictState.files.length - chatStore.conflictState.resolvedFiles.size
})

const modelLabel = computed(() => {
  return `${settingsStore.providerId}/${settingsStore.providerModelKey}`
})

// Auto-scroll to bottom when new messages arrive
watch(() => messages.value.length, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
})

function handleResolveAll() {
  if (!chatStore.conflictState || isResolving.value) return
  // Store guidance in conflict state before triggering
  chatStore.setConflictUserGuidance(guidanceInput.value.trim())
  chatStore.aiResolveAllConflicts()
}

function handleStop() {
  chatStore.cancelConflictResolution()
}

function messageClass(msg: ConflictChatMessage): string {
  switch (msg.type) {
    case 'success': return 'text-retro-green'
    case 'error': return 'text-retro-red'
    case 'progress': return 'text-retro-cyan'
    case 'summary': return 'text-retro-yellow'
    default: return 'text-retro-muted'
  }
}

function messageIcon(msg: ConflictChatMessage): string {
  switch (msg.type) {
    case 'success': return '\u2713'
    case 'error': return '\u2717'
    case 'progress': return '\u25B6'
    case 'summary': return '\u2500'
    default: return '\u25CF'
  }
}
</script>

<template>
  <div class="flex flex-col h-full border-l border-retro-border bg-retro-dark">
    <!-- Panel header -->
    <div class="flex-shrink-0 px-3 py-2 border-b border-retro-border">
      <div class="flex items-center gap-2">
        <SparklesIcon class="w-4 h-4 text-retro-orange" />
        <span class="text-xs font-mono text-retro-text font-semibold">AI Conflict Resolution</span>
      </div>
      <div class="text-[10px] font-mono text-retro-muted mt-1">
        Model: {{ modelLabel }}
      </div>
    </div>

    <!-- Messages area -->
    <div
      ref="messagesContainer"
      class="flex-1 overflow-y-auto px-3 py-2 space-y-2"
    >
      <div v-if="messages.length === 0" class="text-xs font-mono text-retro-muted text-center py-8">
        Enter optional guidance below and click resolve to start AI conflict resolution.
      </div>
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="text-xs font-mono leading-relaxed"
        :class="msg.role === 'user' ? 'text-retro-text' : messageClass(msg)"
      >
        <template v-if="msg.role === 'user'">
          <div class="bg-retro-panel/50 rounded px-2 py-1.5 border border-retro-border">
            <span class="text-retro-muted text-[10px]">Guidance:</span>
            <div class="mt-0.5">{{ msg.content }}</div>
          </div>
        </template>
        <template v-else>
          <span class="inline-block w-3 text-center opacity-70">{{ messageIcon(msg) }}</span>
          {{ msg.content }}
        </template>
      </div>

      <!-- Resolving indicator -->
      <div v-if="isResolving" class="flex items-center gap-2 text-xs font-mono text-retro-cyan">
        <span class="animate-pulse">&#9679;</span>
        Processing...
      </div>
    </div>

    <!-- Bottom: guidance input + resolve/stop buttons -->
    <div class="flex-shrink-0 border-t border-retro-border p-3 space-y-2">
      <textarea
        v-model="guidanceInput"
        :disabled="isResolving"
        placeholder="Optional: Add guidance for AI resolution (e.g., &quot;prefer feature branch API changes&quot;, &quot;keep both import sets&quot;)..."
        class="w-full h-16 px-2 py-1.5 text-xs font-mono bg-retro-black text-retro-text border border-retro-border rounded resize-none focus:outline-none focus:border-retro-cyan/50 placeholder:text-retro-muted/50 disabled:opacity-50"
        spellcheck="false"
      />
      <!-- Resolve button (shown when not resolving) -->
      <button
        v-if="!isResolving"
        type="button"
        :disabled="allResolved || unresolvedCount === 0"
        class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-mono rounded border transition-colors
          bg-retro-orange/10 border-retro-orange/50 text-retro-orange
          hover:bg-retro-orange/20 disabled:opacity-40 disabled:cursor-not-allowed"
        @click="handleResolveAll"
      >
        <SparklesIcon class="w-4 h-4" />
        <span v-if="allResolved">All Conflicts Resolved</span>
        <span v-else>Resolve Conflicts Automatically ({{ unresolvedCount }})</span>
      </button>
      <!-- Stop button (shown during resolving) -->
      <button
        v-else
        type="button"
        class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-mono rounded border transition-colors
          bg-retro-red/10 border-retro-red/50 text-retro-red
          hover:bg-retro-red/20"
        @click="handleStop"
      >
        <StopCircleIcon class="w-4 h-4" />
        Stop Resolution
      </button>
    </div>
  </div>
</template>
