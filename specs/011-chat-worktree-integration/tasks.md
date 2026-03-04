# Implementation Tasks: Chat Worktree Integration

**Feature Branch**: `011-chat-worktree-integration`
**Created**: 2026-02-08
**Updated**: 2026-03-04
**Dependencies**: 007-ai-provider-chat, 009-conversation-management

## Child Execution Lanes

Active implementation is split across child specs:
- `specs/025-chat-worktree-lifecycle/tasks.md`
- `specs/026-chat-preview-finalize-flow/tasks.md`
- `specs/027-chat-conflict-resolution/tasks.md`

This file maintains parent-level task tracking for traceability.

## Phase 1: Worktree Lifecycle Foundation

### Core Worktree Operations
- [x] T001: Implement POST /api/chat/worktree endpoint [FR-001] [FR-001a] [FR-001b] [FR-002] [FR-024]
- [x] T002: Implement DELETE /api/chat/worktree endpoint [FR-007]
- [x] T003: Create ensureChatWorktree.ts utility for recovery [FR-008]
- [x] T004: Create validateWorktree.ts security utility [FR-001]
- [x] T005: Extend Conversation type with worktree fields [FR-001]

### Store Integration
- [x] T006: Add createConversation with baseBranch support to chat store [FR-024]
- [x] T007: Add worktree cleanup to deleteConversation [FR-007]
- [x] T008: Add worktree recovery handling in store [FR-008]

## Phase 2: Auto-commit Integration

### Streaming Integration
- [x] T009: Implement POST /api/chat/worktree-commit endpoint [FR-003]
- [x] T010: Integrate auto-commit into useChatStream composable [FR-003]
- [x] T011: Add AI-generated commit messages via Claude Haiku [FR-003]
- [x] T012: Handle session corruption with auto-retry [FR-009]

## Phase 3: Preview Management

### Preview Infrastructure
- [x] T013: Implement POST /api/chat/preview endpoint [FR-004] [FR-013]
- [x] T014: Implement DELETE /api/chat/preview endpoint [FR-004]
- [x] T015: Implement POST /api/chat/preview-sync endpoint [FR-005]
- [x] T016: Add global previewingConversationId state [FR-010]

### Preview UI
- [x] T017: Add preview toggle button to ChatPanel [FR-004]
- [x] T018: Implement preview switching logic in store [FR-011]
- [x] T019: Add visual preview indicator to ConversationItem [FR-012]
- [x] T020: Show base branch info on conversation cards [FR-021]

## Phase 4: Finalize Flow

### Core Finalize
- [x] T021: Implement POST /api/chat/finalize endpoint [FR-006] [FR-006b]
- [x] T022: Create FinalizeConfirm.vue dialog component [FR-006a] [FR-006e]
- [x] T023: Add finalize action to chat store [FR-006]
- [x] T024: Mark finalized conversations as read-only [FR-014]

### Finalize Enhancements
- [x] T025: Implement POST /api/chat/generate-commit-message [FR-006d]
- [x] T026: Add AI generate button to FinalizeConfirm dialog [FR-006d]
- [x] T027: Add target branch selector to FinalizeConfirm [FR-006e]
- [x] T028: Hide buttons when no commits to finalize [FR-006f]
- [x] T029: Support retry finalize after conflicts [FR-006c]

## Phase 5: Rebase Feature

### Rebase Implementation
- [ ] T030: Implement POST /api/chat/rebase endpoint [FR-022] [FR-022e] [FR-022f]
- [ ] T031: Create RebaseConfirm.vue dialog component [FR-022] [FR-022a] [FR-022b]
- [ ] T032: Add branch dropdown to RebaseConfirm [FR-022a] [FR-022b]
- [ ] T033: Display worktree info in RebaseConfirm [FR-022c]
- [ ] T034: Update commit count on branch selection change [FR-022d]
- [ ] T035: Add rebaseConversation action to store [FR-022] [FR-022e]

## Phase 6: Conflict Resolution

### Conflict Infrastructure
- [ ] T036: Implement GET /api/rebase/conflicts endpoint [FR-016] [FR-017]
- [ ] T037: Implement PUT /api/rebase/resolve endpoint [FR-018]
- [ ] T038: Implement POST /api/rebase/continue endpoint [FR-019]
- [ ] T039: Implement POST /api/rebase/abort endpoint [FR-020]

### Conflict UI
- [ ] T040: Create ConflictResolutionModal.vue component [FR-016] [FR-019]
- [ ] T041: Create ConflictFileEditor.vue with syntax highlighting [FR-016] [FR-017]
- [ ] T042: Add conflict marker visual distinction [FR-016]
- [ ] T043: Implement POST /api/rebase/ai-resolve endpoint [FR-018] [FR-020]
- [ ] T044: Add AI Resolve button per file [FR-018]
- [ ] T045: Add AI Resolve All button [FR-019]
- [ ] T046: Add per-conflict-block actions (VS Code style) [FR-023]

## Phase 7: Multi-Conversation Support

### Concurrent Operations
- [x] T047: Add ConversationStreamState tracking [FR-015]
- [x] T048: Support concurrent streaming sessions [FR-015]
- [x] T049: Isolate stream states per conversation [FR-015]

## Phase 8: UI Polish

### New Conversation Flow
- [x] T050: Create NewConversationModal.vue component [FR-024]
- [x] T051: Add base branch selector dropdown [FR-024]
- [x] T052: Update ConversationsPanel to use modal [FR-024]
- [x] T053: Pass selected baseBranch to worktree creation [FR-024]

### Legacy Support
- [x] T054: Handle FR-034 and FR-042 legacy references [FR-034] [FR-042]

## Phase 9: Performance Hardening

### Branch API + Create Flow
- [x] T055: Replace branch metadata N+1 (`git show` per branch) with a bulk `for-each-ref` query in branch API [FR-025]
- [x] T056: Add `excludeSc=true` query support to branch API and use it from NewConversationModal [FR-026]
- [x] T057: Switch `createConversation()` default create-path persistence from full snapshot save to incremental conversation save [FR-027]
- [x] T058: Add per-step and total latency logs for worktree creation path and reduce verify/resolve command count [FR-028]
- [x] T059: Unmount right-side panels in chat fullscreen mode (`v-if`) to prevent hidden reactive overhead [FR-029]
- [x] T060: Add repeatable branch API benchmark script + scenario envelope docs + package script [FR-030]

## Summary

- **Total Tasks**: 60
- **Completed**: 48
- **Remaining**: 12 (Phase 5 & 6)
- **Progress**: 80%

## Notes

- All tasks include proper FR traceability tags
- Implementation details in child lane task files
- Phases can run partially in parallel where no dependencies exist
