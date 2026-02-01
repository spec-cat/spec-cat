# Data Model: Conversation Archive & Reopen

**Feature**: 019-conversation-archive
**Date**: 2026-02-14

## Entity: Conversation (Active)

Represents an active chat in the main conversation list.

Fields:
- `id: string` (generated `conv-*`, unique)
- `title: string` (default `New Conversation`, renameable)
- `messages: ChatMessage[]` (full active history)
- `createdAt: string` (ISO-8601)
- `updatedAt: string` (ISO-8601)
- `cwd: string`
- `providerId?: string`
- `providerModelKey?: string`
- `providerSessionId?: string`
- `worktreePath?: string`
- `worktreeBranch?: string`
- `hasWorktree?: boolean`
- `baseBranch?: string`
- `previewBranch?: string`
- `featureId?: string`
- `finalized?: boolean`
- `autoMode?: boolean`
- `restoredFromArchiveId?: string` (new: linkage to consumed archive source)

Validation rules:
- Required base fields must be present and string/array typed.
- `messages` array items must satisfy existing `ChatMessage` guards.
- `id` must be unique within active list.
- Active list size must remain `<= MAX_CONVERSATIONS`.

State transitions:
- `Active -> Archived` via archive operation.
- `Archived -> ActiveCopy` via restore operation (creates new `Conversation` and consumes archive source).

## Entity: ArchivedConversation

Immutable snapshot of an active conversation at archive time.

Fields:
- `id: string` (generated `arch-*`, unique)
- `sourceConversationId: string` (original active id)
- `title: string`
- `messages: ChatMessage[]` (full copied history)
- `createdAt: string` (source created time)
- `updatedAt: string` (source updated time at archive moment)
- `archivedAt: string` (ISO-8601)
- `cwd: string`
- `providerId?: string`
- `providerModelKey?: string`
- `featureId?: string`
- `baseBranch?: string`

Validation rules:
- Required fields must exist and satisfy scalar/array types.
- `archivedAt` must be valid ISO datetime.
- `id` must be unique within archive list.
- Snapshot payload is write-once; restore uses copied content and removes source entry from archive list.

State transitions:
- Created only from `Conversation` archive operation.
- Consumed by restore into a new active copy.
- Removable by explicit archive-delete action.

## Entity: RestoreOperation (logical)

Audit/logical event representing archive reopen action.

Fields:
- `archiveId: string`
- `newConversationId: string`
- `restoredAt: string`

Validation rules:
- `archiveId` must reference existing `ArchivedConversation.id`.
- Restore blocked if active count limit reached.

## Aggregate: StoredConversationsV2

Persisted root payload in `conversations.json`.

Fields:
- `version: number` (target `2`)
- `conversations: Conversation[]`
- `archivedConversations: ArchivedConversation[]`

Migration rules:
- If payload is v1 (`conversations[]` only), map to v2 with:
  - `conversations = conversations`
  - `archivedConversations = []`
  - `version = 2` in next persisted write.
- Invalid records in either array are discarded independently.

## Relationships

- `ArchivedConversation.sourceConversationId` references historical source active conversation id.
- `Conversation.restoredFromArchiveId` references `ArchivedConversation.id` for reopened conversations.
- One archive entry can produce at most one restored active conversation (restore consumes archive entry).
