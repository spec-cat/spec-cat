# Tasks: Chat Conflict Resolution

**Feature**: 027-chat-conflict-resolution | **Status**: In Development | **Updated**: 2026-03-04

## Phase 1: Core Infrastructure

### API Layer
- [ ] T001 [FR-001] Implement conflict detection API in `server/api/rebase/conflicts.get.ts` that lists conflicted files with paths and marker locations.
- [ ] T002 [FR-002] Implement resolve endpoint in `server/api/rebase/resolve.post.ts` for marking individual files as resolved.
- [ ] T003 [FR-002] Implement continue endpoint in `server/api/rebase/continue.post.ts` with validation of all conflicts resolved.
- [ ] T004 [FR-002] Implement abort endpoint in `server/api/rebase/abort.post.ts` with proper state cleanup.

### Type Definitions
- [ ] T005 [FR-020] Add AiResolveRequest and AiResolveResponse types in `types/chat.ts` with all required fields.

## Phase 2: State Management

### Conflict State
- [ ] T006 [FR-021] Add conflict session state structure to `stores/chat.ts` with lifecycle state tracking.
- [ ] T007 [FR-006D] Implement conflict state persistence using existing conversation persistence infrastructure.
- [ ] T008 [FR-006E] Add state cleanup hooks in continue/abort operations.
- [ ] T009 [FR-006F] Add pre-flight validation before git continue to ensure consistency.

## Phase 3: UI Components

### Conflict Editor
- [ ] T010 [FR-003][FR-016] Implement ConflictFileEditor.vue with syntax highlighting for conflict blocks.
- [ ] T011 [FR-003][FR-017] Add dynamic line numbers that account for conflict markers.
- [ ] T012 [FR-003] Add visual indicators for conflict marker sections (ours/separator/theirs).

### Resolution Modal
- [ ] T013 [FR-002] Implement ConflictResolutionModal.vue with file list and resolution status.
- [ ] T014 [FR-002] Add continue/abort workflow controls with confirmation dialogs.

## Phase 4: AI Integration

### AI Resolution
- [ ] T015 [FR-004][FR-018] Implement AI resolve endpoint in `server/api/rebase/ai-resolve.post.ts` with rate limiting.
- [ ] T016 [FR-004][FR-018] Add per-file AI resolve button in ConflictFileEditor.vue.
- [ ] T017 [FR-019] Add "AI Resolve All" batch operation in ConflictResolutionModal.vue with progress tracking.
- [ ] T018 [FR-018][FR-019] Implement `aiResolveConflictFile` and `aiResolveAllConflicts` actions in `stores/chat.ts`.

## Phase 5: Testing & Polish

### Testing
- [ ] T019 [FR-001][FR-002][FR-003] Add unit tests for conflict marker parsing and state transitions.
- [ ] T020 [FR-004][FR-018][FR-019] Add integration tests for AI resolution with mock responses.
- [ ] T021 [All FRs] Add E2E tests for complete conflict resolution workflow.

## Dependencies

- Tasks T006-T009 depend on T001-T005 (need types and APIs first)
- Tasks T010-T014 depend on T006-T009 (need state management)
- Tasks T015-T018 depend on T005 and T010-T014 (need types and UI)
- Tasks T019-T021 can run in parallel after their respective phases complete

## Checkpoints

- **Checkpoint 1**: After Phase 1 - Basic conflict detection working
- **Checkpoint 2**: After Phase 2 - State persistence verified
- **Checkpoint 3**: After Phase 3 - Manual resolution fully functional
- **Checkpoint 4**: After Phase 4 - AI integration complete
- **Checkpoint 5**: After Phase 5 - All tests passing

## Summary

Total Tasks: 21
- Phase 1 (Infrastructure): 5 tasks
- Phase 2 (State): 4 tasks
- Phase 3 (UI): 4 tasks
- Phase 4 (AI): 4 tasks
- Phase 5 (Testing): 3 tasks

All functional requirements are covered:
- FR-001: T001, T019
- FR-002: T002, T003, T004, T013, T014, T019
- FR-003: T010, T011, T012, T019
- FR-004: T015, T016, T020
- FR-016: T010
- FR-017: T011
- FR-018: T015, T016, T018, T020
- FR-019: T017, T018, T020
- FR-020: T005
- FR-021: T006
- FR-006D: T007
- FR-006E: T008
- FR-006F: T009
