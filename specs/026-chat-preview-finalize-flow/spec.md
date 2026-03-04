# Feature Specification: Chat Preview & Finalize Flow

**Feature Branch**: `026-chat-preview-finalize-flow`
**Created**: 2026-02-16
**Status**: Draft (Child Spec)
**Parent**: `011-chat-worktree-integration` 

## In Scope

- Preview/sync/finalize/rebase APIs
- Preview/finalize/rebase UI state in Chat Panel
- Preview/finalize store sections

## Out of Scope

- Worktree creation/deletion core lifecycle
- Conflict resolution editor/API internals

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST preview and unpreview a conversation safely.
- **FR-002**: System MUST sync preview branch on new worktree commits, and client callers MUST treat preview-sync `success: false` as a failure signal (not silent success) with actionable logging/surface behavior.
- **FR-003**: System MUST finalize conversation work with branch-target control.
- **FR-004**: System MUST support rebase flow and surface conflict state transitions.
- **FR-005**: System MUST prevent cascade automation from reusing finalized conversations and MUST provide clear error messaging to archive first.

## Success Criteria *(mandatory)*

- **SC-001**: Preview/finalize flows execute without lifecycle API edits.
- **SC-002**: UI controls match runtime state and disable invalid actions.
- **SC-003**: Cascade automation respects finalized state and provides actionable error messages.
