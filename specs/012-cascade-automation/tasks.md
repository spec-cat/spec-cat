# Tasks: Cascade Automation

**Input**: Design documents from `/specs/012-cascade-automation/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: No tests requested — manual testing per CLAUDE.md project rules.

**Organization**: This feature has a single user story (US1 - Cascade Automation, P2). Tasks are organized by implementation layer: types → store → composable → components.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No project setup needed — this feature extends existing files only. No new directories, dependencies, or configuration required.

- [x] T001 Verify existing dependencies and baseline files exist (types/chat.ts, stores/chat.ts, composables/useChatStream.ts, components/features/FeaturesPanel.vue, components/features/FeatureCard.vue)

**Checkpoint**: All target files confirmed present and functional

---

## Phase 2: Foundational (Type & Store Layer)

**Purpose**: Extend core types and store methods that cascade components depend on. MUST complete before UI and composable work.

- [x] T002 [P] [FR-003] Add optional `featureId?: string` field to `Conversation` interface in types/chat.ts
- [x] T003 [P] [FR-003] Add `isFeatureConversation()` type guard function in types/chat.ts
- [x] T004 [FR-003] Implement `findConversationByFeature(featureId: string)` method in stores/chat.ts
- [x] T005 [FR-003] Extend `createConversation()` to accept optional `{ featureId?: string }` parameter and set field on new conversation in stores/chat.ts

**Checkpoint**: Conversation-feature association working — conversations can be created with featureId and found by feature

---

## Phase 3: User Story 1 — Cascade Automation (Priority: P2)

**Goal**: Enable developers to trigger speckit pipeline steps (Plan → Tasks → Implement) from the Kanban feature list, with automatic step chaining on completion, conversation reuse by featureId, and force-new via Shift+click.

**Independent Test**: Click "Plan" on a feature in the Features panel → observe auto-cascade through Tasks → Implement. Click a pipeline button on a feature with an existing conversation → verify same conversation is reused. Shift+click → verify new conversation is forced.

### Cascade Queue & Auto-Send (composables/useChatStream.ts)

- [x] T006 [US1] Define `CascadeState` interface with `featureId: string` and `queue: string[]` in composables/useChatStream.ts [FR-002]
- [x] T007 [US1] Create module-level `cascadeStates` Map<conversationId, CascadeState> in composables/useChatStream.ts [FR-002]
- [x] T008 [P] [US1] Implement `enableCascade(featureId, conversationId, remainingSteps)` function in composables/useChatStream.ts [FR-002]
- [x] T009 [P] [US1] Implement `disableCascade(conversationId?)` function — clear specific or all cascade queues in composables/useChatStream.ts [FR-002]
- [x] T010 [US1] Implement `sendCascadeStep(conversationId, featureId, step)` — select conversation, add user message `/speckit.{step} {featureId}`, create assistant placeholder, reset providerSessionId, send via WebSocket with worktree/feature context in composables/useChatStream.ts [FR-001, FR-002]
- [x] T011 [US1] Integrate cascade auto-send in 'done' event handler — after auto-commit completes, check cascadeStates, shift next step, send after 1.5s delay in composables/useChatStream.ts [FR-001, FR-002]
- [x] T012 [US1] Add cascade teardown on error/abort/disconnect — call `disableCascade()` on WebSocket error, PTY exit error, permission denial, and user abort in composables/useChatStream.ts [FR-002]
- [x] T013 [US1] Export `enableCascade`, `disableCascade`, and `sendCascadeStep` from `useChatStream()` return object in composables/useChatStream.ts [FR-001, FR-002]

### Cascade Trigger UI (components/features/)

- [x] T014 [P] [US1] Define `CASCADE_STEPS` static configuration mapping step names to remaining steps (plan→[tasks,implement], tasks→[implement], implement→[], clarify→[]) in components/features/FeaturesPanel.vue [FR-001]
- [x] T015 [US1] Implement `handleCascade(event, featureId, command)` — detect Shift+click for force-new, find/reuse or create conversation with featureId, enable cascade queue, send initial `/speckit.{command} {featureId}` message in components/features/FeaturesPanel.vue [FR-001, FR-003, FR-004]
- [x] T016 [P] [US1] Add pipeline buttons (Clarify, Plan, Tasks, Run) to FeatureCard.vue — conditionally show based on feature.hasSpec/hasPlan/hasTasks, emit `cascade` event with MouseEvent, featureId, command in components/features/FeatureCard.vue [FR-001]
- [x] T017 [US1] Wire FeatureCard `cascade` event to `handleCascade()` in FeaturesPanel.vue template in components/features/FeaturesPanel.vue [FR-001]

**Checkpoint**: Full cascade pipeline works — click Plan on a feature → auto-cascades through Tasks → Implement. Existing conversations reused. Shift+click forces new.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Edge case handling and UI improvements

- [x] T018 Skip conversation reuse when target conversation is currently streaming (check `isConversationStreaming()` before reuse) in components/features/FeaturesPanel.vue
- [x] T019 Add Shift+click tooltip hint on pipeline buttons in components/features/FeatureCard.vue
- [x] T020 Rename conversation to `{command}: {featureId}` when cascade starts in components/features/FeaturesPanel.vue
- [x] T021 Run quickstart.md manual test scenarios: full cascade, conversation reuse, force-new conversation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — verification only
- **Foundational (Phase 2)**: Depends on Phase 1 — types and store methods BLOCK composable and UI work
- **User Story 1 (Phase 3)**: Depends on Phase 2 — cascade queue needs store methods, UI needs cascade functions
- **Polish (Phase 4)**: Depends on Phase 3 — edge cases require core cascade to be working

### Within User Story 1

- T006, T007 (CascadeState definition) → T008, T009 (enable/disable) → T010 (sendCascadeStep) → T011 (auto-send integration) → T012 (error teardown) → T013 (exports)
- T014 (CASCADE_STEPS config) and T016 (FeatureCard buttons) can run in parallel with composable tasks
- T015 (handleCascade) depends on T004, T005 (store methods) AND T008, T013 (composable exports)
- T017 (wiring) depends on T015 and T016

### User Story Dependencies

- **US1** is the only user story — no inter-story dependencies

### Parallel Opportunities

- T002 + T003 (type extensions) can run in parallel
- T008 + T009 (enable/disable cascade) can run in parallel
- T014 + T016 (CASCADE_STEPS config + FeatureCard buttons) can run in parallel with composable work
- T018 + T019 (polish tasks) can run in parallel

---

## Parallel Example: User Story 1

```bash
# After Phase 2 foundational is complete:

