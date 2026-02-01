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

## Owned Files

- `server/api/chat/preview.post.ts`
- `server/api/chat/preview.delete.ts`
- `server/api/chat/preview-sync.post.ts`
- `server/api/chat/finalize.post.ts`
- `server/api/chat/rebase.post.ts`
- `components/chat/ChatPanel.vue` (preview/finalize/rebase controls)
- `stores/chat.ts` (preview/finalize section)

## Do Not Edit

- `server/api/chat/worktree*.ts`
- `server/api/rebase/*`
- `components/chat/Conflict*.vue`

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST preview and unpreview a conversation safely.
- **FR-002**: System MUST sync preview branch on new worktree commits.
- **FR-003**: System MUST finalize conversation work with branch-target control.
- **FR-004**: System MUST support rebase flow and surface conflict state transitions.

## Success Criteria *(mandatory)*

- **SC-001**: Preview/finalize flows execute without lifecycle API edits.
- **SC-002**: UI controls match runtime state and disable invalid actions.
