# Feature Specification: Chat Worktree Lifecycle

**Feature Branch**: `025-chat-worktree-lifecycle`
**Created**: 2026-02-16
**Status**: Draft (Child Spec)
**Parent**: `011-chat-worktree-integration` 

## In Scope

- Worktree create/delete/commit API lifecycle
- Recovery/resolver utilities
- Lifecycle-centric chat store actions

## Out of Scope

- Preview/finalize/rebase UI flow
- Conflict resolution UI/API

## Owned Files

- `server/api/chat/worktree.post.ts`
- `server/api/chat/worktree.delete.ts`
- `server/api/chat/worktree-commit.post.ts`
- `server/utils/worktreeResolver.ts`
- `server/utils/ensureChatWorktree.ts`
- `stores/chat.ts` (worktree lifecycle section)

## Do Not Edit

- `server/api/chat/preview*.ts`
- `server/api/chat/finalize.post.ts`
- `server/api/rebase/*`
- `components/chat/Conflict*.vue`

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST create isolated worktrees for new conversations.
- **FR-002**: System MUST cleanup worktrees and branches on delete.
- **FR-003**: System MUST auto-commit turn results in conversation worktrees.
- **FR-004**: System MUST recover missing worktree directories from branch state.

## Success Criteria *(mandatory)*

- **SC-001**: Lifecycle APIs run without preview/finalize coupling.
- **SC-002**: Recovery flow restores conversation worktree continuity.
