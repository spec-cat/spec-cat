# Tasks: Auto Mode

**Input**: Design documents from `/home/khan/src/brick/specs/013-auto-mode/`  
**Prerequisites**: `/home/khan/src/brick/specs/013-auto-mode/plan.md`, `/home/khan/src/brick/specs/013-auto-mode/spec.md`, `/home/khan/src/brick/specs/013-auto-mode/research.md`, `/home/khan/src/brick/specs/013-auto-mode/data-model.md`, `/home/khan/src/brick/specs/013-auto-mode/contracts/automode-api.yaml`

**Tests**: No explicit TDD/automated-test requirement in the feature spec; tasks emphasize implementation plus explicit manual validation.

**Organization**: Tasks are grouped by user story to support independent implementation and verification.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no direct dependency)
- **[Story]**: User story mapping label (`[US1]`, `[US2]`, `[US3]`, `[US4]`)
- Every task includes explicit `[FR-XXX]` or `[SC-XXX]` traceability tags and absolute file paths

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish Auto Mode primitives and persistence helpers used across all stories.

- [ ] T001 Create Auto Mode shared type definitions (`AutoModeState`, `AutoModeTask`, hash records) in `/home/khan/src/brick/types/autoMode.ts` [FR-003] [FR-003b] [FR-013] [FR-015]
- [ ] T002 Create Auto Mode project-store read/write helpers in `/home/khan/src/brick/server/utils/autoModeStore.ts` [FR-002] [FR-015] [FR-018]
- [ ] T003 [P] Create SHA-256 hash helper for `spec.md/plan.md/tasks.md` in `/home/khan/src/brick/server/utils/autoModeHash.ts` [FR-003b] [FR-018]
- [ ] T004 [P] Create queue discovery helper for eligible `NNN-*` + `spec.md` directories in `/home/khan/src/brick/server/utils/autoModeDiscovery.ts` [FR-003] [FR-003a]

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build scheduler, API surface, persistence normalization, and `sc/automode` integration core required for MVP behavior.

**⚠️ CRITICAL**: No user-story phase starts before this is complete.

- [ ] T005 Implement scheduler state machine (single-cycle lifecycle + bounded concurrency) in `/home/khan/src/brick/server/utils/autoModeScheduler.ts` [FR-013] [FR-017]
- [ ] T006 Implement incremental step planner (`plan/tasks/skill:better-spec`) with spec-only guardrails in `/home/khan/src/brick/server/utils/autoModeStepPlanner.ts` [FR-005] [FR-007] [FR-027]
- [ ] T007 Implement conversation creation/reuse and active-worktree skip checks in `/home/khan/src/brick/server/utils/autoModeConversation.ts` [FR-004] [FR-006] [FR-011]
- [ ] T008 [P] Add runtime state API `GET /api/automode/state` in `/home/khan/src/brick/server/api/automode/state.get.ts` [FR-015] [FR-017] [NFR-002]
- [ ] T009 [P] Add start API `POST /api/automode/start` in `/home/khan/src/brick/server/api/automode/start.post.ts` [FR-001] [FR-003] [FR-022]
- [ ] T010 [P] Add stop API `POST /api/automode/stop` in `/home/khan/src/brick/server/api/automode/stop.post.ts` [FR-010] [FR-010a]
- [ ] T011 [P] Add status API `GET /api/automode/status` in `/home/khan/src/brick/server/api/automode/status.get.ts` [FR-015] [FR-015a]
- [ ] T012 Implement scheduler startup recovery (`running -> queued`) in `/home/khan/src/brick/server/plugins/autoModeScheduler.ts` [FR-015] [FR-015a] [NFR-002]
- [ ] T013 Extend settings normalization/types with Auto Mode fields in `/home/khan/src/brick/utils/settings.ts` [FR-002] [FR-016]
- [ ] T014 Persist and expose Auto Mode settings in `/home/khan/src/brick/server/api/settings.get.ts` [FR-002] [FR-016]
- [ ] T015 Persist and validate Auto Mode settings writes in `/home/khan/src/brick/server/api/settings.post.ts` [FR-002] [FR-016] [FR-019]
- [ ] T016 Implement integration-branch preparation API (`sc/automode` from selected base) in `/home/khan/src/brick/server/api/automode/integration/prepare.post.ts` [FR-022]
- [ ] T017 Implement feature integration API for in-cycle accumulation to `sc/automode` in `/home/khan/src/brick/server/api/automode/integration/feature.post.ts` [FR-024]
- [ ] T018 Implement AI-assisted integration conflict resolver in `/home/khan/src/brick/server/utils/autoModeIntegration.ts` [FR-025]
- [ ] T019 Implement worktree baseline creation from `sc/automode` in `/home/khan/src/brick/server/utils/autoModeConversation.ts` [FR-023]
- [ ] T020 Implement scheduler hook to integrate each successful feature in-cycle via integration API in `/home/khan/src/brick/server/utils/autoModeScheduler.ts` [FR-024]

