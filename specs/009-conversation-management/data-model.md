# Data Model: Conversation Management

**Feature**: 009-conversation-management
**Date**: 2026-02-08
**Dependency**: Extends `specs/007-ai-provider-chat/data-model.md`

## Entity Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    009 Conversation Management                    │
│                                                                   │
│  ┌────────────────────┐   ┌───────────────────────────────┐     │
│  │ Conversation[]      │   │ ConversationStorage            │     │
│  │ (persisted)         │   │ (localStorage utility)         │     │
│  │                     │   │                                │     │
│  │ - id               │   │ - loadConversations()          │     │
│  │ - title            │   │ - saveConversations()          │     │
│  │ - messages[]       │   │ - clearConversations()         │     │
│  │ - createdAt        │   │ - getStorageSize()             │     │
│  │ - updatedAt        │   └───────────────────────────────┘     │
│  │ - cwd             │                                          │
│  └────────────────────┘                                          │
│         │                                                        │
│         └───> activeConversationId (links to current)           │
│                                                                   │
│  ┌────────────────────┐   ┌────────────────────────┐            │
│  │ Search/Filter       │   │ Storage Limits          │            │
│  │                     │   │                          │            │
│  │ - searchQuery      │   │ - MAX_CONVERSATIONS=100 │            │
│  │ - filteredConvs    │   │ - WARN_THRESHOLD=80     │            │
│  │ - debounce 400ms   │   │ - checkStorageLimits()  │            │
│  └────────────────────┘   └────────────────────────┘            │
└──────────────────────────────────────────────────────────────────┘

localStorage
┌─────────────────────────────────────┐
│ spec-cat-conversations                  │
│ { version: 1, conversations: [...] } │
└─────────────────────────────────────┘
```

---

## Core Entities (009-Owned)

### 1. Conversation (Core Fields)

Represents a saved conversation with message history. Core fields are owned by 009; worktree fields are owned by 011.

```typescript
// types/chat.ts — 009-owned fields

interface Conversation {
  id: string                    // Unique conversation ID
  title: string                 // Display title (auto-generated or custom)
  messages: ChatMessage[]       // All messages in the conversation
  createdAt: string             // ISO 8601 timestamp
  updatedAt: string             // ISO 8601 timestamp (metadata/recency display)
  cwd: string                   // Working directory context

  // Fields below are defined by 011-chat-worktree-integration
  // 009 persists them to localStorage but does not manage their values
  worktreePath?: string
  worktreeBranch?: string
  hasWorktree?: boolean
  baseBranch?: string
  providerSessionId?: string
  featureId?: string
  finalized?: boolean
  autoMode?: boolean
  previewBranch?: string
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

**Validation Rules (009-owned)**:
- `id`: Required, unique, generated client-side via `generateConversationId()`
- `title`: Required, max 100 characters, auto-generated from first user message (50 char truncation)
- `messages`: Required, array of ChatMessage (can be empty initially)
- `createdAt`: Required, auto-generated on creation (ISO 8601)
- `updatedAt`: Required, updated on every message add (ISO 8601)
- `cwd`: Required, captured from session on creation

**ID Generation**:
```typescript
function generateConversationId(): string {
  return `conv-${Math.random().toString(36).slice(2, 12)}`
}
```

**Title Generation**:
```typescript
function generateConversationTitle(firstUserMessage: string): string {
  const MAX_LENGTH = 50
  const cleaned = firstUserMessage.trim().replace(/\n/g, ' ')
  if (cleaned.length <= MAX_LENGTH) return cleaned
  return cleaned.slice(0, MAX_LENGTH).trim() + '...'
}
```

---

### 2. StoredConversations

The localStorage schema for persisting conversations.

```typescript
// types/chat.ts

interface StoredConversations {
  version: number           // Schema version for migrations
  conversations: Conversation[]
}

// Constants
const STORAGE_KEY_CONVERSATIONS = 'spec-cat-conversations'
const STORAGE_VERSION = 1
const MAX_CONVERSATIONS = 100
const WARN_CONVERSATIONS_THRESHOLD = 80
```

**Storage Invariants**:
- `version` must be 1 (current; future migrations handled in `loadConversations`)
- `conversations.length` must not exceed `MAX_CONVERSATIONS` (100)
- Each conversation must pass `isValidConversation()` type guard on load

---

### 3. ChatMessage (Inherited from 007)

See `specs/007-ai-provider-chat/data-model.md` for full definition. 009 uses but does not define this type.

```typescript
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  status?: 'streaming' | 'complete' | 'stopped' | 'error'
}
```

---

## Store Schema (009-Owned Subset)

The Pinia store (`stores/chat.ts`) is shared across features. Below are the state and actions owned by 009.

```typescript
// stores/chat.ts — 009-owned state

// State
const conversations = ref<Conversation[]>([])
const activeConversationId = ref<string | null>(null)
const streamingConversations = ref(new Set<string>())  // For FR-011 badge

// Computed
const activeConversation = computed(() =>
  conversations.value.find(c => c.id === activeConversationId.value) || null
)
const hasConversations = computed(() => conversations.value.length > 0)
const sortedConversations = computed(() =>
  [...conversations.value].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
)
```

```typescript
// stores/chat.ts — 009-owned actions

interface ConversationManagementActions {
  // CRUD
  loadConversations(): void              // FR-001, FR-002: Load from localStorage
  saveAllConversations(): void           // FR-002: Persist all to localStorage
  createConversation(options?: {         // FR-002: Create new conversation
    featureId?: string
  }): string
  selectConversation(id: string): void   // FR-003: Load and activate
  deleteConversation(id: string): void   // FR-006: Remove with cleanup
  renameConversation(id: string,         // FR-005: Rename title
    title: string): void

  // Persistence
  saveConversation(id: string,           // FR-009: Debounced save (400ms)
    immediate?: boolean): void
  updateConversationTitleIfNeeded(): void // FR-004: Auto-generate title
  sortConversations(): void              // FR-008: Sort by createdAt desc

  // Limits
  checkStorageLimits(): {                // FR-002: Enforce 100 limit
    atLimit: boolean
    nearLimit: boolean
    count: number
  }
}
```

---

## localStorage Schema

```typescript
// Key: 'spec-cat-conversations'

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

---

## Storage Utilities

```typescript
// utils/conversationStorage.ts

export function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONVERSATIONS)
    if (!raw) return []
    const data = JSON.parse(raw) as StoredConversations
    // Validate each conversation, discard corrupted entries
    return data.conversations.filter(isValidConversation)
  } catch {
    console.error('Failed to load conversations from localStorage')
    return []
  }
}

