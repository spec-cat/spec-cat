# Research: Claude Code Chat

**Feature**: 007-claude-code-chat
**Date**: 2026-02-02

## Research Summary

All technical unknowns have been resolved through codebase exploration. No external research required as this feature builds entirely on existing patterns.

---

## Decision 1: Streaming Architecture

**Question**: How should chat responses be streamed to the client?

**Decision**: Server-Sent Events (SSE)

**Rationale**:
- Existing `server/api/pipeline/[sessionId]/stream.get.ts` establishes SSE pattern
- Simpler than WebSocket for unidirectional data flow (server → client)
- Already proven in codebase with proper connection handling
- EventSource API is well-supported in browsers

**Alternatives Considered**:
- WebSocket: Rejected - overkill for chat where client only sends via POST
- Long polling: Rejected - higher latency, more complex state management

**Implementation Pattern** (from existing code):
```typescript
// Server
setHeader(event, 'Content-Type', 'text/event-stream')
setHeader(event, 'Cache-Control', 'no-cache')
const send = (type: string, data: unknown) => {
  event.node.res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
}

// Client
const es = new EventSource(url)
es.addEventListener('message', (e) => { /* handle */ })
```

---

## Decision 2: Panel Layout Pattern

**Question**: How should the right chat panel be integrated into the existing layout?

**Decision**: Flex-based panel alongside main content, similar to left sidebar

**Rationale**:
- `components/layout/AppMain.vue` uses flex layout with `flex-1 overflow-y-auto`
- `components/layout/SidebarResizer.vue` provides drag-to-resize pattern
- Consistent with existing layout architecture

**Implementation Pattern**:
```vue
<!-- AppMain.vue structure -->
<div class="flex h-full">
  <div class="flex-1 overflow-y-auto">
    <!-- Main content -->
  </div>
  <ChatPanel v-if="chatPanelOpen" class="flex-shrink-0" />
</div>
```

**Panel Width**: Default 400px, min 300px, max 600px (following sidebar constraints pattern)

---

## Decision 3: Claude Code SDK Integration

**Question**: How should we integrate with @anthropic-ai/claude-code for chat?

**Decision**: Extend existing `claudeService.ts` pattern with chat-specific functions

**Rationale**:
- `server/utils/claudeService.ts` already implements `query()` and `sendMessage()` patterns
- Existing session management with AbortController
- Proven patterns for processing SDK messages

**Key Patterns from Existing Code**:
```typescript
import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-code'

const queryOptions: Options = {
  abortController,
  cwd: workingDirectory,
  permissionMode: 'bypassPermissions',
  maxTurns: 200,
}

for await (const message of queryInstance) {
  // Process streaming messages
}
```

**Chat-Specific Adaptations**:
- Use conversation history for multi-turn context
- Stream text content blocks directly to SSE
- Track message types: user, assistant, tool_use, tool_result

---

## Decision 4: State Management

**Question**: How should chat state be managed?

**Decision**: Pinia store for global state + composables for connection handling

**Rationale**:
- `stores/pipeline.ts` demonstrates complex state + SSE pattern
- Composition API style for new stores (per `stores/gitGraph.ts`)
- Composables for stateful logic (per existing patterns)

**Store Structure**:
```typescript
// stores/chat.ts
export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const isPanelOpen = ref(false)
  const panelWidth = ref(400)
  const error = ref<string | null>(null)

  return {
    messages: readonly(messages),
    isStreaming: readonly(isStreaming),
    // ... actions
  }
})
```

---

## Decision 5: Message Rendering

**Question**: How should markdown and code blocks be rendered?

**Decision**: Use existing markdown rendering with syntax highlighting

**Rationale**:
- Consistent with how Claude responses are displayed elsewhere
- Code blocks are common in developer chat

**Implementation**:
- Use `v-html` with sanitized markdown rendering
- Apply `font-mono` and retro theme colors
- Syntax highlighting for code blocks (if library already available)

---

## Decision 6: Auto-Scroll Behavior

**Question**: How should auto-scroll work during streaming?

**Decision**: Auto-scroll to bottom unless user has scrolled up

**Rationale**:
- Standard chat UX pattern
- `components/pipeline/PipelineLogs.vue` shows auto-scroll implementation

**Implementation Pattern**:
```typescript
// useAutoScroll.ts
const shouldAutoScroll = ref(true)
const containerRef = ref<HTMLElement>()

const onScroll = () => {
  const el = containerRef.value
  if (!el) return
  // If user scrolled away from bottom, disable auto-scroll
  shouldAutoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < 50
}

const scrollToBottom = () => {
  if (shouldAutoScroll.value) {
    nextTick(() => {
      containerRef.value?.scrollTo({ top: containerRef.value.scrollHeight })
    })
  }
}
```

