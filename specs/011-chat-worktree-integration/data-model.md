# Data Model: Chat Worktree Integration

**Feature**: 011-chat-worktree-integration
**Date**: 2026-02-08
**Extends**: [007-ai-provider-chat/data-model.md](../007-ai-provider-chat/data-model.md)

## Entity Overview

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              ChatStore (extended)                                │
│                                                                                  │
│  ┌──────────────────────────┐  ┌────────────────┐  ┌────────────────────────┐   │
│  │ Conversation (extended)  │  │  PreviewState   │  │ ConversationStreamState│   │
│  │ (persisted)              │  │  (runtime only) │  │ (runtime only, per-conv│   │
│  │                          │  │                 │  │  in streamingConvs Map)│   │
│  │ + worktreePath?          │  │ previewingConv  │  │                        │   │
│  │ + worktreeBranch?        │  │   Id: string|   │  │ - sessionId?           │   │
│  │ + hasWorktree?           │  │         null    │  │ - streaming: boolean   │   │
│  │ + baseBranch?            │  │                 │  │ - error?: string       │   │
│  │ + previewBranch?         │  └────────────────┘  │ - pendingPermission?   │   │
│  │ + featureId?             │                       └────────────────────────┘   │
│  │ + finalized?             │                                                    │
│  └──────────────────────────┘                                                    │
│          │                                                                       │
│          └─── activeConversationId                                               │
│          └─── previewingConversationId (global singleton, runtime)               │
│          └─── streamingConversations: Set<string> (runtime)                      │
│          └─── conversationStreamStates: Map<string, ...> (runtime)               │
│          └─── conflictState (runtime, for rebase resolution)                     │
└──────────────────────────────────────────────────────────────────────────────────┘

Filesystem
┌──────────────────────────────────────────────┐
│ /tmp/sc-{conversationId}/                     │  ← Worktree directory
│   (full git working tree with own .git link)  │
│                                               │
│ Git refs:                                     │
│   sc/{conversationId}     ← Working branch    │
│   sc/preview   ← Preview branch    │
│   {featureId}             ← Feature branch    │
└──────────────────────────────────────────────┘
```

---

## Extended Entities

### 1. Conversation (Extended with Worktree Fields)

Extends the base Conversation from 007-ai-provider-chat with worktree lifecycle fields.

```typescript
// types/chat.ts — extended fields

interface Conversation {
  // --- Base fields (from 007-ai-provider-chat) ---
  id: string                      // Unique conversation ID
  title: string                   // Display title
  messages: ChatMessage[]         // All messages
  createdAt: string               // ISO 8601
  updatedAt: string               // ISO 8601
  cwd: string                     // Working directory context
  providerSessionId?: string      // For session resumption

  // --- Worktree fields (011-chat-worktree-integration) ---
  worktreePath?: string           // e.g., /tmp/sc-conv-8f3k2m9p0a
  worktreeBranch?: string         // e.g., sc/conv-8f3k2m9p0a or 001-auth
  hasWorktree?: boolean           // Whether worktree has been created
  baseBranch?: string             // Branch at worktree creation time (e.g., main)
  previewBranch?: string          // Preview branch name (e.g., sc/preview)
  featureId?: string              // Associated feature ID (e.g., "001-auth")
  finalized?: boolean             // True after successful finalize (read-only)
  autoMode?: boolean              // Created by Auto Mode (013-auto-mode)
}
```

**Validation Rules**:
- `worktreePath`: Must start with `/tmp/sc-` if present. Auto-set by server on worktree creation.
- `worktreeBranch`: Set by server. For feature conversations: `{featureId}`. For regular: `sc/{conversationId}`.
- `hasWorktree`: Set to `true` after successful worktree creation. Never set back to `false` (worktree may be recoverable).
- `baseBranch`: Captured at worktree creation time. Used for rebase and finalize operations.
- `previewBranch`: Set when preview is created (`sc/preview`). Cleared when preview ends.
- `featureId`: Set at conversation creation time for feature-originated conversations.
- `finalized`: Set to `true` after successful finalize. Makes conversation read-only (no further messages).

**Persistence**: All worktree fields are persisted to localStorage as part of the Conversation object.

---

### 2. Branch Naming Conventions

```typescript
// Branch naming patterns

