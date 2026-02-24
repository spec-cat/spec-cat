# Tasks: Auto Mode

**Input**: Design documents from `/specs/013-auto-mode/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Not requested — manual testing per CLAUDE.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Task Format Requirements

**MANDATORY**: Every task MUST follow this exact format:
```text
- [ ] [TaskID] [P?] [Story?] Description with file path
```

Components:
- **Checkbox**: `- [ ]` (required)
- **Task ID**: Sequential (T001, T002...)
- **[P]**: Present only if parallelizable
- **[Story]**: Required for user story tasks ([US1], [US2], [US3], [US4])
- **File path**: Must be included in description

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend data model types and shared store state needed by all user stories

- [X] T001 [P] Add `autoMode?: boolean` field to `Conversation` interface in types/chat.ts
- [X] T002 [P] Add `concurrency: number` field to `AutoModeConfig` interface in types/autoMode.ts
- [X] T003 [P] Add `AutoModePersistedSession` interface to types/autoMode.ts
- [X] T004 [P] Add `autoModeConcurrency: number` field to SettingsStoreState in stores/settings.ts
- [X] T005 [P] Add `setAutoModeConcurrency(value: number)` action to settings store in stores/settings.ts
- [X] T006 Update `resetToDefaults()` in stores/settings.ts to reset autoModeConcurrency to 3
- [X] T007 Update `hydrate()` in stores/settings.ts to load autoModeConcurrency from localStorage

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core scheduler upgrades that MUST be complete before user story features work

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T008 Add concurrency parameter to `toggle()` method signature in server/utils/autoModeScheduler.ts
- [X] T009 Store concurrency value on scheduler instance in server/utils/autoModeScheduler.ts
- [X] T010 Replace sequential processing loop with Promise.race-based concurrent queue in runCycle() method in server/utils/autoModeScheduler.ts
- [X] T011 Implement processWithConcurrency helper function using pattern from research.md R-003 in server/utils/autoModeScheduler.ts
- [X] T012 Create session persistence file at ~/.spec-cat/projects/{hash}/auto-mode-session.json on session start in server/utils/autoModeScheduler.ts
- [X] T013 Update session persistence file on each task state change in server/utils/autoModeScheduler.ts
- [X] T014 Delete session persistence file on session completion or stop in server/utils/autoModeScheduler.ts
- [X] T015 Restore session from persistence file on server startup in server/utils/autoModeScheduler.ts
- [X] T016 Create conversation via chat store when task enters running state in stores/autoMode.ts
- [X] T017 Set autoMode: true on created conversations in stores/autoMode.ts
- [X] T018 Link worktree to conversation when created in stores/autoMode.ts
- [X] T019 Accept concurrency parameter in request body of server/api/auto-mode/toggle.post.ts
- [X] T020 Pass concurrency parameter from API to autoModeScheduler.toggle() in server/api/auto-mode/toggle.post.ts

**Checkpoint**: Foundation ready — concurrent processing, session persistence, and conversation creation all work. User story implementation can now begin.

---

## Phase 3: User Story 1 — Enable Auto Mode (Priority: P1) 🎯 MVP

**Goal**: User clicks Auto Mode toggle → system scans specs, creates conversations per feature, runs cascade (plan → tasks → skill:better-spec) concurrently, updates specs in worktree branches

**Independent Test**: Toggle Auto Mode on → verify conversations appear per spec unit, cascade messages are sent, spec files are updated in each conversation's worktree. Toggle off → verify graceful stop.

### Implementation for User Story 1

- [X] T021 [US1] Read autoModeConcurrency from settings store in autoModeStore.toggle() method in stores/autoMode.ts
- [X] T022 [US1] Pass concurrency parameter in POST /api/auto-mode/toggle request body in stores/autoMode.ts
- [X] T023 [US1] Handle "no specs to process" edge case in discoverFeatures() method in server/utils/autoModeScheduler.ts
- [X] T024 [US1] Broadcast auto_mode_error WebSocket message when no specs found in server/utils/autoModeScheduler.ts
- [X] T025 [US1] Transition session to idle state when no specs found in server/utils/autoModeScheduler.ts
- [X] T026 [US1] Check for existing active worktree before processing feature in processFeature() method in server/utils/autoModeScheduler.ts
- [X] T027 [US1] Mark task as skipped when active worktree exists in server/utils/autoModeScheduler.ts
- [X] T028 [US1] Implement single-cycle operation - set session state to idle after all features processed in server/utils/autoModeScheduler.ts
- [X] T029 [US1] Prevent re-scanning when toggle remains on but session is idle in server/utils/autoModeScheduler.ts
- [X] T030 [US1] Call GET /api/auto-mode/status on store initialization in stores/autoMode.ts
- [X] T031 [US1] Restore client state from server session if found in stores/autoMode.ts
- [X] T032 [US1] Implement SHA-256 hash comparison to skip unchanged specs in server/utils/autoModeScheduler.ts

**Checkpoint**: User Story 1 fully functional — Auto Mode can be toggled on/off, processes all specs concurrently, creates conversations, and survives page refresh.

---

## Phase 4: User Story 2 — Monitor Auto Mode Progress (Priority: P2)

**Goal**: Auto Mode conversations appear in the conversation list with "auto" badge and streaming indicators. User can click into any conversation to see cascade chat history.

**Independent Test**: Enable Auto Mode → verify conversations in list show "auto" badge, streaming indicators for active ones. Click into a conversation → verify cascade chat history is visible.

### Implementation for User Story 2

- [X] T033 [P] [US2] Add auto badge container div to components/conversations/ConversationListItem.vue
- [X] T034 [US2] Add v-if="conversation.autoMode" condition for badge display in components/conversations/ConversationListItem.vue
- [X] T035 [US2] Style auto badge with retro-yellow colors matching AutoModeToggle in components/conversations/ConversationListItem.vue
- [X] T036 [US2] Position auto badge next to existing streaming indicator in components/conversations/ConversationListItem.vue
- [X] T037 [US2] Verify conversation search works with autoMode conversations in conversation list

**Checkpoint**: User Story 2 complete — Auto Mode conversations are visually distinguishable and fully browsable.

---

## Phase 5: User Story 3 — Review and Merge Auto Mode Results (Priority: P2)

**Goal**: User reviews Auto Mode spec changes using the standard preview/finalize flow — no new review UI needed.

**Independent Test**: Complete an Auto Mode run for one feature → click preview on that conversation → verify diffs are shown → finalize → verify merge to main.

### Implementation for User Story 3

- [X] T038 [US3] Ensure worktreePath is set correctly on Auto Mode conversations in server/utils/autoModeScheduler.ts
- [X] T039 [US3] Ensure worktreeBranch is set correctly on Auto Mode conversations in server/utils/autoModeScheduler.ts
- [X] T040 [US3] Verify POST /api/chat/preview works with Auto Mode conversations
- [X] T041 [US3] Verify POST /api/chat/finalize works with Auto Mode conversations
- [X] T042 [US3] Verify conversation delete cleans up Auto Mode worktrees in stores/chat.ts

**Checkpoint**: User Story 3 complete — standard preview/finalize/delete flow works for Auto Mode conversations.

---

## Phase 6: User Story 4 — Constitution and .speckit Sync (Priority: P3)

**Goal**: Auto Mode creates a dedicated "constitution" conversation that runs the constitution update workflow, reviewable via the same preview/finalize flow.

**Independent Test**: Enable Auto Mode → verify a conversation with featureId "constitution" is created → verify /speckit.constitution command is run instead of plan/tasks/skill:better-spec cascade.

### Implementation for User Story 4

- [X] T043 [US4] Add "constitution" entry to feature queue in discoverFeatures() method in server/utils/autoModeScheduler.ts
- [X] T044 [US4] Detect featureId === "constitution" in processFeature() method in server/utils/autoModeScheduler.ts
- [X] T045 [US4] Run /speckit.constitution command for constitution feature instead of normal cascade in server/utils/autoModeScheduler.ts
- [X] T046 [US4] Set working directory to project root for constitution conversation in server/utils/autoModeScheduler.ts
- [X] T047 [US4] Ensure constitution worktree targets .speckit/memory/constitution.md in server/utils/autoModeScheduler.ts

**Checkpoint**: User Story 4 complete — constitution sync works as a first-class conversation.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Settings UI and final integration

- [X] T048 [P] Add AutoModeSettings.vue component to components/settings/
- [X] T049 [P] Add concurrency number input (range 1-10, default 3) to AutoModeSettings.vue
- [X] T050 [P] Connect concurrency input to settings store autoModeConcurrency in AutoModeSettings.vue
- [X] T051 [P] Import and use AutoModeSettings component in components/settings/SettingsModal.vue
- [X] T052 [P] Add Auto Mode section with concurrency control to pages/settings.vue
- [ ] T053 Run all 7 manual test scenarios from quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) ──────────┐
                          ▼
Phase 2 (Foundational) ───┬──→ Phase 3 (US1)
                          ├──→ Phase 4 (US2)
                          ├──→ Phase 5 (US3)
                          └──→ Phase 6 (US4)
                                    │
Phase 1 ─────────────────────────→ Phase 7 (Polish)
```

