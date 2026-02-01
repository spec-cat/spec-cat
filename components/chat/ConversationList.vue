<script setup lang="ts">
/**
 * ConversationList Component (T043, T051, T052)
 * Displays list of all conversations with search/filter capability
 */
import { ref, computed, watch } from 'vue'
import { PlusIcon, MagnifyingGlassIcon, ExclamationTriangleIcon } from '@heroicons/vue/24/outline'
import { useChatStore } from '~/stores/chat'
import ConversationItem from './ConversationItem.vue'

const chatStore = useChatStore()
const toast = useToast()

// Search/filter state with 400ms debounce (T020, FR-010)
const searchQuery = ref('')
const debouncedQuery = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    debouncedQuery.value = val
  }, 400)
})

// Storage limit status (T022, FR-002)
const storageStatus = computed(() => chatStore.checkStorageLimits())

// Filtered conversations using debounced query (T020, FR-010)
const filteredConversations = computed(() => {
  const query = debouncedQuery.value.toLowerCase().trim()
  if (!query) {
    return chatStore.sortedConversations
  }

  return chatStore.sortedConversations.filter(conv => {
    // Search in title
    if (conv.title.toLowerCase().includes(query)) return true

    // Search in message content
    return conv.messages.some(msg =>
      msg.content.toLowerCase().includes(query)
    )
  })
})

// Direct reactive reference to current previewing conversation id to ensure template re-renders
const previewingId = computed(() => chatStore.previewingConversationId)

// Create new conversation and open panel (blocked at limit per FR-002)
async function handleCreate() {
  if (storageStatus.value.atLimit) return
  await chatStore.createConversation()
  chatStore.openPanel()
}

// Handle conversation selection
function handleSelect(id: string) {
  chatStore.selectConversation(id)
}

async function handleArchive(id: string) {
  const result = await chatStore.archiveConversation(id)
  if (!result.success) {
    toast.error(result.error || 'Failed to archive conversation')
    return
  }
  toast.success('Conversation archived')
}

// Handle rename
function handleRename(id: string, title: string) {
  chatStore.renameConversation(id, title)
}

</script>

<template>
  <div class="space-y-4">
    <!-- Header with title -->
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-mono text-retro-cyan">Conversations</h2>
    </div>

    <!-- New chat button (right-aligned) -->
    <div class="flex justify-end">
      <button
        @click="handleCreate"
        :disabled="storageStatus.atLimit"
        class="flex items-center gap-1 px-3 py-1.5 text-sm font-mono bg-retro-cyan/10 text-retro-cyan border border-retro-cyan/30 rounded hover:bg-retro-cyan/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <PlusIcon class="w-4 h-4" />
        New Chat
      </button>
    </div>

    <!-- Storage limit: blocked at 100 (T022, FR-002) -->
    <div
      v-if="storageStatus.atLimit"
      class="flex items-center gap-2 p-3 bg-retro-red/10 border border-retro-red/30 rounded text-sm"
    >
      <ExclamationTriangleIcon class="w-5 h-5 text-retro-red flex-shrink-0" />
      <p class="text-retro-red font-mono">
        Maximum 100 conversations reached. Archive a conversation to create a new one.
      </p>
    </div>
    <!-- Storage warning: near limit 80-99 (T022, FR-002) -->
    <div
      v-else-if="storageStatus.nearLimit"
      class="flex items-center gap-2 p-3 bg-retro-yellow/10 border border-retro-yellow/30 rounded text-sm"
    >
      <ExclamationTriangleIcon class="w-5 h-5 text-retro-yellow flex-shrink-0" />
      <p class="text-retro-yellow font-mono">
        {{ storageStatus.count }}/100 conversations stored
      </p>
    </div>

    <!-- Search input (T051) -->
    <div class="relative">
      <MagnifyingGlassIcon class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-retro-muted" />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search conversations..."
        class="w-full pl-10 pr-4 py-2 text-sm font-mono bg-retro-black border border-retro-border rounded focus:border-retro-cyan focus:outline-none focus:ring-1 focus:ring-retro-cyan text-retro-text placeholder-retro-muted"
      />
    </div>

    <!-- Conversation list -->
    <div v-if="chatStore.hasConversations" class="space-y-2">
      <template v-if="filteredConversations.length > 0">
        <ConversationItem
          v-for="conv in filteredConversations"
          :key="conv.id"
          :conversation="conv"
          :is-active="conv.id === chatStore.activeConversationId"
          :is-streaming="chatStore.isConversationStreaming(conv.id)"
          :is-previewing="previewingId === conv.id"
          @select="handleSelect(conv.id)"
          @archive="handleArchive(conv.id)"
          @rename="(title) => handleRename(conv.id, title)"
        />
      </template>

      <!-- No search results -->
      <div v-else class="text-center py-8 text-retro-muted">
        <p class="font-mono">No conversations match "{{ debouncedQuery }}"</p>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="text-center py-12 text-retro-muted">
      <p class="font-mono text-lg">No conversations yet</p>
      <p class="text-sm mt-2">Click "New Chat" to start a conversation with your AI provider</p>
    </div>
  </div>
</template>
