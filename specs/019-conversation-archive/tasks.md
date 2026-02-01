# Tasks: Conversation Archive & Reopen

**Input**: Design documents from `/home/khan/src/brick2/specs/019-conversation-archive/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Automated test tasks are omitted because the specification requests manual verification flows (quickstart) rather than TDD/test-first implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Nuxt full-stack paths at repository root (`components/`, `stores/`, `types/`, `utils/`, `server/api/`)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare feature scaffolding and documentation hooks for archive/reopen work.

- [X] T001 Create feature task baseline notes in `/home/khan/src/brick2/specs/019-conversation-archive/tasks.md`
- [X] T002 [P] Add archive/reopen implementation TODO anchors in `/home/khan/src/brick2/stores/chat.ts`
- [X] T003 [P] Add archive schema migration TODO anchors in `/home/khan/src/brick2/utils/conversationStorage.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core shared data and persistence changes required before any user story implementation.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Define archived and v2 persisted schema types with guards in `/home/khan/src/brick2/types/chat.ts`
- [X] T005 Implement v1->v2 migration and partial recovery for archived/active arrays in `/home/khan/src/brick2/utils/conversationStorage.ts`
- [X] T006 Update conversations load endpoint to return v2 active/archive shape in `/home/khan/src/brick2/server/api/conversations.get.ts`
- [X] T007 Update conversations save endpoint validation to accept v2 schema in `/home/khan/src/brick2/server/api/conversations.post.ts`
- [X] T008 [P] Add shared archive helpers (snapshot creation, immutable clone utilities, max-limit guard) in `/home/khan/src/brick2/stores/chat.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Archive Instead of Delete (Priority: P1) MVP

**Goal**: Replace destructive delete with archive so active conversations can be safely removed while preserving full context.

**Independent Test**: Archive any non-streaming active/finalized conversation from the list and verify it is removed from active view and visible in archive data.

### Implementation for User Story 1

- [X] T009 [US1] Replace conversation row delete control with archive action affordance in `/home/khan/src/brick2/components/chat/ConversationItem.vue`
- [X] T010 [US1] Implement `archiveConversation` store action that moves active -> archived snapshot in `/home/khan/src/brick2/stores/chat.ts`
- [X] T011 [US1] Enforce streaming-state archive block with user-facing toast in `/home/khan/src/brick2/stores/chat.ts`
- [X] T012 [US1] Persist updated active/archive arrays after archive action in `/home/khan/src/brick2/stores/chat.ts`
- [X] T013 [P] [US1] Add archive API route to archive one active conversation in `/home/khan/src/brick2/server/api/conversations/[conversationId]/archive.post.ts`
- [X] T014 [US1] Wire conversation item archive action to store/API flow in `/home/khan/src/brick2/components/chat/ConversationItem.vue`

**Checkpoint**: User Story 1 is fully functional and independently testable.

---

## Phase 4: User Story 2 - Browse Archived Conversations (Priority: P1)

**Goal**: Provide a dedicated archive view with search/filter and metadata-rich archive listing.

**Independent Test**: Open archive view from the panel and verify archived conversations are sorted by `archivedAt` descending and filter by title/message content.

### Implementation for User Story 2

- [X] T015 [US2] Add archive view mode state and computed filtered archive list in `/home/khan/src/brick2/stores/chat.ts`
- [X] T016 [US2] Add archive entry point and view toggle controls in `/home/khan/src/brick2/components/conversations/ConversationsPanel.vue`
- [X] T017 [US2] Implement archive search input behavior aligned with active conversation filtering in `/home/khan/src/brick2/components/conversations/ConversationsPanel.vue`
- [X] T018 [US2] Render archived conversation rows with title, archived timestamp, updated timestamp, and preview in `/home/khan/src/brick2/components/conversations/ConversationsPanel.vue`
- [X] T019 [US2] Implement archive empty-state messaging in `/home/khan/src/brick2/components/conversations/ConversationsPanel.vue`
- [X] T020 [P] [US2] Add list archives endpoint with query filter and archivedAt sort in `/home/khan/src/brick2/server/api/conversations/archives.get.ts`
- [X] T021 [US2] Add corrupted archived-record skip + warning toast handling in `/home/khan/src/brick2/stores/chat.ts`

**Checkpoint**: User Story 2 is fully functional and independently testable.

---

## Phase 5: User Story 3 - Reopen Archived Context into New Conversation (Priority: P1)

**Goal**: Restore archived context by creating and selecting a new active conversation copy while consuming the source archive entry.

**Independent Test**: Click an archived conversation and verify a new active conversation is created, selected, and populated with archived context.

### Implementation for User Story 3

- [X] T022 [US3] Implement `restoreArchivedConversation` store action that creates a new active conversation copy in `/home/khan/src/brick2/stores/chat.ts`
- [X] T023 [US3] Preserve linkage metadata (`featureId`, `restoredFromArchiveId`) while initializing fresh worktree/base branch runtime context in `/home/khan/src/brick2/stores/chat.ts`
- [X] T024 [US3] Enforce `MAX_CONVERSATIONS=100` guard for restore with user guidance in `/home/khan/src/brick2/stores/chat.ts`
- [X] T025 [P] [US3] Add restore API route returning new conversation payload in `/home/khan/src/brick2/server/api/conversations/archives/[archiveId]/restore.post.ts`
- [X] T026 [US3] Wire archive list item click-to-restore and auto-select behavior in `/home/khan/src/brick2/components/conversations/ConversationsPanel.vue`
- [X] T027 [US3] Ensure restore creates an active copy and removes the source archive entry in `/home/khan/src/brick2/stores/chat.ts`

**Checkpoint**: User Story 3 is fully functional and independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final consistency, performance, and manual acceptance coverage across all stories.

- [X] T028 [P] Update archive/reopen operator notes in `/home/khan/src/brick2/specs/019-conversation-archive/quickstart.md`
- [ ] T029 Validate full quickstart manual flow and edge-case checks in `/home/khan/src/brick2/specs/019-conversation-archive/quickstart.md`
- [X] T030 Run lint and test gate (`npm run lint && npm test`) from `/home/khan/src/brick2`
- [ ] T031 Confirm no regressions in finalize/preview/worktree active flows in `/home/khan/src/brick2/components/conversations/ConversationsPanel.vue`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - blocks all user stories.
- **User Stories (Phases 3-5)**: Depend on Foundational completion.
- **Polish (Phase 6)**: Depends on completion of targeted user stories.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2; no dependency on US2/US3.
- **US2 (P1)**: Starts after Phase 2; depends on foundational archived data availability, not on US3.
- **US3 (P1)**: Starts after Phase 2; depends on archive data model and archive list interactions from US1/US2.

### Within Each User Story

- Data/state operations before UI wiring.
- API route tasks can run in parallel with UI tasks when marked `[P]`.
- Complete story acceptance checks before starting polish.

### Dependency Graph (Story Completion Order)

- `Phase 1 -> Phase 2 -> US1 -> US2 -> US3 -> Phase 6`
- `Phase 1 -> Phase 2 -> US2` (can start in parallel with US1 if team capacity exists)

---

## Parallel Execution Examples

## Parallel Example: User Story 1

```bash
Task: T013 [US1] Add archive API route in /home/khan/src/brick2/server/api/conversations/[conversationId]/archive.post.ts
Task: T009 [US1] Replace delete control UI in /home/khan/src/brick2/components/chat/ConversationItem.vue
```

## Parallel Example: User Story 2

```bash
Task: T020 [US2] Implement archives list endpoint in /home/khan/src/brick2/server/api/conversations/archives.get.ts
Task: T016 [US2] Add archive entry point/view toggle in /home/khan/src/brick2/components/conversations/ConversationsPanel.vue
```

## Parallel Example: User Story 3

```bash
Task: T025 [US3] Add restore endpoint in /home/khan/src/brick2/server/api/conversations/archives/[archiveId]/restore.post.ts
Task: T026 [US3] Wire archive item click-to-restore in /home/khan/src/brick2/components/conversations/ConversationsPanel.vue
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1).
3. Validate US1 independent test and archive safety behavior.
4. Demo/deploy MVP with non-destructive archive replacing delete.

### Incremental Delivery

1. Ship US1 (archive instead of delete).
2. Ship US2 (archive browsing/search).
3. Ship US3 (restore-as-new with archive-entry consumption).
4. Finish polish and regression checks.

### Parallel Team Strategy

1. Team completes Phases 1-2 together.
2. After Phase 2:
Engineer A: US1 store + row action wiring.
Engineer B: US2 archive list/search UI + API.
Engineer C: US3 restore API + restore action integration.

---

## Notes

- `[P]` tasks target separate files and can execute concurrently.
- Story labels are used only in user-story phases.
- Every task includes a concrete file path and actionable scope.
- Independent test criteria are captured per story above.
