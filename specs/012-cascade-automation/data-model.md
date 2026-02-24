# Data Model: Cascade Automation

**Feature**: 012-cascade-automation
**Date**: 2026-02-08
**Extends**: `specs/007-ai-provider-chat/data-model.md`

## Entity Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Cascade System                                       │
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐   │
│  │   Feature        │    │  CascadeState    │    │   Conversation       │   │
│  │   (from Kanban)  │    │  (runtime only)  │    │   (extended)         │   │
│  │                  │    │                  │    │                      │   │
│  │ - id             │◄──►│ - featureId      │───►│ - featureId?         │   │
│  │ - name           │    │ - queue[]        │    │ - (all base fields)  │   │
│  │ - hasSpec        │    │                  │    │                      │   │
│  │ - hasPlan        │    └──────────────────┘    └──────────────────────┘   │
│  │ - hasTasks       │                                                       │
│  │ - files[]        │    ┌──────────────────┐                               │
│  └──────────────────┘    │  CASCADE_STEPS   │                               │
│                          │  (static config) │                               │
│                          │                  │                               │
│                          │  plan → [tasks,  │                               │
│                          │         implement]│                               │
│                          │  tasks → [impl]  │                               │
│                          │  implement → []  │                               │
│                          │  clarify → []    │                               │
│                          └──────────────────┘                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Entities

### 1. CascadeState (NEW — runtime only)

Represents the queue of pending pipeline steps for an active cascade within a conversation.

```typescript
// composables/useChatStream.ts (module-level)

interface CascadeState {
  featureId: string       // Feature being cascaded
  queue: string[]         // Remaining steps to execute (e.g., ['tasks', 'implement'])
}

// Storage: Map<conversationId, CascadeState>
const cascadeStates = new Map<string, CascadeState>()
```

**Validation Rules**:
- `featureId`: Required, must match a valid feature directory in `specs/`
- `queue`: Required, array of valid step names. Valid steps: `'plan'`, `'tasks'`, `'implement'`, `'clarify'`
- Map key (conversationId): Must correspond to an existing conversation

**Lifecycle**:
```
Created:   enableCascade(featureId, conversationId, remainingSteps)
Updated:   queue.shift() on each 'done' event (auto-consumed)
Deleted:   - queue exhausted (all steps complete)
           - error during streaming
           - permission denied
           - user abort
           - WebSocket disconnect
           - disableCascade() called
```

**NOT persisted**: Runtime-only. Lost on page refresh or WebSocket disconnect.

---

### 2. Conversation Extension (MODIFIED)

The `Conversation` entity from `007-ai-provider-chat/data-model.md` is extended with:

```typescript
interface Conversation {
  // ... all existing fields from 007 ...

  featureId?: string      // NEW: Links conversation to a Kanban feature
                          // Set at creation time when cascade is triggered
                          // Persisted to localStorage
}
```

**Validation Rules**:
- `featureId`: Optional string. When present, must match a feature directory name (e.g., `'004-spec-viewer'`)
- Multiple conversations can share the same `featureId` (e.g., after Shift+click creates a new one)
- `findConversationByFeature()` returns the first match (most recent, since conversations are prepended)

---

### 3. CASCADE_STEPS (Static Configuration)

Defines the pipeline progression for each starting step.

```typescript
// components/features/FeaturesPanel.vue

const CASCADE_STEPS: Record<string, string[]> = {
  plan:      ['tasks', 'implement'],   // Plan → Tasks → Implement
  tasks:     ['implement'],            // Tasks → Implement
  implement: [],                       // Terminal step
  clarify:   [],                       // Terminal step (no cascade)
}
```

**Invariants**:
- Each key must be a valid speckit command name
- Values are ordered arrays — steps execute left to right
- Terminal steps have empty arrays (no subsequent steps)

---

### 4. Feature (Referenced — from 004-spec-viewer)

The Kanban feature entity that triggers cascade.

```typescript
// types/spec-viewer.ts

interface Feature {
  id: string              // Directory name (e.g., '012-cascade-automation')
  name: string            // Display name from spec.md heading
  files: SpecFile[]       // Available markdown files
  hasSpec: boolean         // spec.md exists
  hasPlan: boolean         // plan.md exists
  hasTasks: boolean        // tasks.md exists
}
```

**Relationship to cascade**: `Feature.id` is used as `featureId` in `CascadeState` and `Conversation`.

---

## State Transitions

### Cascade Lifecycle

```
                    enableCascade()
[No Cascade] ──────────────────────────► [Cascading]
                                              │
                                    ┌─────────┤
                                    │         │
                              'done' event    │
                              queue.shift()   │
                                    │         │
                              ┌─────▼─────┐   │
                              │ Has more  │   │
                              │ steps?    │   │
                              └─────┬─────┘   │
                                    │         │
                              Yes   │   No    │
                                    │         │
                              ┌─────▼──┐  ┌───▼────────┐
                              │ Send   │  │ [Complete]  │
                              │ next   │  │ cascade     │
                              │ step   │  │ deleted     │
                              └────────┘  └────────────┘

                              On error/abort/disconnect:
                              ──────────────► [Disabled]
                                              cascade deleted
```

### Pipeline Button State

```
Feature State          Available Buttons
─────────────          ─────────────────
hasSpec: true          [Clarify] [Plan]
hasPlan: true          [Clarify] [Plan] [Tasks]
hasTasks: true         [Clarify] [Plan] [Tasks] [Run/Implement]
```

---

## Relationships

```
Feature (004-kanban)
    │
    │ Feature.id = Conversation.featureId
    │
    ├──► Conversation (localStorage)
    │    │
    │    │ Conversation.id = cascadeStates key
    │    │
    │    └──► CascadeState (runtime Map)
    │         │
    │         │ CascadeState.queue[0] → next step
    │         │
    │         └──► sendCascadeStep() → WebSocket → Provider CLI
    │
    └──► CASCADE_STEPS (static) → determines queue contents

Flow:
  FeaturesPanel → handleCascade(event, featureId, command)
       │
       ├─ findConversationByFeature(featureId) OR createConversation({ featureId })
       ├─ enableCascade(featureId, conversationId, CASCADE_STEPS[command])
       └─ sendMessage(`/speckit.${command} ${featureId}`)
            │
            └─ On 'done' → auto-commit → sendCascadeStep() (next in queue)
```
