# Data Model: AI Provider Chat

**Feature**: 007-ai-provider-chat
**Date**: 2026-02-02

## Entity Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              ChatStore                                        │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Conversation[] │  │  ChatSession   │  │  PanelState   │  │ PreviewState│  │
│  │ (persisted)    │  │  (runtime)     │  │               │  │  (global)   │  │
│  │                │  │                │  │ - isOpen       │  │             │  │
│  │ - id           │  │ - sessionId    │  │ - width        │  │ - previewing│  │
│  │ - title        │  │ - cwd          │  │   (persisted)  │  │   ConvId    │  │
│  │ - messages[]   │  │ - status       │  │               │  │   (runtime) │  │
│  │ - createdAt    │  │ - startedAt    │  └──────────────┘  └─────────────┘  │
│  │ - updatedAt    │  │ - abort        │                                      │
│  │ - worktree*    │  └────────────────┘                                      │
│  │ - previewBranch│                                                          │
│  └────────────────┘                                                          │
│         │                                                                    │
│         └───> activeConversationId (links to current conversation)           │
│         └───> previewingConversationId (global: only one at a time, FR-028)  │
└──────────────────────────────────────────────────────────────────────────────┘

localStorage
┌─────────────────────────────────────┐  ┌──────────────────────┐
│ spec-cat-conversations                 │  │ chat-panel-width      │
│ { version: 1, conversations: [...] }│  │ chat-permission-mode  │
└─────────────────────────────────────┘  └──────────────────────┘
```

---

## Core Entities

### 1. Conversation (NEW)

Represents a saved conversation with full message history.

```typescript
// types/chat.ts

interface Conversation {
  id: string                    // Unique conversation ID
  title: string                 // Display title (auto-generated or custom)
  messages: ChatMessage[]       // All messages in the conversation
  createdAt: string             // ISO 8601 timestamp
  updatedAt: string             // ISO 8601 timestamp (for sorting)
  cwd: string                   // Working directory context
}

// Example
const conversation: Conversation = {
  id: 'conv-8f3k2m9p0a',
  title: 'Help me refactor the authentication module',
  messages: [/* ChatMessage[] */],
  createdAt: '2026-02-02T10:00:00.000Z',
  updatedAt: '2026-02-02T10:30:00.000Z',
  cwd: '/home/khan/src/spec-cat'
}
```

**Validation Rules**:
- `id`: Required, unique, generated client-side
- `title`: Required, max 100 characters, auto-generated from first user message
- `messages`: Required, array of ChatMessage (can be empty initially)
- `createdAt`: Required, auto-generated on creation
- `updatedAt`: Required, updated on every message add
- `cwd`: Required, captured from session on creation

**ID Generation**:
```typescript
function generateConversationId(): string {
  return `conv-${Math.random().toString(36).slice(2, 12)}`
}
```

**Title Generation**:
```typescript
function generateTitle(firstUserMessage: string): string {
  const MAX_LENGTH = 50
  const cleaned = firstUserMessage.trim().replace(/\n/g, ' ')
  if (cleaned.length <= MAX_LENGTH) return cleaned
  return cleaned.slice(0, MAX_LENGTH).trim() + '...'
}
```

---

### 2. ChatMessage

Represents a single message in a conversation.

```typescript
// types/chat.ts

interface ChatMessage {
  id: string                    // Unique message ID (uuid)
  role: 'user' | 'assistant'    // Message sender
  content: string               // Message text content
  timestamp: string             // ISO 8601 timestamp
  status?: MessageStatus        // For assistant messages only
}

type MessageStatus =
  | 'streaming'    // Currently being generated
  | 'complete'     // Successfully completed
  | 'stopped'      // User stopped generation
  | 'error'        // Error during generation

// Example
const message: ChatMessage = {
  id: 'msg-abc123',
  role: 'assistant',
  content: 'Here is the code you requested...',
  timestamp: '2026-02-02T10:30:00.000Z',
  status: 'complete'
}
```

**Validation Rules**:
- `id`: Required, unique, generated client-side
- `role`: Required, must be 'user' or 'assistant'
- `content`: Required for user messages, may be empty string during streaming for assistant
- `timestamp`: Required, auto-generated on creation
- `status`: Only present for assistant messages

---

### 3. ChatSession

Represents the active connection to Claude Code CLI.

```typescript
// types/chat.ts

interface ChatSession {
  sessionId: string             // Unique session ID
  cwd: string                   // Working directory path
  status: SessionStatus         // Current session state
  startedAt: string             // ISO 8601 timestamp
  error?: string                // Error message if failed
}

type SessionStatus =
  | 'idle'         // No active request
  | 'streaming'    // Response being generated
  | 'error'        // Last request failed

