# Quickstart: Conversation Management

**Feature**: 009-conversation-management
**Date**: 2026-02-08
**Dependency**: 007-ai-provider-chat (core chat infrastructure)

## Overview

This guide covers implementing conversation list management: CRUD operations, localStorage persistence, search/filter, inline rename, delete confirmation, and streaming status badges. This feature was split from 007-ai-provider-chat and focuses on the conversation sidebar experience.

---

## Prerequisites

- [x] 007-ai-provider-chat fully implemented (chat store, types, streaming)
- [x] Pinia store (`stores/chat.ts`) with basic conversation state
- [x] Types (`types/chat.ts`) with Conversation and ChatMessage interfaces

---

## Implementation Order

### Phase 1: Storage Foundation

```
1. utils/conversationStorage.ts   → localStorage load/save/clear/size utilities
2. types/chat.ts                  → Conversation type, ID/title generators, type guards, constants
```

### Phase 2: Store Operations

```
3. stores/chat.ts                 → loadConversations(), saveAllConversations()
4. stores/chat.ts                 → createConversation(), selectConversation()
5. stores/chat.ts                 → deleteConversation(), renameConversation()
6. stores/chat.ts                 → saveConversation() with debounced auto-save (400ms)
7. stores/chat.ts                 → updateConversationTitleIfNeeded(), sortConversations()
8. stores/chat.ts                 → checkStorageLimits() — hard limit at 100
```

### Phase 3: UI Components

```
9.  components/chat/ConversationItem.vue   → Single conversation row with metadata
10. components/chat/ConversationList.vue   → List with search, create, manage
11. components/chat/DeleteConfirmModal.vue  → Confirmation dialog
```

### Phase 4: Integration

```
12. ConversationItem.vue          → Inline rename (Enter/Escape/blur)
13. ConversationItem.vue          → Streaming status badge (animated dot)
14. ConversationList.vue          → Search/filter with 400ms debounce
15. ConversationList.vue          → Storage limit warning display
```

---

## Key Code Snippets

### 1. Storage Utility

```typescript
// utils/conversationStorage.ts
import type { Conversation, StoredConversations } from '~/types/chat'
import { STORAGE_KEY_CONVERSATIONS, isValidConversation } from '~/types/chat'

const STORAGE_VERSION = 1

export function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONVERSATIONS)
    if (!raw) return []
    const data = JSON.parse(raw) as StoredConversations
    // Discard corrupted entries, keep valid ones
    return data.conversations.filter(isValidConversation)
  } catch {
    console.error('Failed to load conversations')
    return []
  }
}

export function saveConversations(conversations: Conversation[]): void {
  if (typeof window === 'undefined') return
  try {
    const data: StoredConversations = { version: STORAGE_VERSION, conversations }
    localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(data))
  } catch (e) {
    console.error('Failed to save conversations:', e)
  }
}
```

### 2. Store — Conversation CRUD

```typescript
// stores/chat.ts — conversation management actions

function loadConversations() {
  const loaded = conversationStorage.loadConversations()
  conversations.value = loaded
  sortConversations()
}

function createConversation(options?: { featureId?: string }): string {
  const limits = checkStorageLimits()
  if (limits.atLimit) {
    // Block creation — user must delete first
    return ''
  }

  const id = generateConversationId()
  const conv: Conversation = {
    id,
    title: 'New Conversation',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cwd: process.cwd(),
    ...(options?.featureId && { featureId: options.featureId })
  }
  conversations.value.unshift(conv)
  activeConversationId.value = id
  saveAllConversations()
  return id
}

function selectConversation(id: string) {
  const conv = conversations.value.find(c => c.id === id)
  if (!conv) return
  activeConversationId.value = id
}

function deleteConversation(id: string) {
  conversations.value = conversations.value.filter(c => c.id !== id)
  if (activeConversationId.value === id) {
    activeConversationId.value = null
  }
  saveAllConversations()
}

function renameConversation(id: string, title: string) {
  const conv = conversations.value.find(c => c.id === id)
  if (conv) {
    conv.title = title.slice(0, 100)
    conv.updatedAt = new Date().toISOString()
    saveAllConversations()
  }
}
```

