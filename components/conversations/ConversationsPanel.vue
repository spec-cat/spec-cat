<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  ArchiveBoxIcon,
  TrashIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/vue/24/outline'
import { useChatStore } from '~/stores/chat'
import { useAutoModeStore } from '~/stores/autoMode'
import ConversationItem from '~/components/chat/ConversationItem.vue'
import NewConversationModal from '~/components/conversations/NewConversationModal.vue'
import type { ArchivedConversation, Conversation } from '~/types/chat'
import type { AutoModeTask } from '~/types/autoMode'

const chatStore = useChatStore()
const autoModeStore = useAutoModeStore()
const toast = useToast()

const autoModeTaskMap = computed(() => {
  const map = new Map<string, AutoModeTask>()
  for (const task of autoModeStore.tasks) {
    map.set(task.featureId, task)
  }
  return map
})

const autoModeTaskMemoKeyMap = computed(() => {
  const map = new Map<string, string>()
  for (const task of autoModeStore.tasks) {
    map.set(task.featureId, `${task.state}|${task.currentStep || ''}|${task.error || ''}`)
  }
  return map
})

function getAutoModeTask(featureId?: string) {
  if (!featureId) return undefined
  return autoModeTaskMap.value.get(featureId)
}

function getAutoModeTaskMemoKey(featureId?: string) {
  if (!featureId) return ''
  return autoModeTaskMemoKeyMap.value.get(featureId) || ''
}

const searchQuery = ref('')
const debouncedQuery = ref('')
const showCreateModal = ref(false)
const creatingConversation = ref(false)
const showRestoreModal = ref(false)
const restoringConversation = ref(false)
const restoringArchiveId = ref<string | null>(null)
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (value) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    debouncedQuery.value = value
  }, 180)
}, { immediate: true })

onUnmounted(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }
})

type SearchCacheValue = { signature: string; text: string }
const activeSearchCache = new Map<string, SearchCacheValue>()
const archiveSearchCache = new Map<string, SearchCacheValue>()

watch(
  () => chatStore.sortedConversations.map(c => c.id),
  (ids) => {
    const allowed = new Set(ids)
    for (const key of activeSearchCache.keys()) {
      if (!allowed.has(key)) activeSearchCache.delete(key)
    }
  },
  { immediate: true },
)

watch(
  () => chatStore.sortedArchivedConversations.map(c => c.id),
  (ids) => {
    const allowed = new Set(ids)
    for (const key of archiveSearchCache.keys()) {
      if (!allowed.has(key)) archiveSearchCache.delete(key)
    }
  },
  { immediate: true },
)

function buildActiveSignature(conv: Conversation): string {
  const last = conv.messages[conv.messages.length - 1]
  return [
    conv.updatedAt,
    conv.title,
    conv.messages.length,
    last?.id || '',
    last?.content?.length || 0,
  ].join('|')
}

function buildArchiveSignature(conv: ArchivedConversation): string {
  const last = conv.messages[conv.messages.length - 1]
  return [
    conv.updatedAt,
    conv.archivedAt,
    conv.title,
    conv.messages.length,
    last?.id || '',
    last?.content?.length || 0,
  ].join('|')
}

function getActiveSearchText(conv: Conversation): string {
  const signature = buildActiveSignature(conv)
  const cached = activeSearchCache.get(conv.id)
  if (cached && cached.signature === signature) return cached.text

  const text = [
    conv.title,
    ...conv.messages.map(msg => msg.content || ''),
  ].join('\n').toLowerCase()

  activeSearchCache.set(conv.id, { signature, text })
  return text
}

function getArchiveSearchText(conv: ArchivedConversation): string {
  const signature = buildArchiveSignature(conv)
  const cached = archiveSearchCache.get(conv.id)
  if (cached && cached.signature === signature) return cached.text

  const text = [
    conv.title,
    ...conv.messages.map(msg => msg.content || ''),
  ].join('\n').toLowerCase()

  archiveSearchCache.set(conv.id, { signature, text })
  return text
}

const isArchiveMode = computed(() => chatStore.conversationViewMode === 'archive')

const filteredConversations = computed(() => {
  const source = chatStore.sortedConversations
  if (!debouncedQuery.value.trim()) {
    return source
  }

  const query = debouncedQuery.value.toLowerCase().trim()
  return source.filter(conv => getActiveSearchText(conv).includes(query))
})

const filteredArchivedConversations = computed(() => {
  const source = chatStore.sortedArchivedConversations
  if (!debouncedQuery.value.trim()) {
    return source
  }

  const query = debouncedQuery.value.toLowerCase().trim()
  return source.filter(conv => getArchiveSearchText(conv).includes(query))
})

