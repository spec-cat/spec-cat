# Implementation Plan: Cascade Automation

**Branch**: `012-cascade-automation` | **Date**: 2026-02-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/012-cascade-automation/spec.md`

## Summary

Cascade automation enables developers to trigger speckit pipeline steps (Plan → Tasks → Implement) from the Kanban feature list, with automatic step chaining on completion. The system reuses existing conversations by `featureId`, supports force-new via Shift+click, and queues subsequent steps in an in-memory cascade state that auto-sends on each `'done'` event.

## Technical Context

**Language/Version**: TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+)
**Primary Dependencies**: Pinia (v2.2+), @heroicons/vue, Tailwind CSS, WebSocket (built-in)
**Storage**: localStorage (`spec-cat-conversations` key — extends existing conversation persistence)
**Testing**: Manual testing (per CLAUDE.md project rules)
**Target Platform**: Web browser (Nuxt 3 SPA/SSR)
**Project Type**: Web application (Nuxt 3 fullstack)
**Performance Goals**: N/A — cascade is sequential, one step at a time
**Constraints**: Max 100 conversations (existing limit), 1.5s delay between cascade steps
**Scale/Scope**: Single-user developer tool, ~4 pipeline steps per cascade

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No constitution file exists (`.speckit/memory/constitution.md` not found). No gates to enforce.

**Post-Phase 1 Re-check**: Design introduces no new server endpoints, no new storage, no new dependencies. All changes extend existing modules minimally. No violations to report.

## FR Coverage Matrix

| FR | Requirement | Implementation | Files |
|----|-------------|----------------|-------|
| FR-001 | Cascade from Kanban (Plan → Tasks → Implement) | `CASCADE_STEPS` config + `handleCascade()` + auto-send on `'done'` | FeaturesPanel.vue, useChatStream.ts |
| FR-002 | Queue subsequent steps, auto-send on completion | `cascadeStates` Map + `'done'` event handler + `sendCascadeStep()` | useChatStream.ts |
| FR-003 | Reuse existing conversation by featureId | `findConversationByFeature()` + `featureId` field on Conversation | stores/chat.ts, types/chat.ts |
| FR-004 | Force-new conversation via Shift+click | `event.shiftKey` check in `handleCascade()` | FeaturesPanel.vue |

## Project Structure

### Documentation (this feature)

```text
specs/012-cascade-automation/
├── plan.md              # This file
├── research.md          # Phase 0: Design decisions
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Implementation guide
├── contracts/
│   └── cascade-api.md   # Phase 1: Function contracts
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
types/
└── chat.ts                    # Conversation.featureId extension

stores/
└── chat.ts                    # findConversationByFeature(), createConversation({ featureId })

composables/
└── useChatStream.ts           # cascadeStates, enableCascade, disableCascade, sendCascadeStep

components/features/
├── FeaturesPanel.vue          # CASCADE_STEPS, handleCascade(), cascade trigger UI
└── FeatureCard.vue            # Pipeline buttons (Plan, Tasks, Run)
```

**Structure Decision**: This feature extends the existing Nuxt 3 web application structure. No new directories or modules are needed — all changes are additions to existing files in `types/`, `stores/`, `composables/`, and `components/features/`.

## Design Decisions

### D1: In-Memory Cascade Queue (not persisted)

The cascade queue (`cascadeStates` Map) is stored at module-level in `useChatStream.ts` and is NOT persisted to localStorage or server. Rationale: if the page reloads or WebSocket disconnects, streaming context is already lost; persisting the queue would create stale state.

### D2: Context Reset per Speckit Step

Each `/speckit.*` command clears the `providerSessionId`, starting a fresh provider session. This prevents plan context from polluting task generation, or task context from polluting implementation.

### D3: Auto-Commit Between Steps

After each cascade step completes, `worktree-commit` is called before the next step starts (with a 1.5s delay). This ensures each step's output is committed as a checkpoint and available to the next step.

### D4: Error Stops Cascade

Any error (WebSocket error, permission denial, abort) immediately disables the cascade by clearing the queue. No auto-retry — the user inspects the error and manually restarts from the appropriate step.

### D5: First-Match Conversation Reuse

`findConversationByFeature()` returns the first matching conversation. Since conversations are prepended, this is the most recent one. Streaming conversations are excluded from reuse to avoid queueing conflicts.

## Complexity Tracking

No constitution violations to track. The implementation is minimal:
- 1 new type field (`featureId`)
- 1 new store method (`findConversationByFeature`)
- 1 extended store method (`createConversation`)
- 1 new composable state (`cascadeStates`)
- 3 new composable functions (`enableCascade`, `disableCascade`, `sendCascadeStep`)
- 1 new component method (`handleCascade`)
- 1 static config (`CASCADE_STEPS`)