export function saveConversations(conversations: Conversation[]): void {
  if (typeof window === 'undefined') return
  try {
    const data: StoredConversations = {
      version: STORAGE_VERSION,
      conversations
    }
    localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(data))
  } catch (e) {
    // Handle QuotaExceededError
    console.error('Failed to save conversations:', e)
  }
}

export function clearConversations(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY_CONVERSATIONS)
}

export function getStorageSize(): number {
  if (typeof window === 'undefined') return 0
  const raw = localStorage.getItem(STORAGE_KEY_CONVERSATIONS)
  return raw ? new Blob([raw]).size : 0
}
```

---

## Type Guards

```typescript
// types/chat.ts

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
```

---

## Relationships

```
                    localStorage
                         │
                         │ persists via conversationStorage.ts
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                     ChatStore (009 scope)                      │
│                                                                │
│  Conversation[] ◄─── activeConversationId                     │
│       │                                                        │
│       │ CRUD operations                                        │
│       │                                                        │
│       ├──► loadConversations() ─── from localStorage          │
│       ├──► saveConversation() ──── to localStorage (debounced)│
│       ├──► createConversation() ── new + save                 │
│       ├──► deleteConversation() ── remove + save              │
│       ├──► renameConversation() ── update title + save        │
│       └──► selectConversation() ── set active + load messages │
│                                                                │
│  streamingConversations (Set) ── for FR-011 badge             │
└──────────────────────────────────────────────────────────────┘

UI Components:
  ConversationList.vue ──► displays ──► sorted Conversation[]
                       ──► search/filter (debounced 400ms)
                       ──► create/delete actions
  ConversationItem.vue ──► displays ──► single Conversation
                       ──► inline rename (FR-005)
                       ──► streaming badge (FR-011)
                       ──► metadata: title, preview, timestamp
  DeleteConfirmModal.vue ── confirmation dialog (FR-006)
```

---

## State Transitions

### Conversation Lifecycle

```
(create) ──► Active (messages flowing)
               │
               ├──(rename)──► title updated, updatedAt refreshed
               ├──(message added)──► updatedAt refreshed, auto-save (debounced)
               ├──(search)──► filtered in/out of list view
               │
               └──(delete)──► Confirmation modal ──► Removed from store + localStorage
```

### Storage Limit States

```
0-79 conversations ──► Normal operation
80-99 conversations ──► Warning displayed (WARN_THRESHOLD)
100 conversations ──► Creation blocked, message shown
```
