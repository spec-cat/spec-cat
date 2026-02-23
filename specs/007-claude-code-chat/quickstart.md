# Quickstart: Claude Code Chat

**Feature**: 007-claude-code-chat
**Date**: 2026-02-02

## Overview

This guide provides implementation steps for adding a Claude Code Chat panel to Spec Cat. The chat uses the local Claude Code CLI via the `@anthropic-ai/claude-code` SDK.

---

## Prerequisites

- [x] `@anthropic-ai/claude-code` installed (already in package.json)
- [x] Nuxt 3 development environment running
- [x] Claude Code CLI authenticated (`claude auth login`)

---

## Implementation Order

### Phase 1: Foundation (P1 requirements)

```
1. types/chat.ts          → Type definitions
2. stores/chat.ts         → Pinia store
3. server/utils/chatService.ts → Claude SDK integration
4. server/api/chat/send.post.ts → Send message endpoint
5. server/api/chat/stream.get.ts → SSE streaming endpoint
```

### Phase 2: UI Components (P1 requirements)

```
6. components/chat/ChatPanel.vue → Main panel
7. components/chat/ChatInput.vue → Input with send button
8. components/chat/ChatMessages.vue → Message list
9. components/chat/ChatMessage.vue → Single message
10. components/chat/ChatPanelToggle.vue → Toggle button
```

### Phase 3: Integration (P1 requirements)

```
11. composables/useChatStream.ts → SSE handling
12. composables/useChatPanel.ts → Panel state
13. composables/useAutoScroll.ts → Auto-scroll
14. components/layout/AppMain.vue → Add panel slot
```

### Phase 4: Enhancements (P2 requirements)

```
15. Panel resize functionality
16. Stop generation button
17. New conversation button
18. Error handling UI
```

### Phase 5: Conversation List (P2 requirements - NEW)

```
19. utils/conversationStorage.ts  → localStorage utilities
20. types/chat.ts                 → Add Conversation type
21. stores/chat.ts                → Add conversation state & persistence
22. components/chat/ConversationList.vue → List component
23. components/chat/ConversationItem.vue → Item component
24. components/chat/ConversationActions.vue → Rename/delete
25. components/chat/DeleteConfirmModal.vue → Confirmation dialog
26. pages/index.vue               → Display conversation list
27. composables/useConversations.ts → CRUD operations
```

### Phase 6: Conversation Management (P3 requirements)

```
28. Search/filter functionality
29. Keyboard navigation for conversation list
```

### Phase 7: Global Preview Management (P1 requirements - US10)

```
30. stores/chat.ts                 → Add previewingConversationId (global singleton)
31. stores/chat.ts                 → Add togglePreview() action (switch/toggle)
32. components/chat/ConversationItem.vue → Add preview toggle button (eye icon)
33. components/chat/ConversationItem.vue → Visual indicator for previewing state
34. stores/chat.ts                 → Clean up preview on delete/finalize (FR-033)
35. server/api/chat/preview-sync   → Auto-sync preview on new commits (FR-032)
```

---

## Key Code Snippets

### 1. Type Definitions

```typescript
// types/chat.ts
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  status?: 'streaming' | 'complete' | 'stopped' | 'error'
}

export interface ChatSession {
  sessionId: string
  cwd: string
  status: 'idle' | 'streaming' | 'error'
  startedAt: string
  error?: string
}
```

### 2. Pinia Store

```typescript
// stores/chat.ts
import { defineStore } from 'pinia'
import { ref, readonly, computed } from 'vue'
import type { ChatMessage, ChatSession } from '~/types/chat'

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const session = ref<ChatSession | null>(null)
  const isPanelOpen = ref(false)
  const panelWidth = ref(400)

  const isStreaming = computed(() => session.value?.status === 'streaming')

  function addMessage(message: ChatMessage) {
    messages.value.push(message)
  }

  function updateMessage(id: string, updates: Partial<ChatMessage>) {
    const msg = messages.value.find(m => m.id === id)
    if (msg) Object.assign(msg, updates)
  }

  function clearMessages() {
    messages.value = []
    session.value = null
  }

  function togglePanel() {
    isPanelOpen.value = !isPanelOpen.value
  }

  return {
    messages: readonly(messages),
    session: readonly(session),
    isPanelOpen,
    panelWidth,
    isStreaming,
    addMessage,
    updateMessage,
    clearMessages,
    togglePanel,
  }
})
```