### 3. Store — Auto-Save (Debounced)

```typescript
// stores/chat.ts — debounced save

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

function saveConversation(id: string, immediate = false) {
  if (immediate) {
    doSave(id)
    return
  }

  // Clear existing timer for this conversation
  const existing = saveTimers.get(id)
  if (existing) clearTimeout(existing)

  // Debounce at 400ms
  saveTimers.set(id, setTimeout(() => {
    doSave(id)
    saveTimers.delete(id)
  }, 400))
}

function doSave(id: string) {
  const conv = conversations.value.find(c => c.id === id)
  if (conv) {
    conv.updatedAt = new Date().toISOString()
    saveAllConversations()
  }
}
```

### 4. Store — Title Auto-Generation

```typescript
// stores/chat.ts

function updateConversationTitleIfNeeded() {
  const conv = activeConversation.value
  if (!conv) return
  if (conv.title !== 'New Conversation') return  // Already has custom title

  const firstUserMsg = conv.messages.find(m => m.role === 'user')
  if (firstUserMsg) {
    conv.title = generateConversationTitle(firstUserMsg.content)
    saveConversation(conv.id, true)
  }
}
```

### 5. Store — Storage Limits

```typescript
// stores/chat.ts

function checkStorageLimits(): { atLimit: boolean; nearLimit: boolean; count: number } {
  const count = conversations.value.length
  return {
    atLimit: count >= MAX_CONVERSATIONS,
    nearLimit: count >= WARN_CONVERSATIONS_THRESHOLD,
    count
  }
}
```

### 6. ConversationItem Component

```vue
<!-- components/chat/ConversationItem.vue -->
<script setup lang="ts">
import { PencilIcon, TrashIcon } from '@heroicons/vue/24/outline'
import type { Conversation } from '~/types/chat'

const props = defineProps<{
  conversation: Conversation
  isActive: boolean
  isStreaming: boolean
}>()

const emit = defineEmits<{
  select: []
  delete: []
  rename: [title: string]
}>()

const isEditing = ref(false)
const editTitle = ref('')

function startEdit() {
  editTitle.value = props.conversation.title
  isEditing.value = true
}

function saveEdit() {
  if (editTitle.value.trim()) {
    emit('rename', editTitle.value.trim())
  }
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
}

const lastMessagePreview = computed(() => {
  const msgs = props.conversation.messages
  if (!msgs.length) return 'No messages'
  const last = msgs[msgs.length - 1]
  const preview = last.content.slice(0, 60)
  return preview.length < last.content.length ? preview + '...' : preview
})

const formattedTimestamp = computed(() => {
  const date = new Date(props.conversation.updatedAt)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString()
})
</script>

<template>
  <div
    class="p-3 rounded border cursor-pointer transition-colors"
    :class="[
      isActive
        ? 'border-retro-cyan bg-retro-cyan/10'
        : 'border-retro-border hover:border-retro-cyan/50'
    ]"
    @click="emit('select')"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1 min-w-0">
        <!-- Inline edit mode -->
        <div v-if="isEditing" @click.stop>
          <input
            v-model="editTitle"
            @keyup.enter="saveEdit"
            @keyup.escape="cancelEdit"
            @blur="saveEdit"
            class="w-full px-2 py-1 text-sm font-mono bg-retro-black border border-retro-cyan rounded text-retro-text"
            autofocus
          />
        </div>
        <!-- Display mode -->
        <div v-else class="flex items-center gap-2">
          <h3 class="text-sm font-mono text-retro-text truncate">{{ conversation.title }}</h3>
          <!-- FR-011: Streaming badge -->
          <span
            v-if="isStreaming"
            class="inline-flex items-center gap-1 text-xs text-retro-cyan"
          >
            <span class="w-2 h-2 rounded-full bg-retro-cyan animate-pulse" />
          </span>
        </div>
        <p class="text-xs text-retro-muted mt-1 truncate">{{ lastMessagePreview }}</p>
        <p class="text-xs text-retro-muted/60 mt-1">{{ formattedTimestamp }}</p>
      </div>
      <!-- Action buttons -->
      <div class="flex gap-1" @click.stop>
        <button @click="startEdit" class="p-1 hover:bg-retro-panel rounded">
          <PencilIcon class="w-4 h-4 text-retro-muted" />
        </button>
        <button @click="emit('delete')" class="p-1 hover:bg-retro-red/20 rounded">
          <TrashIcon class="w-4 h-4 text-retro-red" />
        </button>
      </div>
    </div>
  </div>
</template>
```

