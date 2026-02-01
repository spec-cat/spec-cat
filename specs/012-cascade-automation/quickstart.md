# Quickstart: Cascade Automation

**Feature**: 012-cascade-automation
**Date**: 2026-02-08

## Prerequisites

- Running Spec Cat application (Nuxt 3 dev server)
- At least one feature with `spec.md` in `specs/` directory
- Chat system functional (007-claude-code-chat)
- Conversation management working (009-conversation-management)

## Architecture Overview

Cascade automation is a **client-side orchestration** layer that chains speckit pipeline steps (Plan → Tasks → Implement) within a single conversation. It extends three existing files:

```
composables/useChatStream.ts    → Cascade queue + auto-send logic
stores/chat.ts                  → Conversation lookup by featureId
components/features/FeaturesPanel.vue → Cascade trigger UI
```

No new server endpoints are required.

## Key Files

| File | Changes | FR Coverage |
|------|---------|-------------|
| `composables/useChatStream.ts` | `cascadeStates` Map, `enableCascade()`, `disableCascade()`, `sendCascadeStep()`, auto-send on `'done'` | FR-001, FR-002 |
| `stores/chat.ts` | `findConversationByFeature()`, `createConversation({ featureId })` | FR-003 |
| `components/features/FeaturesPanel.vue` | `CASCADE_STEPS`, `handleCascade()`, Shift+click detection | FR-001, FR-003, FR-004 |
| `components/features/FeatureCard.vue` | Pipeline buttons (Plan, Tasks, Run), cascade event emission | FR-001 |
| `types/chat.ts` | `featureId?: string` on Conversation interface | FR-003 |

## Implementation Steps

### Step 1: Extend Conversation Type

Add `featureId` to the `Conversation` interface:

```typescript
// types/chat.ts
interface Conversation {
  // ... existing fields ...
  featureId?: string    // Links conversation to a Kanban feature
}
```

### Step 2: Add Store Methods

In `stores/chat.ts`:

```typescript
function findConversationByFeature(featureId: string): Conversation | null {
  return conversations.value.find(c => c.featureId === featureId) || null
}

// Extend createConversation to accept featureId
async function createConversation(options?: { featureId?: string }): Promise<string> {
  const conv: Conversation = {
    // ... existing fields ...
    featureId: options?.featureId,
  }
  // ... rest of creation logic ...
}
```

### Step 3: Add Cascade Queue (useChatStream)

```typescript
// Module-level state
const cascadeStates = new Map<string, { queue: string[], featureId: string }>()

function enableCascade(featureId: string, conversationId: string, remainingSteps: string[]) {
  cascadeStates.set(conversationId, { featureId, queue: [...remainingSteps] })
}

function disableCascade(conversationId?: string) {
  if (conversationId) cascadeStates.delete(conversationId)
  else cascadeStates.clear()
}
```

### Step 4: Auto-Send on Completion

In the `'done'` event handler within `useChatStream.ts`:

```typescript
if (response.type === 'done') {
  // ... existing completion logic ...

  const cascade = cascadeStates.get(conversationId)
  if (cascade && cascade.queue.length > 0) {
    const nextStep = cascade.queue.shift()!
    commitPromise.then(() => {
      setTimeout(() => sendCascadeStep(conversationId, cascade.featureId, nextStep), 1500)
    })
    if (cascade.queue.length === 0) cascadeStates.delete(conversationId)
  }
}
```

### Step 5: Trigger from Kanban UI

In `FeaturesPanel.vue`:

```typescript
const CASCADE_STEPS = {
  plan: ['tasks', 'implement'],
  tasks: ['implement'],
  implement: [],
  clarify: [],
}

async function handleCascade(event: MouseEvent, featureId: string, command: string) {
  const forceNew = event.shiftKey
  let conversationId = forceNew ? null : chatStore.findConversationByFeature(featureId)?.id
  if (!conversationId) conversationId = await chatStore.createConversation({ featureId })

  const remaining = CASCADE_STEPS[command] || []
  if (remaining.length > 0) enableCascade(featureId, conversationId, remaining)

  // Send initial step
  await streamMessage(`/speckit.${command} ${featureId}`, ...)
}
```

## Testing

### Manual Test: Full Cascade

1. Navigate to Features panel
2. Click "Plan" on any feature with a spec.md
3. Watch: Plan executes → auto-sends Tasks → auto-sends Implement
4. Verify all three spec files created in the feature's spec directory

### Manual Test: Conversation Reuse

1. Click "Plan" on a feature (creates conversation)
2. Wait for completion
3. Click "Tasks" on the same feature
4. Verify the same conversation is reused (not a new one)

### Manual Test: Force New

1. Click "Plan" on a feature (creates conversation)
2. Shift+click "Plan" on the same feature
3. Verify a new conversation is created