### Critical Path
1. **Phase 1**: T001-T007 (all parallel)
2. **Phase 2**: T008→T009→T010→T011 (sequential), then T012-T020 (parallel)
3. **Phase 3**: T021-T032 (US1 implementation)
4. **Parallel options**: US2, US3, US4 can run simultaneously after Phase 2
5. **Phase 7**: Can start after Phase 1, complete after all stories

### Parallel Opportunities

**Phase 1 (Setup)** - All tasks in parallel:
```bash
T001: Add autoMode field to types/chat.ts
T002: Add concurrency to types/autoMode.ts
T003: Add AutoModePersistedSession to types/autoMode.ts
T004: Add autoModeConcurrency to stores/settings.ts
T005: Add setAutoModeConcurrency to stores/settings.ts
```

**After T011 in Phase 2** - Parallel execution:
```bash
T012-T015: Session persistence tasks
T016-T018: Conversation creation tasks
T019-T020: API parameter tasks
```

**User Stories 2-4** - Can run in parallel:
```bash
US2: T033-T037 (Auto badges)
US3: T038-T042 (Preview/finalize)
US4: T043-T047 (Constitution)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. **Phase 1**: Setup infrastructure (7 tasks, all parallel) - 30 min
2. **Phase 2**: Core scheduler (13 tasks) - 2 hours
3. **Phase 3**: User Story 1 (12 tasks) - 1.5 hours
4. **Validate MVP**: Toggle works, specs process, conversations created

### Incremental Delivery

- **Milestone 1**: Setup + Foundational = Working infrastructure
- **Milestone 2**: + User Story 1 = Core Auto Mode (MVP) ✅
- **Milestone 3**: + User Story 2 = Visual monitoring
- **Milestone 4**: + User Story 3 = Review workflow
- **Milestone 5**: + User Story 4 = Constitution sync
- **Milestone 6**: + Polish = Complete feature

---

## FR Traceability Matrix

| FR ID | Requirement | Tasks |
|-------|-------------|-------|
| FR-001 | On/off toggle in sidebar | Already implemented |
| FR-002 | Persist enabled state | Already implemented |
| FR-003 | Scan specs and build queue | Already implemented |
| FR-003a | Eligible directory pattern | Already implemented |
| FR-003b | SHA-256 change detection | T032 |
| FR-004 | Create conversation per feature | T016, T017 |
| FR-005 | Run cascade sequence | Already implemented |
| FR-006 | Isolated worktree | Already implemented |
| FR-007 | Update specs via Claude | Already implemented |
| FR-008 | Auto badge in conversations | T001, T033-T036 |
| FR-009 | Human review required | T038-T041 |
| FR-010 | Disable stops queued tasks | Already implemented |
| FR-010a | Running tasks complete | Already implemented |
| FR-011 | Skip active worktrees | T026, T027 |
| FR-012 | Constitution conversation | T043-T047 |
| FR-013 | Concurrent processing | T002, T008-T011, T019, T021 |
| FR-014 | Full conversation lifecycle | T037, T042 |
| FR-015 | Queue persistence | T003, T012-T015, T030-T031 |
| FR-015a | Resume resets running | T015 |
| FR-016 | Concurrency setting | T004-T007, T019-T022, T048-T052 |
| FR-017 | Single cycle operation | T028, T029 |

**Coverage**: 100% - All functional requirements have implementing tasks.

---

## Summary

- **Total Tasks**: 53
- **By User Story**:
  - Setup/Foundation: 20 tasks
  - User Story 1: 12 tasks
  - User Story 2: 5 tasks
  - User Story 3: 5 tasks
  - User Story 4: 5 tasks
  - Polish: 6 tasks
- **Parallel Opportunities**:
  - Phase 1: 7 tasks in parallel
  - Phase 2: 9 tasks in parallel after T011
  - US2/US3/US4: All can run in parallel
- **MVP Scope**: Phases 1-3 (32 tasks) delivers core Auto Mode functionality