### 7. ConversationList Component

```vue
<!-- components/chat/ConversationList.vue -->
<script setup lang="ts">
import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/vue/24/outline'
import { useChatStore } from '~/stores/chat'
import ConversationItem from './ConversationItem.vue'
import DeleteConfirmModal from './DeleteConfirmModal.vue'

const chatStore = useChatStore()

const searchQuery = ref('')
const showDeleteModal = ref(false)
const deleteTargetId = ref<string | null>(null)

// Debounced search (400ms)
let searchTimer: ReturnType<typeof setTimeout> | null = null
const debouncedQuery = ref('')

watch(searchQuery, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    debouncedQuery.value = val
  }, 400)
})

const filteredConversations = computed(() => {
  const query = debouncedQuery.value.toLowerCase().trim()
  if (!query) return chatStore.sortedConversations

  return chatStore.sortedConversations.filter(conv => {
    // Search title
    if (conv.title.toLowerCase().includes(query)) return true
    // Search message content
    return conv.messages.some(m =>
      m.content.toLowerCase().includes(query)
    )
  })
})

const storageStatus = computed(() => chatStore.checkStorageLimits())

function handleCreate() {
  if (storageStatus.value.atLimit) return
  chatStore.createConversation()
}

function handleDeleteRequest(id: string) {
  deleteTargetId.value = id
  showDeleteModal.value = true
}

function handleDeleteConfirm() {
  if (deleteTargetId.value) {
    chatStore.deleteConversation(deleteTargetId.value)
  }
  showDeleteModal.value = false
  deleteTargetId.value = null
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Search -->
    <div class="px-4 py-2">
      <div class="relative">
        <MagnifyingGlassIcon class="absolute left-2 top-2 w-4 h-4 text-retro-muted" />
        <input
          v-model="searchQuery"
          placeholder="Search conversations..."
          class="w-full pl-8 pr-3 py-1.5 text-sm font-mono bg-retro-black border border-retro-border rounded text-retro-text placeholder-retro-muted"
        />
      </div>
    </div>

    <!-- Storage warning -->
    <div v-if="storageStatus.atLimit" class="px-4 py-2">
      <div class="text-xs text-retro-red font-mono bg-retro-red/10 px-3 py-2 rounded border border-retro-red/30">
        Maximum 100 conversations reached. Delete a conversation to create a new one.
      </div>
    </div>
    <div v-else-if="storageStatus.nearLimit" class="px-4 py-2">
      <div class="text-xs text-retro-yellow font-mono bg-retro-yellow/10 px-3 py-2 rounded border border-retro-yellow/30">
        {{ storageStatus.count }}/100 conversations stored
      </div>
    </div>

    <!-- New Chat button -->
    <div class="px-4 py-2">
      <button
        @click="handleCreate"
        :disabled="storageStatus.atLimit"
        class="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-mono
               bg-retro-cyan/10 text-retro-cyan border border-retro-cyan/30 rounded
               hover:bg-retro-cyan/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <PlusIcon class="w-4 h-4" />
        New Chat
      </button>
    </div>

    <!-- Conversation list -->
    <div class="flex-1 overflow-y-auto px-4 space-y-2">
      <ConversationItem
        v-for="conv in filteredConversations"
        :key="conv.id"
        :conversation="conv"
        :is-active="conv.id === chatStore.activeConversationId"
        :is-streaming="chatStore.streamingConversations.has(conv.id)"
        @select="chatStore.selectConversation(conv.id)"
        @delete="handleDeleteRequest(conv.id)"
        @rename="(title) => chatStore.renameConversation(conv.id, title)"
      />

      <div v-if="!filteredConversations.length" class="text-center py-8 text-retro-muted">
        <p class="font-mono text-sm">
          {{ searchQuery ? 'No matching conversations' : 'No conversations yet' }}
        </p>
      </div>
    </div>

    <!-- Delete confirmation modal -->
    <DeleteConfirmModal
      :show="showDeleteModal"
      :title="conversations.find(c => c.id === deleteTargetId)?.title"
      @confirm="handleDeleteConfirm"
      @cancel="showDeleteModal = false"
    />
  </div>
</template>
```

