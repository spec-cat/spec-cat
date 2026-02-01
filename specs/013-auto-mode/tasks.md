# Tasks: Auto Mode

**Input**: Design documents from `/specs/013-auto-mode/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/api.md

**Tests**: Not requested — manual testing per CLAUDE.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend data model types and shared store state needed by all user stories

- [x] T001 [P] Add `autoMode?: boolean` field to `Conversation` interface in `types/chat.ts` (FR-008)
- [x] T002 [P] Add `concurrency: number` field to `AutoModeConfig` and add `AutoModePersistedSession` interface in `types/autoMode.ts` (FR-013, FR-015)
- [x] T003 [P] Add `autoModeConcurrency` field (default: 3) to settings store state, add `setAutoModeConcurrency()` action, update `resetToDefaults()` and `hydrate()` in `stores/settings.ts` (FR-016)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core scheduler upgrades that MUST be complete before user story features work

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Add concurrency parameter to `toggle()` method in `server/utils/autoModeScheduler.ts` — accept `concurrency?: number` and store it on the scheduler instance (FR-013)
- [x] T005 Implement concurrent processing pool in `server/utils/autoModeScheduler.ts` — replace sequential `for` loop in `runCycle()` with `Promise.race`-based concurrent queue pattern (process up to N features simultaneously) per research.md R-003 (FR-013)
- [x] T006 Implement session persistence in `server/utils/autoModeScheduler.ts` — write `~/.spec-cat/projects/{hash}/auto-mode-session.json` on session start, update on each task state change, delete on session completion/stop, restore on server startup per research.md R-004 (FR-015)
- [x] T007 Implement conversation creation in `stores/autoMode.ts` — on task_update with running state, create a conversation via the chat store API (reuse existing if `featureId` matches), set `autoMode: true` on the conversation, and link worktree to conversation (FR-004, FR-008)
- [x] T008 Accept `concurrency` parameter in request body of `server/api/auto-mode/toggle.post.ts` and pass it to `autoModeScheduler.toggle()` (FR-013, FR-016)

**Checkpoint**: Foundation ready — concurrent processing, session persistence, and conversation creation all work. User story implementation can now begin.

---

## Phase 3: User Story 1 — Enable Auto Mode (Priority: P1) 🎯 MVP

**Goal**: User clicks Auto Mode toggle → system scans specs, creates conversations per feature, runs cascade (plan → tasks → skill:better-spec → analyze) concurrently, updates specs in worktree branches

**Independent Test**: Toggle Auto Mode on → verify conversations appear per spec unit, cascade messages are sent, spec files are updated in each conversation's worktree. Toggle off → verify graceful stop.

### Implementation for User Story 1

- [x] T009 [US1] Update `autoModeStore.toggle()` in `stores/autoMode.ts` to read `autoModeConcurrency` from settings store and pass it as `concurrency` parameter to `POST /api/auto-mode/toggle` request body (FR-013, FR-016)
- [x] T010 [US1] Add edge case handling in `server/utils/autoModeScheduler.ts` — when no spec directories are found, broadcast an `auto_mode_error` with "No specs to process" message and transition session to idle state (Edge Case: no spec directories)
- [x] T011 [US1] Add skip logic in `server/utils/autoModeScheduler.ts` — when a feature already has an active streaming conversation, mark task as `skipped` and continue to next feature (FR-011)
- [x] T012 [US1] Implement single-cycle-per-activation behavior in `server/utils/autoModeScheduler.ts` — after all queued features are processed, transition session state to `idle` (toggle stays "on" but no re-scanning). User must toggle off and on to trigger a new cycle (FR-017)
- [x] T013 [US1] Implement page-refresh resilience in `stores/autoMode.ts` — on store initialization, call `GET /api/auto-mode/status` to check for persisted server session and restore client state accordingly (FR-015)

**Checkpoint**: User Story 1 fully functional — Auto Mode can be toggled on/off, processes all specs concurrently, creates conversations, and survives page refresh.

---

## Phase 4: User Story 2 — Monitor Auto Mode Progress (Priority: P2)

**Goal**: Auto Mode conversations appear in the conversation list with "auto" badge and streaming indicators. User can click into any conversation to see cascade chat history.

**Independent Test**: Enable Auto Mode → verify conversations in list show "auto" badge, streaming indicators for active ones. Click into a conversation → verify cascade chat history is visible.

### Implementation for User Story 2

- [x] T014 [P] [US2] Add "auto" badge to `components/chat/ConversationItem.vue` — when `conversation.autoMode === true`, render a small badge (retro-yellow styling, matching AutoModeToggle) next to the conversation title, alongside existing streaming badge (FR-008)
- [x] T015 [US2] Ensure Auto Mode conversations are searchable/filterable in the conversation list — verify the existing search/filter in the conversation list works with `autoMode` conversations (no code change expected if search operates on title/featureId) (FR-014)

**Checkpoint**: User Story 2 complete — Auto Mode conversations are visually distinguishable and fully browsable.

---

## Phase 5: User Story 3 — Review and Merge Auto Mode Results (Priority: P2)

**Goal**: User reviews Auto Mode spec changes using the standard preview/finalize flow — no new review UI needed.

**Independent Test**: Complete an Auto Mode run for one feature → click preview on that conversation → verify diffs are shown → finalize → verify merge to main.

### Implementation for User Story 3

- [x] T016 [US3] Verify that Auto Mode conversations support preview/finalize flow in `server/utils/autoModeScheduler.ts` — ensure worktree paths and branch names are set correctly on the conversation so that existing `POST /api/chat/preview` and `POST /api/chat/finalize` endpoints work without modification (FR-009, FR-014)
- [x] T017 [US3] Verify that deleting an Auto Mode conversation cleans up the worktree — ensure existing delete logic in `stores/chat.ts` handles `autoMode` conversations identically to manual ones (FR-014)

**Checkpoint**: User Story 3 complete — standard preview/finalize/delete flow works for Auto Mode conversations.

---

## Phase 6: User Story 4 — Constitution and .speckit Sync (Priority: P3)

**Goal**: Auto Mode creates a dedicated "constitution" conversation that runs the constitution update workflow, reviewable via the same preview/finalize flow.

**Independent Test**: Enable Auto Mode → verify a conversation with featureId "constitution" is created → verify `/speckit.constitution` command is run instead of plan/tasks/analyze cascade.

### Implementation for User Story 4

- [x] T018 [US4] Add constitution special-case handling in `server/utils/autoModeScheduler.ts` — in the feature queue, add a `constitution` entry. In `processFeature()`, detect `featureId === 'constitution'` and run `/speckit.constitution` command instead of the normal plan → tasks → skill:better-spec → analyze cascade per research.md R-005 (FR-012)
- [x] T019 [US4] Set correct working directory for constitution conversation in `server/utils/autoModeScheduler.ts` — constitution runs at project root, not in a spec subdirectory. Ensure worktree is created and `.speckit/memory/constitution.md` is the target file (FR-012)

**Checkpoint**: User Story 4 complete — constitution sync works as a first-class conversation.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Settings UI and final integration

- [x] T020 [P] Add concurrency setting to `components/settings/SettingsModal.vue` — add a labeled number input or slider (range 1–10, default 3) in the settings modal that reads/writes `autoModeConcurrency` via the settings store (FR-016)
- [x] T021 [P] Add concurrency setting to `pages/settings.vue` — add the same concurrency control in the settings page for consistency with the modal (FR-016)
- [ ] T022 Run `quickstart.md` manual validation — follow all 7 test scenarios from quickstart.md to verify end-to-end behavior

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately. All T001–T003 are parallel.
- **Foundational (Phase 2)**: Depends on Phase 1 (types must exist). T004→T005 sequential (concurrency then pool). T006, T007, T008 parallel with each other but after T004.
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion
- **User Story 2 (Phase 4)**: Depends on Phase 1 (T001 for autoMode field). Can run in parallel with US1 Phase 3.
- **User Story 3 (Phase 5)**: Depends on Phase 2 (conversations must be created). Can run in parallel with US1/US2.
- **User Story 4 (Phase 6)**: Depends on Phase 2 (scheduler must support conversation creation). Can run in parallel with US1/US2/US3.
- **Polish (Phase 7)**: T020/T021 depend on Phase 1 (T003 settings store). T022 depends on all phases.

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational — no dependencies on other stories
- **User Story 2 (P2)**: Depends on Setup T001 — independently testable with any existing `autoMode: true` conversation
- **User Story 3 (P2)**: Depends on Foundational — independently testable with any Auto Mode conversation that has worktree
- **User Story 4 (P3)**: Depends on Foundational — independently testable as constitution conversation

### Within Each User Story

- Core implementation before edge cases
- Server-side before client-side (scheduler drives state)

### Parallel Opportunities

- T001, T002, T003 all in parallel (different files)
- T006, T007, T008 in parallel after T004/T005 (different files/concerns)
- T014, T015 in parallel (different concerns)
- T018, T019 sequential (same file, depends on feature detection)
- T020, T021 in parallel (different files)
- US2, US3, US4 can all run in parallel with US1 (if team capacity allows)

---

## Parallel Example: Phase 1 (Setup)

```bash
# Launch all setup tasks together (different files):
Task T001: "Add autoMode field to Conversation in types/chat.ts"
Task T002: "Add concurrency + AutoModePersistedSession to types/autoMode.ts"
Task T003: "Add autoModeConcurrency to stores/settings.ts"
```

## Parallel Example: User Story 2

```bash
# Launch US2 tasks together (different concerns):
Task T014: "Add auto badge to ConversationItem.vue"
Task T015: "Verify search/filter works with autoMode conversations"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003) — ~3 tasks, all parallel
2. Complete Phase 2: Foundational (T004–T008) — ~5 tasks, core logic
3. Complete Phase 3: User Story 1 (T009–T013) — ~5 tasks
4. **STOP and VALIDATE**: Toggle Auto Mode on, verify conversations created, cascade runs, specs updated
5. This delivers the core value: automated spec processing

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Auto Mode works end-to-end (MVP!)
3. Add User Story 2 → Visual badges and monitoring
4. Add User Story 3 → Preview/finalize verification
5. Add User Story 4 → Constitution sync
6. Polish → Settings UI + full validation

---

## FR Traceability

| FR | Tasks |
|----|-------|
| FR-001 | Already implemented (AutoModeToggle.vue) |
| FR-002 | Already implemented (localStorage) |
| FR-003 | Already implemented (discoverFeatures()) |
| FR-004 | T007 |
| FR-005 | Already implemented (SPECKIT_STEPS) |
| FR-006 | Already implemented (worktreeResolver) |
| FR-007 | Already implemented (cascade analysis) |
| FR-008 | T001, T014 |
| FR-009 | T016 |
| FR-010 | Already implemented (stopProcessing()) |
| FR-011 | T011 |
| FR-012 | T018, T019 |
| FR-013 | T002, T004, T005, T008, T009 |
| FR-014 | T015, T016, T017 |
| FR-015 | T002, T006, T013 |
| FR-016 | T003, T008, T009, T020, T021 |
| FR-017 | T012 |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Many FRs are already implemented — focus on gaps identified in plan.md
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently

## FR Traceability Addendum (2026-02-14)

- [ ] T022 [Traceability] Add explicit mapping for queue eligibility/hash skip and resume semantics [FR-003a, FR-003b, FR-010a, FR-015a]