const previewingId = computed(() => chatStore.previewingConversationId)

async function handleCreate() {
  if (chatStore.checkStorageLimits().atLimit) {
    toast.error('Delete or archive a conversation first (limit: 100).')
    return
  }
  showCreateModal.value = true
}

async function handleCreateConfirm(baseBranch: string) {
  creatingConversation.value = true
  try {
    const conversationId = await chatStore.createConversation({ baseBranch })
    if (!conversationId) {
      toast.error('Failed to create conversation')
      return
    }
    showCreateModal.value = false
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to create conversation')
  } finally {
    creatingConversation.value = false
  }
}

function handleSelect(id: string) {
  chatStore.selectConversation(id)
  chatStore.setConversationViewMode('active')
}

async function handleArchive(id: string) {
  const result = await chatStore.archiveConversation(id)
  if (!result.success) {
    toast.error(result.error || 'Failed to archive conversation')
    return
  }
  toast.success('Conversation archived')
}

async function handleRestore(archiveId: string) {
  restoringArchiveId.value = archiveId
  showRestoreModal.value = true
}

function handleRestoreClose() {
  showRestoreModal.value = false
  restoringArchiveId.value = null
}

async function handleRestoreConfirm(baseBranch: string) {
  if (!restoringArchiveId.value) return

  restoringConversation.value = true
  try {
    const result = await chatStore.restoreArchivedConversation(restoringArchiveId.value, baseBranch)
    if (!result.success) {
      toast.error(result.error || 'Failed to restore archived conversation')
      return
    }
    toast.success('Archived conversation restored')
    showRestoreModal.value = false
    restoringArchiveId.value = null
  } finally {
    restoringConversation.value = false
  }
}

async function handleDeleteArchive(archiveId: string) {
  const result = await chatStore.deleteArchivedConversation(archiveId)
  if (!result.success) {
    toast.error(result.error || 'Failed to delete archived conversation')
    return
  }
  toast.success('Archived conversation deleted')
}

function handleRename(id: string, title: string) {
  chatStore.renameConversation(id, title)
}

function formatArchivedAt(value: string) {
  return new Date(value).toLocaleString()
}

function getArchivePreview(messages: Array<{ content?: string }>) {
  if (!messages.length) return 'No messages'
  const last = messages[messages.length - 1]
  const content = (last.content || '').trim()
  if (!content) return 'No messages'
  return content.length > 80 ? `${content.slice(0, 80)}...` : content
}
</script>

