# Quickstart: Conversation Archive & Reopen

**Feature**: 019-conversation-archive
**Date**: 2026-02-14

## Prerequisites

- Repository at `/home/khan/src/brick2`
- Dependencies installed (`pnpm install`)
- Dev server running (`pnpm dev`)

## Validation Flow

1. Start with at least one non-streaming conversation in the panel.
2. Click the archive action on that conversation.
3. Verify the conversation disappears from active list immediately.
4. Open archive view from the conversation panel archive entry point.
5. Verify archived item appears with title, archived timestamp, updated timestamp, and preview text.
6. Use archive search with a known keyword from message content and verify filtering works.
7. Click an archived item to restore.
8. Verify a new active conversation is created and selected.
9. Verify restored conversation contains original message history and metadata context.
10. Verify the restored archive item is removed from archive view.
11. Send a new message in restored conversation and verify activity continues only in the restored active conversation.

## Edge-Case Checks

1. Attempt archive while target conversation is streaming; verify operation is blocked with clear message.
2. Fill active list to 100 conversations and attempt restore; verify restore is blocked with limit guidance.
3. Inject one corrupted archived record in persisted JSON; verify UI skips bad record and still loads valid archives.
4. Load legacy v1 conversation payload (without archive fields) and verify all records appear as active.

## API Smoke Checks

- `GET /api/conversations/archives` returns archive list sorted by `archivedAt` DESC.
- `POST /api/conversations/{conversationId}/archive` archives one active conversation.
- `POST /api/conversations/archives/{archiveId}/restore` returns a newly created active conversation.
- `DELETE /api/conversations/archives/{archiveId}` permanently deletes one archived conversation.

## Done Criteria

- FR-001 through FR-012 satisfied in manual checks.
- Existing finalize/preview/worktree flows remain functional for active conversations.

## Validation Log (2026-02-14)

- `pnpm run lint`: failed (`ERR_PNPM_NO_SCRIPT`, no `lint` script in `package.json`)
- `pnpm test`: failed (`vitest` reported no test files)
- `pnpm typecheck`: failed due existing repository TypeScript errors unrelated to archive flow completion
- Manual UI flow validation was not executed in this AI session because running `pnpm dev` is disallowed by repo agent instructions.

## Operator Notes

- Archive replaces the primary conversation-row delete action in active view.
- Archive entries are snapshots; restore always creates a new active conversation and consumes the source archive entry.
- Restore retains workflow linkage metadata (`featureId`) and recalculates worktree/base branch context at restore time while dropping transient runtime session fields.