**Checkpoint**: Core runtime supports queueing, persistence, branch baseline, and in-cycle integration.

---

## Phase 3: User Story 1 - Enable Auto Mode (Priority: P1) 🎯 MVP

**Goal**: Toggle Auto Mode in sidebar, select base branch, execute incremental cascades, and enforce disable/manual-cancel semantics.

**Independent Test**: Toggle on with base branch selection; verify first cascade starts within 5s; disable behavior fails queued tasks but allows running tasks to finish.

### Implementation for User Story 1

- [ ] T021 [US1] Add `autoMode?: boolean` to conversation model in `/home/khan/src/brick/types/chat.ts` [FR-004] [FR-008]
- [ ] T022 [US1] Extend chat-store conversation metadata handling for Auto Mode in `/home/khan/src/brick/stores/chat.ts` [FR-004] [FR-014]
- [ ] T023 [US1] Create Auto Mode client store for enabled/idle/queue/concurrency state in `/home/khan/src/brick/stores/autoMode.ts` [FR-002] [FR-013] [FR-017]
- [ ] T024 [US1] Implement start/stop/status client orchestration and hydration resume in `/home/khan/src/brick/stores/autoMode.ts` [FR-002] [FR-010] [FR-015]
- [ ] T025 [US1] Create sidebar toggle with base-branch selection flow in `/home/khan/src/brick/components/features/AutoModeToggle.vue` [FR-001] [FR-022]
- [ ] T026 [US1] Wire Auto Mode toggle into features panel header in `/home/khan/src/brick/components/features/FeaturesPanel.vue` [FR-001] [FR-019]
- [ ] T027 [US1] Implement queue build + skip + incremental step assignment in scheduler in `/home/khan/src/brick/server/utils/autoModeScheduler.ts` [FR-003] [FR-003a] [FR-003b] [FR-005] [FR-018]
- [ ] T028 [US1] Implement queued-task failure reason `Auto Mode disabled` while letting running tasks complete in `/home/khan/src/brick/server/utils/autoModeScheduler.ts` [FR-010] [FR-010a]
- [ ] T029 [US1] Add manual-message cancellation hook for active auto cascades in `/home/khan/src/brick/composables/useChatStream.ts` [FR-020]
- [ ] T030 [US1] Persist feature hashes only after successful final cascade completion in `/home/khan/src/brick/server/utils/autoModeScheduler.ts` [FR-018] [FR-027]
- [ ] T031 [US1] Add explicit no-specs-found transition to idle with user notification in `/home/khan/src/brick/components/features/AutoModeToggle.vue` [FR-017]
- [ ] T032 [US1] Add scheduler resilience path for worktree-creation failure while continuing remaining queue in `/home/khan/src/brick/server/utils/autoModeScheduler.ts` [FR-006] [FR-021]

**Checkpoint**: US1 is independently functional and testable.

---

## Phase 4: User Story 2 - Monitor Auto Mode Progress (Priority: P2)