<template>
  <div class="h-full flex flex-col bg-retro-black">
    <div class="flex-shrink-0 px-3 py-2 border-b border-retro-border space-y-2">
      <div class="flex items-center justify-between gap-2">
        <button
          @click="handleCreate"
          class="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-retro-cyan/10 text-retro-cyan border border-retro-cyan/30 rounded hover:bg-retro-cyan/20 transition-colors"
        >
          <PlusIcon class="w-3.5 h-3.5" />
          New
        </button>

        <div class="flex items-center gap-1">
          <button
            @click="chatStore.setConversationViewMode('active')"
            class="px-2 py-1 text-xs font-mono rounded border transition-colors"
            :class="isArchiveMode ? 'border-retro-border text-retro-muted hover:text-retro-cyan' : 'border-retro-cyan text-retro-cyan bg-retro-cyan/10'"
            title="Active conversations"
          >
            <span class="inline-flex items-center gap-1">
              <ChatBubbleLeftRightIcon class="w-3.5 h-3.5" />
              Active
            </span>
          </button>
          <button
            @click="chatStore.setConversationViewMode('archive')"
            class="px-2 py-1 text-xs font-mono rounded border transition-colors"
            :class="isArchiveMode ? 'border-retro-cyan text-retro-cyan bg-retro-cyan/10' : 'border-retro-border text-retro-muted hover:text-retro-cyan'"
            title="Archived conversations"
          >
            <span class="inline-flex items-center gap-1">
              <ArchiveBoxIcon class="w-3.5 h-3.5" />
              Archive
            </span>
          </button>
        </div>
      </div>

      <div class="relative">
        <MagnifyingGlassIcon class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-retro-muted" />
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="isArchiveMode ? 'Search archive...' : 'Search conversations...'"
          class="w-full pl-8 pr-3 py-1.5 text-xs font-mono bg-retro-black border border-retro-border rounded focus:border-retro-cyan focus:outline-none focus:ring-1 focus:ring-retro-cyan text-retro-text placeholder-retro-muted"
        />
      </div>
    </div>

    <div
      v-if="chatStore.isNearStorageLimit"
      class="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-retro-yellow/10 border-b border-retro-yellow/30 text-xs"
    >
      <ExclamationTriangleIcon class="w-4 h-4 text-retro-yellow flex-shrink-0" />
      <p class="text-retro-yellow font-mono">
        {{ chatStore.conversationCount }} active conversations. Limit is 100.
      </p>
    </div>

    <div class="flex-1 overflow-y-auto p-2">
      <template v-if="!isArchiveMode">
        <div v-if="chatStore.hasConversations" class="space-y-1">
          <template v-if="filteredConversations.length > 0">
            <div
              v-for="conv in filteredConversations"
              :key="conv.id"
              v-memo="[
                conv.id,
                conv.title,
                conv.updatedAt,
                conv.messages.length,
                conv.finalized,
                conv.id === chatStore.activeConversationId,
                chatStore.isConversationStreaming(conv.id),
                previewingId === conv.id,
                getAutoModeTaskMemoKey(conv.featureId),
              ]"
            >
              <ConversationItem
                :conversation="conv"
                :is-active="conv.id === chatStore.activeConversationId"
                :is-streaming="chatStore.isConversationStreaming(conv.id)"
                :is-previewing="previewingId === conv.id"
                :auto-mode-task="conv.autoMode ? getAutoModeTask(conv.featureId) : undefined"
                @select="handleSelect(conv.id)"
                @archive="handleArchive(conv.id)"
                @rename="(title) => handleRename(conv.id, title)"
              />
            </div>
          </template>

          <div v-else class="text-center py-6 text-retro-muted">
            <p class="font-mono text-xs">No results for "{{ searchQuery }}"</p>
          </div>
        </div>

        <div v-else class="text-center py-8 text-retro-muted">
          <p class="font-mono text-sm">No conversations</p>
          <p class="text-xs mt-1">Click "New" to start</p>
        </div>
      </template>

      <template v-else>
        <div v-if="chatStore.hasArchivedConversations" class="space-y-2">
          <template v-if="filteredArchivedConversations.length > 0">
            <div
              v-for="conv in filteredArchivedConversations"
              :key="conv.id"
              v-memo="[
                conv.id,
                conv.title,
                conv.updatedAt,
                conv.archivedAt,
                conv.messages.length,
              ]"
              @click="handleRestore(conv.id)"
              @keydown.enter.prevent="handleRestore(conv.id)"
              @keydown.space.prevent="handleRestore(conv.id)"
              class="w-full text-left p-3 rounded border border-retro-border hover:border-retro-cyan/50 hover:bg-retro-cyan/5 transition-colors"
              role="button"
              tabindex="0"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <h3 class="text-sm font-mono text-retro-text truncate">{{ conv.title }}</h3>
                  <p class="text-xs text-retro-muted mt-1 truncate">{{ getArchivePreview(conv.messages) }}</p>
                  <p class="text-xs text-retro-muted/70 mt-1">
                    Archived: {{ formatArchivedAt(conv.archivedAt) }}
                  </p>
                  <p class="text-xs text-retro-muted/70">
                    Updated: {{ formatArchivedAt(conv.updatedAt) }}
                  </p>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                  <button
                    @click.stop="handleRestore(conv.id)"
                    class="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono border border-retro-cyan/40 text-retro-cyan rounded hover:bg-retro-cyan/10 transition-colors"
                    title="Restore archived conversation"
                  >
                    <ArchiveBoxIcon class="w-3.5 h-3.5" />
                    Restore
                  </button>
                  <button
                    @click.stop="handleDeleteArchive(conv.id)"
                    class="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono border border-red-400/40 text-red-300 rounded hover:bg-red-500/10 transition-colors"
                    title="Delete archived conversation"
                  >
                    <TrashIcon class="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </template>

          <div v-else class="text-center py-6 text-retro-muted">
            <p class="font-mono text-xs">No archived results for "{{ searchQuery }}"</p>
          </div>
        </div>

        <div v-else class="text-center py-8 text-retro-muted">
          <p class="font-mono text-sm">No archived conversations</p>
          <p class="text-xs mt-1">Archived conversations will appear here</p>
        </div>
      </template>
    </div>

    <NewConversationModal
      :show="showCreateModal"
      :creating="creatingConversation"
      @close="showCreateModal = false"
      @create="handleCreateConfirm"
    />

    <NewConversationModal
      :show="showRestoreModal"
      :creating="restoringConversation"
      @close="handleRestoreClose"
      @create="handleRestoreConfirm"
    />
  </div>
</template>