// Regular conversation worktree branch
const worktreeBranch = `sc/${conversationId}`
// Example: sc/conv-8f3k2m9p0a

// Feature-originated worktree branch
const worktreeBranch = featureId
// Example: 001-auth

// Preview branch (temporary)
const previewBranch = `sc/preview`
// Example: sc/preview
```

---

### 3. Worktree Path Conventions

```typescript
// Worktree directory paths

// Regular conversation
const worktreePath = `/tmp/sc-${conversationId}`
// Example: /tmp/sc-conv-8f3k2m9p0a

// Feature-originated conversation
const worktreePath = `/tmp/sc-${featureId}-${conversationId}`
// Example: /tmp/sc-001-auth-conv-8f3k2m9p0a
```

---

### 4. PreviewState (Global Singleton)

Tracks which conversation is currently being previewed. Runtime-only (not persisted).

```typescript
// stores/chat.ts

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
- At most one conversation can be previewed at a time
- When set, the referenced conversation must have `previewBranch` defined
- On finalize/delete of previewing conversation, must be cleared first
- Not persisted — preview is transient (main worktree returns to base on restart)

**State Transitions**:
```
null ──(preview A)──> A
A ──(toggle A)──> null          (end preview, return to baseBranch)
A ──(preview B)──> B            (atomic switch: unpreview A, preview B)
A ──(finalize A)──> null        (auto-cleanup)
A ──(delete A)──> null          (auto-cleanup)
```

---

### 5. ConversationStreamState (Per-Conversation Runtime)

Tracks streaming state for each conversation independently (FR-015).

```typescript
// stores/chat.ts

interface ConversationStreamState {
  sessionId?: string              // Claude session ID for resumption
  streaming: boolean              // Currently receiving streaming data
  error?: string                  // Last error message
  pendingPermission?: PermissionRequest  // Waiting for user permission
}

// Module-level state
const streamingConversations = ref(new Set<string>())
const conversationStreamStates = reactive(new Map<string, ConversationStreamState>())
```

---

### 6. FinalizeRequest / FinalizeResponse

```typescript
// types/chat.ts

interface FinalizeRequest {
  conversationId: string
  commitMessage: string
  baseBranch?: string             // Auto-detected from main/master if not provided
  worktreePath?: string           // Defaults to /tmp/sc-{conversationId}; feature-originated: /tmp/sc-{featureId}-{conversationId}
  worktreeBranch?: string         // Defaults to sc/{conversationId}; feature-originated: {featureId}
}

interface FinalizeResponse {
  success: boolean
  error?: string
  conflictFiles?: string[]        // Files with rebase conflicts
  newCommit?: string              // Hash of the squashed commit (on success)
  rebaseInProgress?: boolean      // True if rebase paused for conflict resolution
}
```

---

### 7. ConflictState (Runtime, for Rebase Resolution)

```typescript
// stores/chat.ts

interface ConflictState {
  conversationId: string
  worktreePath: string
  worktreeBranch: string
  baseBranch: string
  conflictFiles: string[]
  resolvedFiles: string[]
  mode: 'finalize' | 'sync'      // Determines continue endpoint
}
```

---

### 8. Worktree Recovery

Recovery occurs when `/tmp` is wiped (e.g., system restart) but git branches persist.

```typescript
// server/utils/ensureChatWorktree.ts

async function ensureChatWorktree(
  projectDir: string,
  worktreePath: string,
  knownBranch?: string
): Promise<void>
```

**Recovery Flow**:
1. Check if `worktreePath` starts with `/tmp/sc-`
2. If directory exists → no recovery needed, return
3. Derive branch name from path (or use `knownBranch`)
4. Run `git worktree prune` to clear stale entries
5. Verify branch exists: `git rev-parse --verify <branch>`
6. Recreate worktree: `git worktree add <path> <branch>` (no `-b`)
7. Send `worktree_recovered` event to client via WebSocket

---

### 9. Session Recovery (FR-009)

When a Claude session is corrupted (e.g., server crash during streaming), the WebSocket handler detects the failure and retries without the `--resume` flag.