// Example
const session: ChatSession = {
  sessionId: 'chat-1706871234567-x7k9m2',
  cwd: '/home/khan/src/spec-cat',
  status: 'idle',
  startedAt: '2026-02-02T10:00:00.000Z'
}
```

**State Transitions**:
```
idle ──(send message)──> streaming
streaming ──(complete)──> idle
streaming ──(stop)──> idle
streaming ──(error)──> error
error ──(retry/new message)──> streaming
```

---

### 4. ChatPanelState

Represents the UI state of the chat panel.

```typescript
// types/chat.ts

interface ChatPanelState {
  isOpen: boolean               // Panel visibility
  width: number                 // Panel width in pixels
}

// Constraints
const PANEL_MIN_WIDTH = 300
const PANEL_MAX_WIDTH = 600
const PANEL_DEFAULT_WIDTH = 400
```

**Persistence**:
- `width`: Persisted to localStorage as `chat-panel-width`
- `isOpen`: Not persisted (starts closed on page load)

---

### 5. PreviewState (NEW - FR-028)

Global singleton representing which conversation is currently being previewed.

```typescript
// Stored at store level (not per-conversation)
// Only one conversation can be previewed at a time

// State
const previewingConversationId = ref<string | null>(null)

// Computed
const previewingConversation = computed(() =>
  previewingConversationId.value
    ? conversations.value.find(c => c.id === previewingConversationId.value)
    : null
)

function isConversationPreviewing(id: string): boolean {
  return previewingConversationId.value === id
}
```

**Invariants**:
- At most one conversation can have `previewingConversationId` pointing to it
- When `previewingConversationId` is set, that conversation's `previewBranch` must be non-null
- On finalize or delete of a previewing conversation, `previewingConversationId` must be cleared first
- Not persisted to localStorage (preview is a runtime-only state; main worktree returns to base on server restart)

**State Transitions**:
```
null ──(preview conv A)──> A
A ──(toggle preview A)──> null
A ──(preview conv B)──> null ──> B  (atomic switch)
A ──(finalize conv A)──> null
A ──(delete conv A)──> null
```

---

## Pinia Store Schema

```typescript
// stores/chat.ts

interface ChatStoreState {
  // Conversations (persisted to localStorage)
  conversations: Conversation[]
  activeConversationId: string | null

  // Current session messages (working copy)
  messages: ChatMessage[]

  // Session (runtime only)
  session: ChatSession | null

  // Panel UI
  panel: ChatPanelState

  // Global Preview State (FR-028)
  previewingConversationId: string | null  // Only one at a time

  // Permission
  permissionMode: PermissionMode          // Persisted to localStorage

  // Per-conversation streaming (runtime only)
  streamStates: Map<string, StreamState>

  // Computed/Derived
  isStreaming: boolean              // Computed from active conversation's stream state
  hasConversations: boolean         // conversations.length > 0
  activeConversation: Conversation | null  // Current conversation
  lastError: string | null          // Last error message
}

interface StreamState {
  ws: WebSocket | null
  streaming: boolean
  error: string | null
}

// Actions for conversation management
interface ChatStoreActions {
  // Conversation CRUD
  createConversation(): string          // Returns new conversation ID
  selectConversation(id: string): void
  renameConversation(id: string, title: string): void
  deleteConversation(id: string): void

  // Message operations (updates active conversation)
  addUserMessage(content: string): void
  addAssistantMessage(): string         // Returns message ID
  appendToMessage(id: string, chunk: string): void

  // Persistence
  loadConversations(): void             // Load from localStorage
  saveConversation(id: string): void    // Save to localStorage

  // Session management
  startSession(id: string): void
  endSession(): void

  // Preview (FR-028 to FR-034)
  previewConversation(id: string): Promise<{ success: boolean; error?: string }>
  unpreviewConversation(id: string): Promise<{ success: boolean; error?: string }>
  togglePreview(id: string): Promise<void>  // Switch or toggle preview

  // Finalize
  finalizeConversation(id: string, message: string): Promise<FinalizeResponse>

  // Panel
  togglePanel(): void
  openPanel(): void
  closePanel(): void
  setPanelWidth(width: number): void
}
```

---

## localStorage Schema

```typescript
// Key: 'spec-cat-conversations'

interface StoredConversations {
  version: number           // Schema version for migrations
  conversations: Conversation[]
}

// Example stored data
const storedData: StoredConversations = {
  version: 1,
  conversations: [
    {
      id: 'conv-8f3k2m9p0a',
      title: 'Refactor authentication module',
      messages: [
        { id: 'msg-1', role: 'user', content: 'Help me refactor...', timestamp: '...' },
        { id: 'msg-2', role: 'assistant', content: '...', timestamp: '...', status: 'complete' }
      ],
      createdAt: '2026-02-02T10:00:00.000Z',
      updatedAt: '2026-02-02T10:30:00.000Z',
      cwd: '/home/khan/src/spec-cat'
    }
  ]
}
```

**Storage Utilities**:
```typescript
// utils/conversationStorage.ts