### 3. SSE Streaming Composable

```typescript
// composables/useChatStream.ts
export function useChatStream() {
  const chatStore = useChatStore()
  let eventSource: EventSource | null = null

  function connect(sessionId: string, messageId: string) {
    eventSource = new EventSource(`/api/chat/stream?sessionId=${sessionId}`)

    eventSource.addEventListener('message', (e) => {
      const data = JSON.parse(e.data)
      chatStore.updateMessage(messageId, {
        content: (chatStore.messages.find(m => m.id === messageId)?.content || '') + data.chunk
      })
    })

    eventSource.addEventListener('complete', () => {
      chatStore.updateMessage(messageId, { status: 'complete' })
      disconnect()
    })

    eventSource.addEventListener('error', (e) => {
      const data = JSON.parse((e as MessageEvent).data)
      chatStore.updateMessage(messageId, { status: 'error' })
      disconnect()
    })
  }

  function disconnect() {
    eventSource?.close()
    eventSource = null
  }

  onUnmounted(disconnect)

  return { connect, disconnect }
}
```

### 4. Server API - Send Message

```typescript
// server/api/chat/send.post.ts
import { startChatSession } from '~/server/utils/chatService'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.message?.trim()) {
    throw createError({ statusCode: 400, message: 'Message is required' })
  }

  const result = await startChatSession(body.message, body.sessionId)

  return {
    sessionId: result.sessionId,
    messageId: result.messageId,
    streamUrl: `/api/chat/stream?sessionId=${result.sessionId}`,
  }
})
```

### 5. Server API - SSE Stream

```typescript
// server/api/chat/stream.get.ts
import { getChatSession } from '~/server/utils/chatService'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sessionId = query.sessionId as string

  const session = getChatSession(sessionId)
  if (!session) {
    throw createError({ statusCode: 404, message: 'Session not found' })
  }

  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')

  const send = (type: string, data: unknown) => {
    event.node.res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  // Stream messages from Claude SDK
  for await (const message of session.query) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') {
          send('message', { messageId: session.messageId, chunk: block.text })
        }
      }
    }
  }

  send('complete', { messageId: session.messageId })
  event.node.res.end()
})
```

### 6. Chat Panel Component

```vue
<!-- components/chat/ChatPanel.vue -->
<template>
  <div
    class="h-full flex flex-col bg-retro-black border-l border-retro-border"
    :style="{ width: `${panelWidth}px` }"
  >
    <!-- Header -->
    <div class="flex-shrink-0 h-12 flex items-center justify-between px-4 border-b border-retro-border bg-retro-dark">
      <div class="flex items-center gap-2">
        <ChatBubbleLeftIcon class="w-4 h-4 text-retro-cyan" />
        <span class="text-sm font-mono text-retro-text">Claude Chat</span>
      </div>
      <div class="flex items-center gap-2">
        <button @click="clearChat" class="p-1 hover:bg-retro-panel rounded">
          <TrashIcon class="w-4 h-4 text-retro-muted" />
        </button>
      </div>
    </div>

    <!-- CWD Display -->
    <div class="flex-shrink-0 px-4 py-2 border-b border-retro-border">
      <span class="text-xs font-mono text-retro-muted">{{ abbreviatedCwd }}</span>
    </div>

    <!-- Messages -->
    <ChatMessages class="flex-1 overflow-y-auto" />

    <!-- Input -->
    <ChatInput class="flex-shrink-0" />
  </div>
</template>
```

### 7. Conversation Type (NEW)

```typescript
// types/chat.ts - Add to existing file
export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  cwd: string
}

export function generateConversationId(): string {
  return `conv-${Math.random().toString(36).slice(2, 12)}`
}

export function generateTitle(firstMessage: string): string {
  const MAX_LENGTH = 50
  const cleaned = firstMessage.trim().replace(/\n/g, ' ')
  if (cleaned.length <= MAX_LENGTH) return cleaned
  return cleaned.slice(0, MAX_LENGTH).trim() + '...'
}
```

