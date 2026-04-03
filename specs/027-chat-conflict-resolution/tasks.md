# Tasks: Chat Conflict Resolution (AI-First)

**Feature**: 027-chat-conflict-resolution | **Status**: Complete | **Updated**: 2026-04-03

## Phase 1: Type Definitions & API Update

### Types
- [x] T001 [FR-007] Update `AiResolveRequest` in `types/chat.ts` to add `userGuidance?: string` field.
- [x] T002 [FR-008] Add `ConflictChatMessage` interface in `types/chat.ts` with role, content, timestamp, and optional fileRef fields.

### API
- [x] T003 [FR-004][FR-007] Update `server/api/rebase/ai-resolve.post.ts` to accept `userGuidance` in request body and include it in AI prompt. Enforce settings-configured provider (no silent Claude fallback).

## Phase 2: Store Updates

- [x] T004 [FR-010][FR-008] Add `conflictChatMessages` array and `userGuidance` field to conflict state in `stores/chat.ts`. Add `addConflictChatMessage()` helper.
- [x] T005 [FR-006][FR-008] Update `aiResolveAllConflicts()` in store to post progress messages (start, per-file processing, per-file result, completion summary) to conflict chat messages.
- [x] T006 [FR-010] Track conflict lifecycle states (detected, resolving, resolved, failed, aborted) in conflict state.

## Phase 3: UI Components

### ConflictFileEditor Simplification
- [x] T007 [FR-003] Remove manual editing controls from `ConflictFileEditor.vue`: Accept Ours/Theirs/Both buttons, edit mode toggle, inline conflict action buttons, Mark Resolved button. Keep read-only syntax-highlighted viewer.

### ConflictChatPanel (New Component)
- [x] T008 [FR-008][FR-009] Create `components/chat/ConflictChatPanel.vue` with scrollable message list displaying conflict chat messages (system, progress, error types).
- [x] T009 [FR-007] Add guidance text input area at bottom of ConflictChatPanel with placeholder text explaining its purpose.
- [x] T010 [FR-006] Add "Resolve Conflicts Automatically" button in ConflictChatPanel bottom area, triggers `aiResolveAllConflicts()` with user guidance.

### Modal Layout Overhaul
- [x] T011 [FR-005] Rewrite `ConflictResolutionModal.vue` to three-panel layout: file list (left), file viewer (center), chat panel (right). Widen modal to `max-w-7xl`.
- [x] T012 [FR-002] Keep Continue Rebase and Abort buttons in header. Remove AI Resolve All button from header (moved to chat panel).

## Phase 4: Verification & Integration

- [x] T013 [FR-001] Verify `conflicts.get.ts` endpoint returns all conflicted files with paths, conflict types, and marker locations, and meets < 500ms response target.
- [x] T014 [FR-011] Verify AI resolution flow calls `resolveConflictFile` after each successful resolve to write content to disk and execute `git add`.
- [x] T015 [FR-012] Verify `continueRebase` performs pre-flight validation ensuring all conflicts are resolved in git and state matches filesystem.

## Dependencies

- T003 depends on T001 (needs updated type)
- T004-T006 depend on T002 (needs ConflictChatMessage type)
- T005 depends on T003 (needs updated API)
- T007 is independent
- T008-T010 depend on T004 (needs store support)
- T011 depends on T007-T010 (needs all sub-components)
- T012 depends on T011 (modal layout)
- T013 is independent (verifies existing endpoint)
- T014 depends on T005 (needs AI resolve-all flow)
- T015 depends on T012 (needs continue button wired)

## Execution Order

1. T001, T002 (types, parallel)
2. T003 (API update)
3. T004, T007 (store + editor, parallel)
4. T005, T006 (store updates)
5. T008, T009, T010 (chat panel)
6. T011, T012 (modal layout)
7. T013, T014, T015 (verification & integration)

## FR Traceability

| FR | Tasks |
|----|-------|
| FR-001 | T013 |
| FR-002 | T012 |
| FR-003 | T007 |
| FR-004 | T003 |
| FR-005 | T011 |
| FR-006 | T010 |
| FR-007 | T001, T003, T009 |
| FR-008 | T002, T004, T005, T008 |
| FR-009 | T008 |
| FR-010 | T006 |
| FR-011 | T014 |
| FR-012 | T015 |