# Parallel track A (composable):
Task: T006 "Define CascadeState interface in composables/useChatStream.ts"
Task: T007 "Create cascadeStates Map in composables/useChatStream.ts"
# Then sequential: T008/T009 → T010 → T011 → T012 → T013

# Parallel track B (components — can start immediately):
Task: T014 "Define CASCADE_STEPS in components/features/FeaturesPanel.vue"
Task: T016 "Add pipeline buttons in components/features/FeatureCard.vue"
# Then T015 (after composable exports ready) → T017
```

---

## FR Coverage Matrix

| FR | Requirement | Tasks |
|----|-------------|-------|
| FR-001 | Cascade from Kanban (Plan → Tasks → Implement) | T010, T011, T014, T015, T016, T017 |
| FR-002 | Queue subsequent steps, auto-send on completion | T006, T007, T008, T009, T010, T011, T012, T013 |
| FR-003 | Reuse existing conversation by featureId | T002, T003, T004, T005, T015 |
| FR-004 | Force-new conversation via Shift+click | T015 |

---

## Implementation Strategy

### MVP First (Full User Story 1)

1. Complete Phase 1: Setup (verify files)
2. Complete Phase 2: Foundational (type + store extensions)
3. Complete Phase 3: User Story 1 — cascade queue, auto-send, trigger UI
4. **STOP and VALIDATE**: Run quickstart.md manual tests
5. Complete Phase 4: Polish edge cases

### Incremental Delivery

1. Phase 2 → `featureId` on conversations works (find + create)
2. Phase 3 composable tasks (T006–T013) → cascade queue works in isolation
3. Phase 3 component tasks (T014–T017) → full pipeline triggered from Kanban UI
4. Phase 4 → edge case handling, tooltips, conversation naming

---

## Notes

- [P] tasks = different files, no dependencies
- [US1] = User Story 1 (Cascade Automation, P2 — the only user story)
- [FR-XXX] = Functional requirement traceability
- No new server endpoints — all changes are client-side orchestration
- No new dependencies — uses existing Pinia, WebSocket, and composable patterns
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