---

## Decision 7: Error Handling

**Question**: How should errors be displayed and handled?

**Decision**: Inline error banner in chat panel + retry capability

**Rationale**:
- Follows existing error display pattern (thin band with `bg-retro-red/20`)
- User should be able to retry after error

**Error Categories**:
1. **Connection error**: SSE fails to connect - show reconnect button
2. **CLI error**: Claude Code SDK error - show error message
3. **Auth error**: Not authenticated - show setup instructions
4. **Abort**: User cancelled - silent, allow new message

---

## Decision 8: Working Directory Display

**Question**: Where and how to display the current working directory?

**Decision**: Show abbreviated path in panel header

**Rationale**:
- Header has space for metadata (following existing panel patterns)
- Users need to know context for Claude's codebase access

**Implementation**:
- Display last 2 path segments (e.g., `spec-cat/src`)
- Full path on hover (title attribute)
- Use `text-retro-muted text-xs font-mono`

---

---

## Decision 9: Conversation Persistence Strategy

**Question**: How should conversations be persisted across browser sessions?

**Decision**: localStorage with JSON serialization

**Rationale**:
- Constitution VI (Simplicity Over Complexity) mandates avoiding unnecessary complexity
- Single-user local application doesn't need server-side persistence
- localStorage provides ~5-10MB, sufficient for ~100 conversations
- No network latency, instant access
- Existing pattern: `chat-panel-width` already uses localStorage

**Alternatives Considered**:
- IndexedDB: Rejected - over-engineered for simple key-value storage
- Server-side SQLite: Rejected - adds server complexity for single-user app
- File system (server): Rejected - requires API endpoints, file permission handling

**Implementation Pattern**:
```typescript
const STORAGE_KEY = 'spec-cat-conversations'
const STORAGE_VERSION = 1

interface StoredData {
  version: number
  conversations: Conversation[]
}

// SSR-safe access
function getStorage(): StoredData | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}
```

---

## Decision 10: Conversation Data Structure

**Question**: How should conversations be structured for storage and display?

**Decision**: Flat array with embedded messages, stored in single localStorage key

**Rationale**:
- Matches existing `messages: ChatMessage[]` pattern in store
- Simple to serialize/deserialize
- Easy to sort by `updatedAt`
- No joins or lookups needed

**Data Structure**:
```typescript
interface Conversation {
  id: string              // Unique conversation ID
  title: string           // Display title (auto or custom)
  messages: ChatMessage[] // Embedded messages
  createdAt: string       // ISO timestamp
  updatedAt: string       // ISO timestamp (for sorting)
  cwd: string            // Working directory context
}
```

---

## Decision 11: Title Generation Strategy

**Question**: How should conversation titles be auto-generated?

**Decision**: First 50 characters of first user message, truncated with ellipsis

**Rationale**:
- Provides meaningful context without manual input
- Same pattern used by ChatGPT, Claude.ai
- User can rename if auto-title is insufficient

**Implementation**:
```typescript
function generateTitle(firstMessage: string): string {
  const MAX_LENGTH = 50
  const cleaned = firstMessage.trim().replace(/\n/g, ' ')
  if (cleaned.length <= MAX_LENGTH) return cleaned
  return cleaned.slice(0, MAX_LENGTH).trim() + '...'
}
```

---

## Decision 12: Conversation Selection Flow

**Question**: How should conversation selection work?

**Decision**: Click conversation → load into store → open panel automatically

**Flow**:
1. User clicks conversation in list
2. `selectConversation(id)` called
3. Store loads messages from selected conversation
4. Chat panel opens automatically (if closed)
5. User can continue chatting

**State Management**:
```typescript
// In chat store
const activeConversationId = ref<string | null>(null)
const conversations = ref<Conversation[]>([])

function selectConversation(id: string) {
  const conv = conversations.value.find(c => c.id === id)
  if (!conv) return
  activeConversationId.value = id
  messages.value = [...conv.messages]
  isPanelOpen.value = true
}
```

---

## Decision 13: Auto-Save Strategy

**Question**: When should conversations be saved to localStorage?

**Decision**: Save after each message, debounced during streaming

**Rationale**:
- FR-026 requires automatic saving
- Prevents data loss from browser crashes/closes
- Debouncing prevents excessive writes during streaming

