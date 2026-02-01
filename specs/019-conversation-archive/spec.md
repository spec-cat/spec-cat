# Feature Specification: Conversation Archive & Reopen

**Feature Branch**: `019-conversation-archive`
**Created**: 2026-02-14
**Status**: Implemented (aligned to repository behavior on 2026-02-14)
**Input**: User description: "After merge/finalize, conversations should not be deleted immediately. Replace trash action with archive action, provide an archive area for later browsing, and when an archived item is clicked, create a new conversation that shows the original context."
**Dependencies**: 009-conversation-management, 011-chat-worktree-integration

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Archive Instead of Delete (Priority: P1)

A developer wants to keep historical context after merge/finalize. Instead of deleting a conversation from the list, they archive it so it disappears from active conversations but remains retrievable.

**Why this priority**: This changes the core safety model from destructive deletion to reversible archival and directly addresses context loss.

**Independent Test**: Archive any active/finalized conversation from the conversation list and verify it is removed from active view and appears in archive view.

**Acceptance Scenarios**:

1. **Given** a conversation item is shown in the conversation list, **When** the user clicks the archive icon, **Then** the conversation is archived (not deleted) and removed from the active list.
2. **Given** a conversation was archived, **When** the archive action completes, **Then** all conversation messages and metadata are preserved for later restore.
3. **Given** a conversation is currently streaming, **When** the user tries to archive it, **Then** the archive action is blocked with a clear message.
4. **Given** the existing delete icon is currently visible, **When** this feature is enabled, **Then** the primary destructive action in conversation items is replaced by archive.

---

### User Story 2 - Browse Archived Conversations (Priority: P1)

A developer wants a dedicated place to browse archived conversations after merge/finalize, so they can inspect what was done without cluttering active chats.

**Why this priority**: Archive is only useful if users can find and navigate archived entries.

**Independent Test**: Enter archive view from the conversation panel and verify archived conversations are listed with searchable metadata.

**Acceptance Scenarios**:

1. **Given** there are archived conversations, **When** the user clicks the archive entry point (archive icon/button), **Then** the UI navigates to an archive list view.
2. **Given** archive list is open, **When** the user searches by title/content, **Then** archived items are filtered by title and message content.
3. **Given** archive list is open, **When** there are no archived items, **Then** the UI shows an empty-state message explaining that archived conversations appear here.
4. **Given** archive list is open, **When** items are shown, **Then** each item shows title, archived timestamp, updated timestamp, and a short preview.

---

### User Story 3 - Reopen Archived Context into New Conversation (Priority: P1)

A developer clicks an archived conversation to continue work with full historical context. The system creates a new active conversation, injects the archived context into it, and consumes the archive entry.

**Why this priority**: This is the core recovery flow requested by users and enables safe continuation while moving the archived item back into active work.

**Independent Test**: Click an archived conversation and verify a new conversation is created, selected, and populated with original context.

**Acceptance Scenarios**:

1. **Given** an archived conversation item, **When** the user clicks it, **Then** a new active conversation is created and selected.
2. **Given** a new conversation is created from archive, **When** it opens in chat panel, **Then** the original archived context (full message history and key metadata) is visible in that new conversation.
3. **Given** a conversation was reopened from archive, **When** restore succeeds, **Then** the archive entry is removed from archive list and exactly one new active conversation is created.
4. **Given** the archive source has metadata, **When** restore is performed, **Then** the restored conversation keeps linkage fields needed for feature-aware workflows (e.g., `featureId`) and starts with a fresh runtime worktree context.

---

### Edge Cases

- Archive requested for currently streaming conversation: block action and show toast.
- Archive list item points to corrupted payload: item is skipped and warning toast is shown; other archived items still load.
- Reopen from archive when active conversation count is at hard limit (100): block restore and show instruction to archive/close active chats first.
- Legacy conversations from pre-archive schema: load normally as active conversations.
- Archive requested for a conversation with worktree resources: worktree and branch cleanup must succeed before archive write is finalized.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST add an archive action for conversation items and replace the existing primary delete action in the conversation list UI.
- **FR-002**: Archiving a conversation MUST preserve full message history and relevant metadata in persistent storage while removing it from active conversation list.
- **FR-003**: System MUST provide an archive entry point in the conversation panel that opens an archive list view.
- **FR-004**: Archive list MUST display archived conversations sorted by `archivedAt` descending.
- **FR-005**: Archive list MUST support search/filter by title and message content.
- **FR-006**: Clicking an archived conversation MUST create a new active conversation and auto-select it.
- **FR-007**: Newly created conversation from archive MUST include original archived context (messages + metadata summary) so users can read prior context immediately.
- **FR-008**: Restoring from archive MUST create a new active conversation copy and consume the source archive entry from the archive list.
- **FR-009**: System MUST block archive action for conversations that are currently streaming.
- **FR-010**: System MUST keep active conversation hard limit behavior (`MAX_CONVERSATIONS=100`) unchanged; restore from archive is blocked when active list is at limit.
- **FR-011**: Existing finalized/preview/worktree flows MUST continue to function for active conversations without regression.
- **FR-012**: Storage load MUST remain backward-compatible with existing conversation schema versions; conversations without archive fields are treated as active.
- **FR-013**: Archive view MUST provide a permanent delete action for archived items.
- **FR-014**: Archive operation MUST remove any registered worktree and branch for the source conversation before persisting archive state.
- **FR-015**: Restore operation MUST create a fresh worktree path/branch for the restored conversation and reset transient runtime fields (`providerSessionId`, `previewBranch`, `finalized`).

### Key Entities

- **ArchivedConversation**: Immutable persisted snapshot of a conversation moved out of the active list.
  - Suggested fields: `id`, `sourceConversationId`, `title`, `messages`, `createdAt`, `updatedAt`, `archivedAt`, `cwd`, `providerId?`, `providerModelKey?`, `featureId?`, `baseBranch?`.
- **RestoreOperation**: Action that creates a new active conversation from one archived snapshot.
  - Suggested fields: `archiveId`, `newConversationId`, `restoredAt`, `consumedArchive: true`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can archive a conversation from the main list in one click and see it removed from active list immediately.
- **SC-002**: 100% of archived conversations are visible in archive list after page refresh.
- **SC-003**: Reopening an archived item creates a new conversation with preserved context in under 1 second for typical conversation sizes (<500 messages).
- **SC-004**: Each restore removes exactly one archive entry and creates exactly one active conversation with copied message history.
- **SC-005**: Existing finalize and preview workflows for non-archived active conversations continue to pass current manual checks.

## Assumptions

- Archive and active conversations are persisted in the same storage backend currently used by chat state.
- Archive is user-facing replacement for delete in the main active list.
- Permanent deletion is available only from archive view.
- Restored conversations are intended to continue discussion and therefore become regular active conversations after creation.

## Out of Scope

- Server-side/cloud sync for archived conversations.
- Bulk archive/restore operations.
- Archive retention policy, TTL, or automatic cleanup.
- Cross-device archive sharing.
