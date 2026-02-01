# API Contracts: Auto Mode (009-auto-mode)

**Date**: 2026-02-08

## Existing Endpoints (No Change)

### GET /api/auto-mode/status

Returns current Auto Mode state.

**Response**: `200 OK`
```typescript
{
  enabled: boolean
  session: AutoModeSession | null
}
```

---

## Modified Endpoints

### POST /api/auto-mode/toggle

Toggle Auto Mode on/off. Extended to accept concurrency parameter.

**Request Body**:
```typescript
{
  enabled: boolean
  concurrency?: number    // NEW — concurrent cascade limit (default: 3)
}
```

**Response**: `200 OK`
```typescript
{
  success: boolean
  enabled: boolean
  error?: string
}
```

**Behavior**:
- When `enabled: true`: Starts a new processing cycle with the given concurrency
- When `enabled: false`: Stops queuing new tasks, running tasks complete naturally
- If already in the requested state, returns success without side effects

---

## New Endpoints

### GET /api/settings

Returns current application settings including auto mode concurrency.

**Response**: `200 OK`
```typescript
{
  claudeModel: string
  autoModeConcurrency: number
}
```

**Behavior**:
- `claudeModel` is the global default model used for all server-side AI requests (chat, auto mode, one-off utilities)

**Note**: This endpoint may already exist or may need to be created. The server needs to read client settings for the concurrency value. Alternative: pass concurrency in the toggle request (simpler approach — see research.md R-007).

---

## WebSocket Contracts

### Auto Mode WebSocket: `/auto-mode-ws`

**Direction**: Server → Client (push-only)

**Existing Messages** (unchanged):

#### `auto_mode_status`
```typescript
{
  type: 'auto_mode_status'
  session: AutoModeSession | null
  enabled: boolean
}
```

#### `auto_mode_task_update`
```typescript
{
  type: 'auto_mode_task_update'
  task: AutoModeTask
}
```

#### `auto_mode_error`
```typescript
{
  type: 'auto_mode_error'
  error: string
}
```

No new WebSocket message types needed — the existing contract fully supports all Auto Mode features including concurrent processing status updates.

---

## Internal Contracts (Server-Side)

### AutoModeScheduler (Singleton)

**Existing Methods** (enhanced):

```typescript
class AutoModeScheduler {
  // Existing
  isEnabled(): boolean
  getSession(): AutoModeSession | null
  subscribe(callback: Subscriber): () => void

  // MODIFIED — now accepts concurrency parameter
  toggle(enable: boolean, concurrency?: number): Promise<{ enabled: boolean }>
}
```

### Session Persistence File

**Path**: `~/.spec-cat/projects/{hash}/auto-mode-session.json`
**Format**:
```typescript
{
  sessionId: string
  enabled: boolean
  tasks: AutoModeTask[]
  startedAt: string
}
```

**Lifecycle**:
- Created on `toggle(true)` after feature discovery
- Updated on each task state transition
- Deleted on `toggle(false)` or session completion
- Read on server startup to restore interrupted session

---

## Conversation API Integration

Auto Mode uses existing conversation store methods. No new conversation APIs needed.

**Methods Used**:
- `chatStore.createConversation({ featureId })` — creates conversation with worktree
- `chatStore.findConversationByFeature(featureId)` — reuses existing conversation
- `chatStore.renameConversation(id, title)` — sets descriptive title

**New Field on Conversation**:
```typescript
// Set when creating conversation for Auto Mode
conversation.autoMode = true
```

This field flows through existing persistence — no API changes needed.
