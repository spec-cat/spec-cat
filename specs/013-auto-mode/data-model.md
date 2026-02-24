# Data Model: Auto Mode (013-auto-mode)

**Date**: 2026-02-24
**Phase**: 1 — Design & Contracts

## Entities

### 1. Conversation (Extended)

**Location**: `types/chat.ts`
**Change**: Add `autoMode` field to existing entity

```typescript
export interface Conversation {
  // ... existing fields unchanged ...
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  cwd: string
  providerSessionId?: string
  worktreePath?: string
  worktreeBranch?: string
  hasWorktree?: boolean
  baseBranch?: string
  previewBranch?: string
  featureId?: string

  // NEW — Auto Mode indicator (FR-008)
  autoMode?: boolean            // True if created/used by Auto Mode
}
```

**Validation rules**:
- `autoMode` is optional, defaults to `undefined` (falsy)
- When `autoMode === true`, the conversation was created by Auto Mode
- The `featureId` field is always set for Auto Mode conversations
- Backwards-compatible: existing conversations without `autoMode` work unchanged

**Persistence**: localStorage via `spec-cat-conversations` key (existing mechanism)

---

### 2. AutoModeTask (Existing)

**Location**: `types/autoMode.ts`
**Change**: No change needed — already well-defined

```typescript
export interface AutoModeTask {
  featureId: string
  state: AutoModeTaskState           // 'queued' | 'running' | 'completed' | 'failed' | 'skipped'
  worktreePath?: string
  worktreeBranch?: string
  currentStep?: string               // Current speckit step being executed
  error?: string
  startedAt?: string
  completedAt?: string
}
```

**State transitions**:
```
queued ──→ running ──→ completed
  │           │
  │           └──→ failed
  └──→ skipped (active worktree exists)
```

---

### 3. AutoModeSession (Existing)

**Location**: `types/autoMode.ts`
**Change**: No change needed

```typescript
export interface AutoModeSession {
  id: string                         // Format: "auto-{timestamp}"
  state: AutoModeSessionState        // 'active' | 'stopped' | 'completed' | 'idle'
  tasks: AutoModeTask[]
  startedAt: string                  // ISO 8601
  completedAt?: string               // ISO 8601
}
```

**State transitions**:
```
active ──→ completed (all tasks done)
  │
  └──→ stopped (user disabled Auto Mode)

idle (no specs found — edge case)
```

---

### 4. AutoModeConfig (Extended)

**Location**: `types/autoMode.ts`
**Change**: Add concurrency field

```typescript
export interface AutoModeConfig {
  enabled: boolean
  concurrency: number               // Default: 3 (FR-013, FR-016)
}
```

**Validation rules**:
- `concurrency` must be integer >= 1
- Default: 3
- Persisted in `spec-cat-settings` localStorage key (via settings store)

---

### 5. SettingsStoreState (Extended)

**Location**: `stores/settings.ts`
**Change**: Add `autoModeConcurrency` field

```typescript
interface SettingsStoreState {
  claudeModel: ClaudeModel
  autoModeConcurrency: number        // Default: 3 (FR-016)
  _hydrated: boolean
}
```

**Persistence**: `spec-cat-settings` localStorage key (existing mechanism)
**Usage**: `claudeModel` is the global default model used by all server-side AI calls (chat, auto mode, one-off utilities)

---

### 6. AutoModePersistedSession (New)

**Location**: `types/autoMode.ts`
**Purpose**: Server-side session persistence for page refresh resilience (FR-015)

```typescript
export interface AutoModePersistedSession {
  sessionId: string
  enabled: boolean
  tasks: AutoModeTask[]
  startedAt: string
}
```

**Persistence**: File at `~/.spec-cat/projects/{hash}/auto-mode-session.json` (server-side)
**Lifecycle**: Created when Auto Mode starts, updated on each task state change, deleted when session completes or is stopped.

---

## Relationships

```
┌───────────────┐     featureId      ┌───────────────┐
│  AutoModeTask │─────────────────→│  Conversation  │
│  (server)     │  creates/reuses    │  (client+LS)  │
└───────────────┘                    └───────────────┘
        │                                    │
        │ belongs to                         │ has many
        ▼                                    ▼
┌───────────────┐                    ┌───────────────┐
│AutoModeSession│                    │  ChatMessage   │
│  (server)     │                    │  (client+LS)  │
└───────────────┘                    └───────────────┘
        │
        │ persisted to
        ▼
┌────────────────────┐
│AutoModePersistedSes│
│(~/.spec-cat/projects/  │
│ session.json)      │
└────────────────────┘
```

## Key Design Decisions

1. **Conversation entity extension is minimal**: Only one new optional boolean field (`autoMode`). No separate entity for "auto mode conversations."

2. **Server is source of truth**: The `AutoModeScheduler` manages the processing queue. The client store mirrors state via WebSocket.

3. **Concurrency stored in settings**: The concurrency limit lives in the settings store, not the auto mode store. This keeps settings centralized and follows existing patterns.

4. **Session persistence is server-side**: Since the server processes features, it must persist the session state. The client persists only the `enabled` toggle state.
