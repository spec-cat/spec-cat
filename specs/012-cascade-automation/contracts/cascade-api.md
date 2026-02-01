# API Contracts: Cascade Automation

**Feature**: 012-cascade-automation
**Date**: 2026-02-08

## Overview

Cascade automation does NOT introduce new REST API endpoints. It orchestrates existing APIs through client-side composables. This document defines the client-side function contracts and WebSocket message extensions.

---

## Client-Side Contracts

### 1. Store: `findConversationByFeature`

```typescript
// stores/chat.ts

/**
 * Find an existing conversation linked to a feature.
 * Returns the first match (most recent, since conversations are prepended).
 */
function findConversationByFeature(featureId: string): Conversation | null
```

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| featureId | string | Yes | Feature directory name (e.g., '004-spec-viewer') |

**Returns**: `Conversation | null` — The matching conversation, or null if none exists.

**Behavior**:
- Searches `conversations` array for first match where `c.featureId === featureId`
- Does NOT check streaming state (caller is responsible)

---

### 2. Store: `createConversation` (Extended)

```typescript
// stores/chat.ts

/**
 * Create a new conversation, optionally linking to a feature.
 * Creates an isolated worktree and sets the conversation as active.
 */
async function createConversation(options?: {
  featureId?: string
}): Promise<string>
```

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| options.featureId | string | No | Feature to link this conversation to |

**Returns**: `string` — The new conversation ID.

**Side Effects**:
- Creates git worktree via `POST /api/chat/worktree`
- Adds conversation to store (prepended)
- Sets `activeConversationId`
- Saves to localStorage

---

### 3. Composable: `enableCascade`

```typescript
// composables/useChatStream.ts

/**
 * Set up cascade queue for a conversation.
 * Called before sending the initial pipeline step.
 */
function enableCascade(
  featureId: string,
  conversationId: string,
  remainingSteps: string[]
): void
```

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| featureId | string | Yes | Feature being cascaded |
| conversationId | string | Yes | Conversation to cascade in |
| remainingSteps | string[] | Yes | Steps to auto-execute after initial step |

**Side Effects**:
- Adds entry to `cascadeStates` Map

---

### 4. Composable: `disableCascade`

```typescript
// composables/useChatStream.ts

/**
 * Clear cascade queue. Called on error, abort, or completion.
 */
function disableCascade(conversationId?: string): void
```

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| conversationId | string | No | Specific conversation to clear. If omitted, clears all. |

---

### 5. Composable: `sendCascadeStep`

```typescript
// composables/useChatStream.ts

/**
 * Auto-send the next pipeline step in a cascade.
 * Called internally after a 'done' event when cascade queue is non-empty.
 */
async function sendCascadeStep(
  conversationId: string,
  featureId: string,
  step: string
): Promise<void>
```

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| conversationId | string | Yes | Target conversation |
| featureId | string | Yes | Feature being cascaded |
| step | string | Yes | Speckit step name (e.g., 'tasks', 'implement') |

**Behavior**:
1. Selects conversation if not active
2. Adds user message: `/speckit.{step} {featureId}`
3. Creates assistant message placeholder
4. Starts new session (context reset for speckit commands)
5. Sends message via WebSocket with worktree/feature context

---

### 6. Component: `handleCascade`

```typescript
// components/features/FeaturesPanel.vue

/**
 * Orchestrates cascade trigger from Kanban UI.
 * Entry point for all pipeline button clicks.
 */
async function handleCascade(
  event: MouseEvent,
  featureId: string,
  command: string
): Promise<void>
```

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| event | MouseEvent | Yes | Click event (checked for Shift key) |
| featureId | string | Yes | Feature to cascade |
| command | string | Yes | Initial step: 'plan', 'tasks', 'implement', 'clarify' |

**Behavior**:
1. `event.shiftKey` → force-new conversation
2. If not forced, search for existing conversation via `findConversationByFeature()`
3. Skip reuse if conversation is currently streaming
4. Create new conversation if needed (with `featureId`)
5. Rename conversation to `{command}: {featureId}`
6. Enable cascade with `CASCADE_STEPS[command]`
7. Send initial command via WebSocket

---

## WebSocket Message Extensions

### Outbound (Client → Server)

The cascade reuses the existing chat message format with cascade-specific fields:

```typescript
interface CascadeChatMessage {
  type: 'chat'
  message: string              // e.g., '/speckit.plan 004-spec-viewer'
  sessionId?: string           // null for speckit commands (context reset)
  conversationId: string
  permissionMode: PermissionMode
  cwd?: string                 // Worktree path
  worktreeBranch?: string      // Feature branch
  featureId?: string           // Feature ID for spec context injection
  contextReset?: boolean       // true for /speckit.* commands
}
```

### Inbound (Server → Client) — Cascade-Relevant Events

```typescript
// 'done' event triggers cascade progression
{ type: 'done', requestId: string }

// 'error' event disables cascade
{ type: 'error', error: string }

// 'permission_request' pauses cascade until resolved
{ type: 'permission_request', tool: string, tools: string[], description: string }
```

---

## Existing API Endpoints Used by Cascade

| Endpoint | Method | Purpose in Cascade |
|----------|--------|--------------------|
| `/api/chat/worktree` | POST | Create worktree at cascade start |
| `/api/chat/worktree-commit` | POST | Auto-commit after each step completes |
| `/api/chat/preview-sync` | POST | Sync preview branch if active |
| `/api/specs/features` | GET | Load feature list for Kanban UI |
| `/_ws` | WebSocket | Stream chat messages for each step |
