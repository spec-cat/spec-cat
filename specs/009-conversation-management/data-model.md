# Data Model: Conversation Management

**Feature**: 009-conversation-management
**Date**: 2026-02-08
**Updated**: 2026-03-21
**Dependency**: Extends `specs/007-ai-provider-chat/data-model.md`

## Entity Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    009 Conversation Management                    │
│                                                                   │
│  ┌────────────────────┐   ┌───────────────────────────────┐     │
│  │ Conversation[]      │   │ ConversationStorage (client)   │     │
│  │ (persisted)         │   │ (async REST API wrapper)       │     │
│  │                     │   │                                │     │
│  │ - id               │   │ - loadConversations()          │     │
│  │ - title            │   │ - saveConversations()          │     │
│  │ - messages[]       │   │ - saveConversation()           │     │
│  │ - createdAt        │   │ - clearConversations()         │     │
│  │ - updatedAt        │   └───────────────────────────────┘     │
│  │ - cwd             │                                          │
│  └────────────────────┘   ┌───────────────────────────────┐     │
│         │                  │ ConversationStore (server)      │     │
│         │                  │ (filesystem persistence)        │     │
│         │                  │                                │     │
│         │                  │ - readConversationStorageState()│     │
│         │                  │ - writeConversationStorageState()│    │
│         │                  │ - upsertConversationInStorage() │     │
│         │                  │ - removeConversationFromStorage()│    │
│         │                  └───────────────────────────────┘     │
│         │                                                        │
│         └───> activeConversationId (links to current)           │
│                                                                   │
│  ┌────────────────────┐   ┌────────────────────────┐            │
│  │ ArchivedConversation│   │ Storage Limits          │            │
│  │                     │   │                          │            │
│  │ - id               │   │ - MAX_CONVERSATIONS=100 │            │
│  │ - sourceConvId     │   │ - WARN_THRESHOLD=80     │            │
│  │ - archivedAt       │   │ - checkStorageLimits()  │            │
│  └────────────────────┘   └────────────────────────┘            │
└──────────────────────────────────────────────────────────────────┘

Server Filesystem
┌─────────────────────────────────────────────────┐
│ ~/.spec-cat/data/                                │
│ ├── conversations/                               │
│ │   ├── conv-8f3k2m9p0a.json                    │
│ │   ├── conv-x7j4n1q8b2.json                    │
│ │   └── ...                                      │
│ └── archived-conversations.json                  │
└─────────────────────────────────────────────────┘
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
  // 009 persists them but does not manage their values
  worktreePath?: string
  worktreeBranch?: string
  hasWorktree?: boolean
  baseBranch?: string
  providerSessionId?: string
  providerId?: string
  providerModelKey?: string
  featureId?: string
  finalized?: boolean
  previewBranch?: string
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

### 2. ArchivedConversation

Represents a conversation snapshot moved to archive storage.

```typescript
// types/chat.ts

interface ArchivedConversation {
  id: string                        // Unique archive ID (generated)
  sourceConversationId: string      // Original conversation ID
  title: string                     // Title at time of archive
  messages: ChatMessage[]           // Message snapshot
  createdAt: string                 // Original creation timestamp
  updatedAt: string                 // Last update timestamp
  archivedAt: string                // ISO 8601 archive timestamp
  cwd: string                       // Working directory context
  providerId?: string               // Provider used
  providerModelKey?: string         // Model used
  featureId?: string                // Linked feature
  baseBranch?: string               // Base branch at archive time
}
```

---

### 3. StoredConversations (Server State)

The server-side storage state returned by `GET /api/conversations`.

```typescript
interface StoredConversations {
  version: number                   // Schema version for migrations
  conversations: Conversation[]     // Active conversations
  archivedConversations: ArchivedConversation[]  // Archived snapshots
}

// Constants
const STORAGE_VERSION = 1
const MAX_CONVERSATIONS = 100
const WARN_CONVERSATIONS_THRESHOLD = 80
```

**Storage Invariants**:
- `version` must be 1 (current; future migrations handled in server)
- Active `conversations.length` must not exceed `MAX_CONVERSATIONS` (100)
- Each conversation must pass `isValidConversation()` type guard on load
- Each archive must pass `isValidArchivedConversation()` type guard on load

---

### 4. ChatMessage (Inherited from 007)

See `specs/007-ai-provider-chat/data-model.md` for full definition. 009 uses but does not define this type.

```typescript
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
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
  loadConversations(): Promise<void>       // FR-001, FR-002: Load from server
  saveAllConversations(): Promise<void>    // FR-002: Persist all to server (bulk)
  createConversation(options?: {           // FR-002: Create new conversation
    featureId?: string
  }): string
  selectConversation(id: string): void     // FR-003: Load and activate
  deleteConversation(id: string): void     // FR-006: Remove with cleanup
  renameConversation(id: string,           // FR-005: Rename title
    title: string): void

  // Persistence
  saveConversation(id: string,             // FR-009: Debounced save (400ms) via POST /api/conversations/update
    immediate?: boolean): void
  updateConversationTitleIfNeeded(): void   // FR-004: Auto-generate title
  sortConversations(): void                // FR-008: Sort by createdAt desc

  // Limits
  checkStorageLimits(): {                  // FR-002: Enforce 100 limit
    atLimit: boolean
    nearLimit: boolean
    count: number
  }

  // Cross-browser sync
  mergeServerConversations(): Promise<void>  // FR-019: Refresh from server, preserve streaming
  isConversationStreaming(id: string): boolean  // FR-020: Guard for duplicate stream prevention
}
```