const STORAGE_KEY = 'spec-cat-conversations'
const STORAGE_VERSION = 1

export function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  const data: StoredConversations = JSON.parse(raw)
  // Handle version migrations here if needed
  return data.conversations
}

export function saveConversations(conversations: Conversation[]): void {
  if (typeof window === 'undefined') return
  const data: StoredConversations = {
    version: STORAGE_VERSION,
    conversations
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}
```

---

## SSE Event Types

Events sent from server to client during streaming.

```typescript
// Server-sent events

interface SSEMessageEvent {
  type: 'message'
  data: {
    messageId: string           // Corresponding ChatMessage.id
    chunk: string               // Text chunk to append
  }
}

interface SSECompleteEvent {
  type: 'complete'
  data: {
    messageId: string
  }
}

interface SSEErrorEvent {
  type: 'error'
  data: {
    messageId: string
    error: string
  }
}

type SSEEvent = SSEMessageEvent | SSECompleteEvent | SSEErrorEvent
```

---

## API Request/Response Types

### Send Message

```typescript
// POST /api/chat/send

interface SendMessageRequest {
  message: string               // User's message text
  sessionId?: string            // Existing session to continue
}

interface SendMessageResponse {
  sessionId: string             // Session ID for streaming
  messageId: string             // Created assistant message ID
  streamUrl: string             // SSE endpoint URL
}
```

### Stop Generation

```typescript
// POST /api/chat/stop

interface StopRequest {
  sessionId: string
}

interface StopResponse {
  success: boolean
}
```

---

## Relationships

```
                    localStorage
                         │
                         │ persists
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         ChatStore                                     │
│                                                                       │
│  Conversation[] ◄─── activeConversationId ──────► ChatPanel           │
│       │          ◄─── previewingConversationId ──► ConversationList   │
│       │                    (global, FR-028)                            │
│       │ contains                                                      │
│       ▼                                                               │
│  ChatMessage[] ◄──────────────────────────────────── ChatInput        │
│       │                                                │              │
│       │ streamed by                                   sends           │
│       ▼                                                │              │
│  WebSocket (_ws.ts) ──► PTY ──► Claude CLI             │              │
│       │                  │                             │              │
│       │ streaming        │ spawn/kill                  │              │
│       ▼                  ▼                             ▼              │
│  useChatStream ◄──────────────────────────── /api/chat/* REST        │
│                                                                       │
│  Preview Flow:                                                        │
│  togglePreview(id) ──► unpreview(old) ──► preview(new)               │
│       │                  DELETE                POST                    │
│       └──► previewingConversationId updated                          │
└──────────────────────────────────────────────────────────────────────┘

UI Components:
  ConversationList.vue ──► displays ──► Conversation[]
                      ──► shows preview indicator (FR-029)
                      ──► preview toggle button (FR-034)
  ConversationItem.vue ──► displays ──► single Conversation
                       ──► eye icon for preview state
  ChatPanel.vue ────────► preview/finalize controls
  ChatMessages.vue ─────► displays ──► ChatMessage[]
  ChatMessage.vue ──────► displays ──► single ChatMessage + tools
```

---

## Type Guards

```typescript
// types/chat.ts

// Message type guards
function isUserMessage(msg: ChatMessage): msg is ChatMessage & { role: 'user' } {
  return msg.role === 'user'
}

function isAssistantMessage(msg: ChatMessage): msg is ChatMessage & { role: 'assistant' } {
  return msg.role === 'assistant'
}

function isStreamingMessage(msg: ChatMessage): boolean {
  return msg.role === 'assistant' && msg.status === 'streaming'
}

// Conversation type guards
function isValidConversation(obj: unknown): obj is Conversation {
  if (!obj || typeof obj !== 'object') return false
  const conv = obj as Record<string, unknown>
  return (
    typeof conv.id === 'string' &&
    typeof conv.title === 'string' &&
    Array.isArray(conv.messages) &&
    typeof conv.createdAt === 'string' &&
    typeof conv.updatedAt === 'string' &&
    typeof conv.cwd === 'string'
  )
}

function isValidStoredConversations(obj: unknown): obj is StoredConversations {
  if (!obj || typeof obj !== 'object') return false
  const data = obj as Record<string, unknown>
  return (
    typeof data.version === 'number' &&
    Array.isArray(data.conversations) &&
    data.conversations.every(isValidConversation)
  )
}
```