### 8. DeleteConfirmModal Component

```vue
<!-- components/chat/DeleteConfirmModal.vue -->
<script setup lang="ts">
const props = defineProps<{
  show: boolean
  title?: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        @click.self="emit('cancel')"
      >
        <div class="bg-retro-dark border border-retro-border rounded-lg p-6 max-w-sm mx-4">
          <h3 class="text-lg font-mono text-retro-text mb-2">Delete Conversation?</h3>
          <p class="text-sm text-retro-muted mb-1">
            "{{ title || 'Untitled' }}"
          </p>
          <p class="text-xs text-retro-red mb-4">This action cannot be undone.</p>
          <div class="flex gap-3 justify-end">
            <button
              @click="emit('cancel')"
              class="px-4 py-2 text-sm font-mono text-retro-muted border border-retro-border rounded hover:bg-retro-panel"
            >
              Cancel
            </button>
            <button
              @click="emit('confirm')"
              class="px-4 py-2 text-sm font-mono text-retro-red bg-retro-red/10 border border-retro-red/30 rounded hover:bg-retro-red/20"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
```

---

## Testing Checklist

### Manual Tests — Conversation Management

- [ ] Conversation list displays all conversations sorted by newest created first
- [ ] Click "New Chat" creates a new conversation and opens chat panel
- [ ] Click existing conversation loads it in chat panel
- [ ] Send a message → auto-generated title appears (first 50 chars)
- [ ] Rename conversation inline (Enter to save, Escape to cancel, blur to save)
- [ ] Delete conversation → confirmation modal → remove from list
- [ ] Delete active conversation → clears chat panel
- [ ] Conversations persist after page refresh
- [ ] Search filters by title and message content (400ms debounce)
- [ ] Streaming badge (animated dot) shows on active streaming conversations

### Edge Cases

- [ ] Create conversation at 100 limit → blocked with message
- [ ] Storage warning shows at 80+ conversations
- [ ] Corrupted localStorage data → valid entries loaded, corrupted discarded
- [ ] Empty search → shows all conversations
- [ ] Search with no results → shows "No matching conversations"

---

## Styling Reference

```css
/* Retro terminal theme */
bg-retro-black        /* Main background */
bg-retro-dark         /* Panel/header background */
bg-retro-panel        /* Interactive elements */
border-retro-border   /* Default borders */
text-retro-text       /* Primary text */
text-retro-muted      /* Secondary text */
text-retro-cyan       /* Interactive/accent */
text-retro-red        /* Destructive/errors */
text-retro-yellow     /* Warnings */
font-mono             /* All text */
```

---

## Common Pitfalls

1. **SSR compatibility**: Always check `typeof window !== 'undefined'` before localStorage access
2. **Debounce cleanup**: Clear save timers on conversation delete to avoid saving deleted conversations
3. **Stable ordering**: Keep `sortConversations()` based on `createdAt` so card order does not change on message activity
4. **Title generation timing**: Only generate title after first user message is added, not on create
5. **Storage quota**: Catch `QuotaExceededError` on `localStorage.setItem()` and show user feedback