**Goal**: Show Auto Mode conversation identity and progress inside existing conversation UI.

**Independent Test**: With Auto Mode running, user sees `auto` badge + streaming/progress visibility and can inspect full structured conversation history.

### Implementation for User Story 2

- [ ] T033 [US2] Render `auto` badge for Auto Mode conversations in `/home/khan/src/brick/components/chat/ConversationItem.vue` [FR-008]
- [ ] T034 [US2] Keep Auto Mode conversations first-class in list search/filter and ordering in `/home/khan/src/brick/components/chat/ConversationList.vue` [FR-014]
- [ ] T035 [US2] Add Auto Mode status summary strip (running/idle/task counts) in `/home/khan/src/brick/components/chat/ConversationList.vue` [FR-003] [FR-017]
- [ ] T036 [US2] Preserve structured Auto Mode content blocks for rendering parity in `/home/khan/src/brick/composables/useChatStream.ts` [FR-021] [FR-026] [NFR-003]
- [ ] T037 [US2] Surface per-feature Auto Mode errors in conversation message history in `/home/khan/src/brick/server/utils/autoModeScheduler.ts` [FR-021]

**Checkpoint**: US2 independently testable using existing conversation list/chat UI.

---

## Phase 5: User Story 3 - Review and Merge Auto Mode Results (Priority: P2)

**Goal**: Ensure Auto Mode outputs remain review-gated with standard preview/finalize/discard lifecycle.

**Independent Test**: Complete Auto Mode task; preview, finalize, and discard operate exactly like normal conversations.

### Implementation for User Story 3

- [ ] T038 [US3] Keep Auto Mode conversations compatible with preview/finalize metadata in `/home/khan/src/brick/stores/chat.ts` [FR-009] [FR-014]
- [ ] T039 [US3] Ensure Auto Mode conversation records preserve worktree/base branch review fields in `/home/khan/src/brick/server/utils/autoModeConversation.ts` [FR-006] [FR-009]
- [ ] T040 [US3] Enforce no automatic merge-to-main behavior in scheduler completion path in `/home/khan/src/brick/server/utils/autoModeScheduler.ts` [FR-009] [FR-014]
- [ ] T041 [US3] Update completion summary/readiness messaging for review gating in `/home/khan/src/brick/components/chat/ChatResultSummary.vue` [FR-009] [FR-014]

**Checkpoint**: US3 independently testable with standard review flow.

---

## Phase 6: User Story 4 - Constitution and .speckit Sync (Priority: P3)

**Goal**: Process constitution updates as dedicated Auto Mode conversations with the same review lifecycle.

**Independent Test**: Trigger stale constitution path; verify `featureId="constitution"` queue item executes and remains preview/finalize reviewable.

### Implementation for User Story 4

- [ ] T042 [US4] Add constitution queue-item generation and ordering in `/home/khan/src/brick/server/utils/autoModeDiscovery.ts` [FR-012] [FR-017]
- [ ] T043 [US4] Add constitution-specific cascade chain resolution in `/home/khan/src/brick/server/utils/autoModeStepPlanner.ts` [FR-012] [FR-027]
- [ ] T044 [US4] Ensure constitution conversation creation/reuse via `featureId: constitution` in `/home/khan/src/brick/server/utils/autoModeConversation.ts` [FR-004] [FR-012]
- [ ] T045 [US4] Expose constitution task state in Auto Mode status APIs for UI visibility in `/home/khan/src/brick/server/api/automode/status.get.ts` [FR-012]

**Checkpoint**: US4 independently testable and review-gated.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final UX/settings polish and explicit success-criteria validation.