### 8. Conversation Storage Utility (NEW)

```typescript
// utils/conversationStorage.ts
const STORAGE_KEY = 'spec-cat-conversations'
const STORAGE_VERSION = 1

interface StoredData {
  version: number
  conversations: Conversation[]
}

export function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data: StoredData = JSON.parse(raw)
    return data.conversations
  } catch {
    console.error('Failed to load conversations')
    return []
  }
}

export function saveConversations(conversations: Conversation[]): void {
  if (typeof window === 'undefined') return
  const data: StoredData = { version: STORAGE_VERSION, conversations }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}
```

### 9. Extended Pinia Store (NEW)

```typescript
// stores/chat.ts - Add to existing store
const conversations = ref<Conversation[]>([])
const activeConversationId = ref<string | null>(null)

const activeConversation = computed(() =>
  conversations.value.find(c => c.id === activeConversationId.value) || null
)

const hasConversations = computed(() => conversations.value.length > 0)

function loadConversations() {
  conversations.value = conversationStorage.loadConversations()
}

function createConversation(): string {
  const id = generateConversationId()
  const conv: Conversation = {
    id,
    title: 'New Conversation',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cwd: session.value?.cwd || process.cwd()
  }
  conversations.value.unshift(conv)
  activeConversationId.value = id
  messages.value = []
  saveAllConversations()
  return id
}

function selectConversation(id: string) {
  const conv = conversations.value.find(c => c.id === id)
  if (!conv) return
  activeConversationId.value = id
  messages.value = [...conv.messages]
  isPanelOpen.value = true
}

function deleteConversation(id: string) {
  conversations.value = conversations.value.filter(c => c.id !== id)
  if (activeConversationId.value === id) {
    activeConversationId.value = null
    messages.value = []
  }
  saveAllConversations()
}

function renameConversation(id: string, title: string) {
  const conv = conversations.value.find(c => c.id === id)
  if (conv) {
    conv.title = title
    saveAllConversations()
  }
}

function saveAllConversations() {
  conversationStorage.saveConversations(conversations.value)
}
```

### 10. Conversation List Component (NEW)

```vue
<!-- components/chat/ConversationList.vue -->
<script setup lang="ts">
import { useChatStore } from '~/stores/chat'
import ConversationItem from './ConversationItem.vue'

const chatStore = useChatStore()

function handleCreate() {
  chatStore.createConversation()
  chatStore.openPanel()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-mono text-retro-cyan">Conversations</h2>
      <button
        @click="handleCreate"
        class="px-3 py-1 text-sm font-mono bg-retro-cyan/10 text-retro-cyan
               border border-retro-cyan/30 rounded hover:bg-retro-cyan/20"
      >
        + New Chat
      </button>
    </div>

    <div v-if="chatStore.hasConversations" class="space-y-2">
      <ConversationItem
        v-for="conv in chatStore.conversations"
        :key="conv.id"
        :conversation="conv"
        :is-active="conv.id === chatStore.activeConversationId"
        @select="chatStore.selectConversation(conv.id)"
        @delete="chatStore.deleteConversation(conv.id)"
        @rename="(title) => chatStore.renameConversation(conv.id, title)"
      />
    </div>

    <div v-else class="text-center py-8 text-retro-muted">
      <p class="font-mono">No conversations yet</p>
      <p class="text-sm mt-2">Click "New Chat" to start</p>
    </div>
  </div>
</template>
```

### 11. Conversation Item Component (NEW)

