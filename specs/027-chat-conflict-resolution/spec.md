# Feature Specification: Chat Conflict Resolution

**Feature Branch**: `027-chat-conflict-resolution`
**Created**: 2026-02-16
**Status**: Draft (Child Spec)
**Parent**: `011-chat-worktree-integration` 

## In Scope

- Rebase conflict APIs
- Conflict resolution modals/editors
- Optional AI resolve integration for conflicts

## Out of Scope

- Worktree lifecycle operations
- Preview/finalize primary flow wiring

## Owned Files

- `server/api/rebase/*`
- `components/chat/ConflictResolutionModal.vue`
- `components/chat/ConflictFileEditor.vue`
- `stores/chat.ts` (conflict state section)

## Do Not Edit

- `server/api/chat/worktree*.ts`
- `server/api/chat/preview*.ts`
- `server/api/chat/finalize.post.ts`

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST fetch conflict files for unresolved rebases/finalize.
- **FR-002**: System MUST allow per-file resolution and continue/abort flow.
- **FR-003**: Conflict editor MUST support readable conflict block workflows.
- **FR-004**: Optional AI-assisted conflict resolution MUST remain bounded to conflict APIs.

## Success Criteria *(mandatory)*

- **SC-001**: Conflict workflow can complete without touching lifecycle/preview files.
- **SC-002**: Conflict UI/API interactions are reproducible across retries.