---

## Server-Side Storage

### Filesystem Layout

```
~/.spec-cat/data/
├── conversations/                    # Per-conversation JSON files
│   ├── conv-8f3k2m9p0a.json         # Individual conversation
│   └── ...
├── archived-conversations.json       # All archived conversations
└── conversations.json                # Legacy single-file (auto-migrated)
```

### Server Utilities (`server/utils/conversationStore.ts`)

```typescript
// Read all conversations from per-file storage + archives
async function readConversationStorageState(): Promise<StoredConversations>

// Write all conversations (bulk) — removes orphan files
async function writeConversationStorageState(state: StoredConversations): Promise<void>

// Upsert a single conversation file (atomic per-conversation write)
async function upsertConversationInStorage(conversation: unknown, version?: number): Promise<void>

// Remove a single conversation file
async function removeConversationFromStorage(conversationId: string): Promise<void>

// Auto-migrate from legacy conversations.json to per-file (runs on read)
async function migrateLegacyStoreIfNeeded(...): Promise<{...}>
```

### REST API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/conversations` | Read all conversations + archives |
| POST | `/api/conversations` | Bulk write all conversations |
| POST | `/api/conversations/update` | Upsert single conversation |
| POST | `/api/conversations/{id}/archive` | Archive with worktree/branch cleanup |
| GET | `/api/conversations/archives` | List archives (optional `?q=` search) |
| POST | `/api/conversations/archives/{id}/restore` | Restore from archive |
| DELETE | `/api/conversations/archives/{id}` | Delete archive entry |

---

## Client Storage Utility (`utils/conversationStorage.ts`)

Async wrapper over REST API calls. SSR-safe with `typeof window` guards.

```typescript
// Load all conversations and archives from server
async function loadConversations(): Promise<LoadedConversationState>

// Bulk save all conversations to server
async function saveConversations(
  conversations: Conversation[],
  archivedConversations?: ArchivedConversation[]
): Promise<boolean>

// Save a single conversation (per-conversation atomic write)
async function saveConversation(conversation: Conversation): Promise<boolean>

// Clear all conversations
async function clearConversations(): Promise<boolean>
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

function isValidArchivedConversation(obj: unknown): obj is ArchivedConversation {
  if (!obj || typeof obj !== 'object') return false
  const conv = obj as Record<string, unknown>
  return (
    typeof conv.id === 'string' &&
    typeof conv.sourceConversationId === 'string' &&
    typeof conv.title === 'string' &&
    Array.isArray(conv.messages) &&
    typeof conv.archivedAt === 'string'
  )
}
```

---

## Relationships

```
                    Server Filesystem
                         │
                         │ REST API (GET/POST /api/conversations)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                     ChatStore (009 scope)                      │
│                                                                │
│  Conversation[] ◄─── activeConversationId                     │
│       │                                                        │
│       │ CRUD operations (async)                                │
│       │                                                        │
│       ├──► loadConversations() ─── from server via REST API   │
│       ├──► saveConversation() ──── to server (debounced, per-conv) │
│       ├──► createConversation() ── new + save                 │
│       ├──► deleteConversation() ── remove + save              │
│       ├──► renameConversation() ── update title + save        │
│       ├──► selectConversation() ── set active + load messages │
│       └──► mergeServerConversations() ── refresh from server  │
│                                                                │
│  streamingConversations (Set) ── for FR-011 badge             │
│                                                                │
│  ◄──── useGlobalNotifications ──── EventBus/WebSocket         │
│         - conversation_archived → mergeServerConversations()  │
│         - job_created → setup streaming for new conversation  │
└──────────────────────────────────────────────────────────────┘

UI Components:
  ConversationList.vue ──► displays ──► sorted Conversation[]
                       ──► search/filter (debounced 400ms)
                       ──► create/archive/delete actions
  ConversationItem.vue ──► displays ──► single Conversation
                       ──► inline rename (FR-005)
                       ──► streaming animation (FR-011, active/idle)
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
               ├──(message added)──► updatedAt refreshed, auto-save (debounced via API)
               ├──(search)──► filtered in/out of list view
               ├──(archive)──► worktree cleaned up → snapshot created → removed from active
               │
               └──(delete)──► Confirmation modal ──► Removed from store + server

(archived) ──► Archive List
               │
               ├──(restore)──► Moved back to active list
               └──(delete)──► Permanently removed
```

### Storage Limit States

```
0-79 conversations ──► Normal operation
80-99 conversations ──► Warning displayed (WARN_THRESHOLD)
100 conversations ──► Creation blocked, message shown
```

### Cross-Browser Sync Flow

```
Browser A: archive conversation
    │
    ├──► POST /api/conversations/{id}/archive
    │       ├── cleanup worktree + branch
    │       ├── create ArchivedConversation snapshot
    │       └── emit 'conversation_archived' via EventBus
    │
    └──► EventBus ──► GLOBAL_CHANNEL ──► WebSocket
                                            │
                                            ▼
                                     Browser B: useGlobalNotifications
                                            │
                                            ├── check isConversationStreaming() → skip if streaming
                                            └── mergeServerConversations() → remove archived from list
```