```typescript
// WebSocket event
interface SessionResetEvent {
  type: 'session_reset'
  data: {
    conversationId: string
    reason: string                // e.g., "session_corrupted"
  }
}
```

**Client handling**: On `session_reset`, the composable clears the stored `providerSessionId` and sends the last user message again as a fresh session.

---

## Conversation Lifecycle State Machine

```
                    ┌──────────┐
                    │  Created  │  (createConversation)
                    └─────┬────┘
                          │ first message sent
                          ▼
                    ┌──────────┐
                    │  Active   │  (worktree created on first change)
                    └─────┬────┘
                          │
               ┌──────────┼──────────┐
               │          │          │
               ▼          ▼          ▼
          ┌─────────┐ ┌────────┐ ┌─────────┐
          │Previewing│ │Streaming│ │  Idle   │
          └─────────┘ └────────┘ └─────────┘
               │          │          │
               │          │ (auto-commit + preview-sync)
               │          │          │
               └──────────┼──────────┘
                          │
                          ▼
                    ┌──────────┐
                    │ Finalize  │  (squash + rebase)
                    └─────┬────┘
                          │
               ┌──────────┴──────────┐
               │                     │
               ▼                     ▼
          ┌─────────┐          ┌──────────┐
          │Finalized │          │ Conflict  │
          │(read-only)│         │(preserved)│
          └─────────┘          └──────────┘
                                     │
                                     │ resolve or retry
                                     ▼
                               ┌──────────┐
                               │ Finalized │
                               └──────────┘
```

---

## Relationships Diagram

```
localStorage                  Git Repository (filesystem)
     │                              │
     │ persists                     │ stores
     ▼                              ▼
┌────────────────┐          ┌───────────────────┐
│ Conversation   │──────────│ Worktree          │
│ (client state) │ creates/ │ /tmp/sc-{id}/     │
│                │ recovers │                   │
│ .worktreePath ─┤──────────│ .git (link)       │
│ .worktreeBranch├──────────│ branch: sc/{id}   │
│ .baseBranch   ─┤──────────│ base: main        │
│ .previewBranch ├──────────│ preview: sc/preview│
└────────────────┘          └───────────────────┘
        │                           │
        │ references                │ checkout in
        ▼                           ▼
┌────────────────┐          ┌───────────────────┐
│ PreviewState   │──────────│ Main Worktree     │
│ (runtime)      │ checks   │ (user's workspace)│
│                │ out in   │                   │
│ .previewingId  │          │ HEAD → sc/preview  │
└────────────────┘          └───────────────────┘
        │
        │ drives UI
        ▼
┌────────────────┐
│ ConversationItem│
│ (eye icon)      │
└────────────────┘

Server APIs:
  POST /api/chat/worktree       → creates Worktree + branch
  DELETE /api/chat/worktree     → removes Worktree + branch
  POST /api/chat/worktree-commit → git add -A && git commit in Worktree
  POST /api/chat/preview        → creates preview branch, checkout in Main
  DELETE /api/chat/preview      → removes preview branch, checkout base in Main
  POST /api/chat/preview-sync   → update-ref preview to Worktree HEAD
  POST /api/chat/finalize       → squash + rebase + update base + cleanup
```

---

## Type Guards

```typescript
// types/chat.ts

function hasWorktree(conv: Conversation): conv is Conversation & {
  worktreePath: string
  worktreeBranch: string
  hasWorktree: true
  baseBranch: string
} {
  return conv.hasWorktree === true &&
    typeof conv.worktreePath === 'string' &&
    typeof conv.worktreeBranch === 'string' &&
    typeof conv.baseBranch === 'string'
}

function isFinalized(conv: Conversation): boolean {
  return conv.finalized === true
}

function isFeatureConversation(conv: Conversation): conv is Conversation & {
  featureId: string
} {
  return typeof conv.featureId === 'string' && conv.featureId.length > 0
}

function isFinalizeConflict(resp: FinalizeResponse): resp is FinalizeResponse & {
  success: false
  conflictFiles: string[]
  rebaseInProgress: true
} {
  return !resp.success &&
    Array.isArray(resp.conflictFiles) &&
    resp.rebaseInProgress === true
}
```