```vue
<!-- components/chat/ConversationItem.vue -->
<script setup lang="ts">
import { ChatBubbleLeftIcon, TrashIcon, PencilIcon } from '@heroicons/vue/24/outline'
import type { Conversation } from '~/types/chat'

const props = defineProps<{
  conversation: Conversation
  isActive: boolean
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

const lastMessagePreview = computed(() => {
  const msgs = props.conversation.messages
  if (!msgs.length) return 'No messages'
  const last = msgs[msgs.length - 1]
  const preview = last.content.slice(0, 60)
  return preview.length < last.content.length ? preview + '...' : preview
})

const formattedDate = computed(() => {
  return new Date(props.conversation.updatedAt).toLocaleDateString()
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
        <div v-if="isEditing" class="flex gap-2">
          <input
            v-model="editTitle"
            @click.stop
            @keyup.enter="saveEdit"
            @keyup.escape="isEditing = false"
            class="flex-1 px-2 py-1 text-sm font-mono bg-retro-black border border-retro-cyan rounded"
            autofocus
          />
        </div>
        <h3 v-else class="text-sm font-mono text-retro-text truncate">
          {{ conversation.title }}
        </h3>
        <p class="text-xs text-retro-muted mt-1 truncate">{{ lastMessagePreview }}</p>
        <p class="text-xs text-retro-muted/60 mt-1">{{ formattedDate }}</p>
      </div>
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

### 12. Updated Chat Page (NEW)

```vue
<!-- pages/index.vue -->
<script setup lang="ts">
import ConversationList from '~/components/chat/ConversationList.vue'
import { useChatStore } from '~/stores/chat'

const chatStore = useChatStore()

onMounted(() => {
  chatStore.loadConversations()
})
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto">
    <h1 class="text-2xl font-bold text-retro-cyan font-mono mb-6">Chat</h1>
    <ConversationList />
  </div>
</template>
```

---

## Testing Checklist

### Manual Tests - Chat Panel

- [ ] Open chat panel with toggle button
- [ ] Send a message and see streaming response
- [ ] Send follow-up message (context maintained)
- [ ] Stop generation mid-stream
- [ ] Start new conversation
- [ ] Resize panel width
- [ ] Close and reopen panel (history preserved)
- [ ] Handle error (disconnect WiFi, test error display)

### Manual Tests - Conversation List (NEW)

- [ ] View conversation list on main Chat page
- [ ] Click "New Chat" to create new conversation
- [ ] Click conversation to load it in chat panel
- [ ] Rename a conversation title
- [ ] Delete a conversation (confirm dialog appears)
- [ ] Verify conversations persist after page refresh
- [ ] Verify conversations sorted by most recent
- [ ] Auto-generated title from first message

### Manual Tests - Global Preview (NEW - US10)

- [ ] Preview a conversation with worktree (eye icon in list)
- [ ] Verify only one conversation can be previewed at a time
- [ ] Switch preview from conversation A to B directly
- [ ] Toggle preview off by clicking preview on active preview
- [ ] Visual indicator shows which conversation is previewed
- [ ] Preview auto-syncs when agent makes new commits
- [ ] Preview cleaned up on finalize
- [ ] Preview cleaned up on conversation delete

### Edge Cases

- [ ] Empty message submission (should be prevented)
- [ ] Very long message
- [ ] Rapid send button clicks
- [ ] Browser refresh during streaming
- [ ] Delete active conversation (should clear panel)
- [ ] localStorage full (should handle gracefully)
- [ ] Corrupted localStorage data (should recover)
- [ ] Delete previewed conversation (should end preview first)
- [ ] Finalize previewed conversation (should end preview first)
- [ ] Preview conversation with no worktree (should show error)

---

## Styling Reference

```css
/* Color palette */
bg-retro-black     /* Main background */
bg-retro-dark      /* Header background */
bg-retro-panel     /* UI elements */
border-retro-border
text-retro-text    /* Primary text */
text-retro-muted   /* Secondary text */
text-retro-cyan    /* Interactive elements */
text-retro-red     /* Errors */

/* Typography */
font-mono          /* All text */
text-sm            /* Standard text */
text-xs            /* Labels/metadata */
```

---

## Common Pitfalls

1. **SSR compatibility**: Check `typeof window !== 'undefined'` before using WebSocket
2. **Auto-scroll**: Use `nextTick()` before scrolling after message updates
3. **PTY cleanup**: Ensure PTY processes are killed on WebSocket disconnect
4. **Message IDs**: Generate unique IDs client-side before sending
5. **Preview state**: Always check/clear `previewingConversationId` before delete or finalize
6. **Atomic preview switch**: End old preview before starting new one; if new fails, old is already ended

---

## Next Steps

After implementation, run `/speckit.tasks` to generate detailed task breakdown.