**Implementation**:
```typescript
// Immediate save on user message
function addUserMessage(content: string) {
  // ... add message
  saveCurrentConversation() // immediate
}

// Debounced save during streaming
const debouncedSave = useDebounceFn(saveCurrentConversation, 500)

function appendToMessage(id: string, chunk: string) {
  // ... append chunk
  debouncedSave() // debounced
}
```

---

## Decision 14: Delete Confirmation UX

**Question**: How should conversation deletion be confirmed?

**Decision**: Modal dialog with explicit confirmation

**Rationale**:
- FR-023 requires confirmation before deletion
- Constitution I (User Control First) requires explicit consent
- Prevents accidental data loss

**Implementation**:
```vue
<DeleteConfirmModal
  :show="showDeleteModal"
  :title="conversationToDelete?.title"
  @confirm="doDelete"
  @cancel="showDeleteModal = false"
/>
```

---

## Decision 15: Storage Limits Handling

**Question**: How to handle localStorage limits?

**Decision**: Warn at 80 conversations, auto-cleanup oldest at 100

**Rationale**:
- Prevents localStorage quota errors (typically 5-10MB)
- Older conversations typically less valuable
- User warned before automatic cleanup

**Implementation**:
```typescript
const MAX_CONVERSATIONS = 100
const WARN_THRESHOLD = 80

function checkStorageLimits() {
  const count = conversations.value.length
  if (count >= MAX_CONVERSATIONS) {
    // Delete oldest, show notification
    const oldest = conversations.value
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0]
    deleteConversation(oldest.id)
  }
  return count >= WARN_THRESHOLD
}
```

---

## Decision 16: Global Preview State Management

**Question**: How should preview be managed across multiple conversations?

**Decision**: Store-level `previewingConversationId` singleton + atomic switch operations

**Rationale**:
- Only one conversation's worktree can be checked out in the main worktree at a time (git constraint)
- Per-conversation `previewBranch` field is insufficient — it can't enforce cross-conversation uniqueness
- A store-level ref provides a single source of truth for which conversation is previewed
- Atomic switch: end current preview, then start new one — if new fails, old is already ended and main returns to base branch

**Alternatives Considered**:
- Per-conversation `isPreviewActive` boolean: Rejected — can't enforce single-preview constraint across conversations
- Server-side preview tracking: Rejected — adds server state complexity; client already knows which conversation is active
- Computed from `previewBranch` field presence: Rejected — multiple conversations could have stale `previewBranch` values after crashes

**Implementation Pattern**:
```typescript
// stores/chat.ts
const previewingConversationId = ref<string | null>(null)

const isPreviewingConversation = computed(() => (id: string) =>
  previewingConversationId.value === id
)

async function togglePreview(id: string) {
  if (previewingConversationId.value === id) {
    // Toggle off - end preview
    await unpreviewConversation(id)
    previewingConversationId.value = null
  } else {
    // Switch: end current (if any), start new
    if (previewingConversationId.value) {
      await unpreviewConversation(previewingConversationId.value)
    }
    const result = await previewConversation(id)
    previewingConversationId.value = result.success ? id : null
  }
}
```

---

## Decision 17: Preview Control Placement in Conversation List

**Question**: Where should the preview/unpreview button appear?

**Decision**: In ConversationItem.vue as an eye icon, in addition to existing ChatPanel.vue header button

**Rationale**:
- FR-034 requires preview control in conversation list (not only in chat panel)
- Users should be able to switch preview without opening each conversation
- Eye icon (EyeIcon/EyeSlashIcon from @heroicons/vue) is intuitive for "viewing" worktree changes
- Active preview shown with filled eye icon + cyan highlight

**Implementation**:
- ConversationItem.vue: Add eye icon button next to edit/delete actions
- Highlight entire conversation row when it is the previewed one (FR-029)
- ChatPanel.vue: Keep existing preview button for in-panel control

---

## Decision 18: Preview Cleanup on Delete/Finalize

**Question**: How should preview state be cleaned up when a conversation is deleted or finalized?

**Decision**: Check `previewingConversationId` before destructive operations; end preview first if needed

**Rationale**:
- Deleting a previewed conversation without ending preview leaves main worktree on a dangling branch
- Finalizing merges the branch, so preview branch becomes invalid
- Both operations must check and clear global preview state first

**Implementation**:
```typescript
async function deleteConversation(id: string) {
  // Clean up preview if this conversation is being previewed (FR-033)
  if (previewingConversationId.value === id) {
    await unpreviewConversation(id)
    previewingConversationId.value = null
  }
  // ... proceed with deletion
}
```

---

## No Further Research Required

All technical decisions resolved. Ready for Phase 1 design artifacts.