- [ ] T046 [P] Add settings UI control for Auto Mode concurrency in `/home/khan/src/brick/components/settings/SettingsModal.vue` [FR-016]
- [ ] T047 [P] Add settings-store actions/hydration for Auto Mode enable+concurrency in `/home/khan/src/brick/stores/settings.ts` [FR-002] [FR-016]
- [ ] T048 [P] Run type safety gate and resolve Auto Mode typing issues from `pnpm typecheck` in `/home/khan/src/brick/types/autoMode.ts` [FR-021] [FR-026]
- [ ] T049 Validate performance success criteria (`SC-001`, `SC-002`, `SC-009`, `SC-010`) and document results in `/home/khan/src/brick/specs/013-auto-mode/quickstart.md` [SC-001] [SC-002] [SC-009] [SC-010] [NFR-001]
- [ ] T050 Validate UX/review success criteria (`SC-003`..`SC-008`) and document results in `/home/khan/src/brick/specs/013-auto-mode/quickstart.md` [SC-003] [SC-004] [SC-005] [SC-006] [SC-007] [SC-008] [NFR-003]

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1; blocks all user stories and includes `sc/automode` integration core.
- **Phase 3 (US1)**: Depends on Phase 2; MVP behavior phase.
- **Phase 4 (US2)**: Depends on Phase 2 and US1 runtime state.
- **Phase 5 (US3)**: Depends on Phase 2 and US1 conversation/worktree behavior.
- **Phase 6 (US4)**: Depends on Phase 2 and US1 scheduler/conversation primitives.
- **Phase 7 (Polish)**: Depends on targeted story completion.

### User Story Dependency Graph

- **US1 (P1)**: first deliverable.
- **US2 (P2)**: depends on US1 runtime data.
- **US3 (P2)**: depends on US1 conversation/worktree behavior.
- **US4 (P3)**: depends on US1 scheduler/conversation primitives.

Graph:

`US1 -> US2`  
`US1 -> US3`  
`US1 -> US4`

### Parallel Opportunities

- Setup: `T003`, `T004`.
- Foundational APIs/settings: `T008-T011`, `T013-T015`.
- US1 split: `T023-T026` (client/UI) in parallel with `T027-T030` (server scheduler).
- US2 split: `T033-T035` (UI) parallel with `T036-T037` (stream/scheduler).
- Polish: `T046-T048` parallel.

---

## Parallel Execution Examples

## Parallel Example: User Story 1

```bash
Task: "T023 [US1] Add Auto Mode client store in /home/khan/src/brick/stores/autoMode.ts"
Task: "T025 [US1] Create Auto Mode toggle in /home/khan/src/brick/components/features/AutoModeToggle.vue"
Task: "T027 [US1] Implement queue and incremental logic in /home/khan/src/brick/server/utils/autoModeScheduler.ts"
```

## Parallel Example: User Story 2

```bash
Task: "T033 [US2] Render auto badge in /home/khan/src/brick/components/chat/ConversationItem.vue"
Task: "T035 [US2] Add status summary strip in /home/khan/src/brick/components/chat/ConversationList.vue"
Task: "T036 [US2] Preserve structured blocks in /home/khan/src/brick/composables/useChatStream.ts"
```

## Parallel Example: User Story 4

```bash
Task: "T042 [US4] Add constitution queue generation in /home/khan/src/brick/server/utils/autoModeDiscovery.ts"
Task: "T044 [US4] Add constitution conversation reuse in /home/khan/src/brick/server/utils/autoModeConversation.ts"
Task: "T045 [US4] Expose constitution task in /home/khan/src/brick/server/api/automode/status.get.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup).
2. Complete Phase 2 (Foundational, including `sc/automode` integration core).
3. Complete Phase 3 (US1).
4. Validate US1 independent test criteria before expanding scope.

### Incremental Delivery

1. Ship US1 as MVP.
2. Add US2 monitoring visibility.
3. Add US3 review/finalize hardening.
4. Add US4 constitution sync flow.
5. Complete Phase 7 validation/polish.

### Validation Rule

- Mark each story complete only after its independent test criteria pass.
- Mark feature complete only after SC-001 through SC-010 validations are documented.

---

## Notes

- All tasks follow strict checklist format with Task ID, optional `[P]`, required `[USx]` for story phases, traceability tags, and absolute file paths.
