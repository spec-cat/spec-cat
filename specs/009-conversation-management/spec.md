# Feature Specification: Conversation Management

**Feature Branch**: `009-conversation-management`
**Created**: 2026-02-08
**Updated**: 2026-03-21
**Status**: Implemented
**Split from**: `007-ai-provider-chat`
**Dependencies**: 007-ai-provider-chat

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conversation List & Persistence (Priority: P2)

As a developer, I want to manage multiple conversations so that I can organize different topics and find previous discussions.

**Acceptance Scenarios**:

1. **Given** I navigate to the Chat page, **When** the page loads, **Then** I see a list of all conversations sorted by newest created first.
2. **Given** I click a conversation, **Then** it loads in the chat panel and I can continue chatting.
3. **Given** I have a conversation, **When** I click edit, **Then** I can rename it inline (Enter to save, Escape to cancel).
4. **Given** I click delete, **Then** a confirmation modal appears before deletion.
5. **Given** I type in the search field, **Then** conversations are filtered by title and message content.
6. **Given** I have 100 conversations, **When** I try to create a new one, **Then** creation is blocked and a message instructs me to delete an existing conversation first.

### User Story 2 - Conversation Archive (Priority: P2)

As a developer, I want to archive completed conversations so that I can declutter my active list without losing history.

**Acceptance Scenarios**:

1. **Given** I click archive on a conversation, **Then** the conversation is moved to the archive with its worktree and branch cleaned up.
2. **Given** I view the archive list, **Then** I see archived conversations sorted by archive date with search/filter support.
3. **Given** I restore an archived conversation, **Then** it reappears in the active list.
4. **Given** I archive a conversation in one browser tab, **Then** the archive state syncs to all other connected browsers/tabs.

### User Story 3 - Cross-Browser Synchronization (Priority: P3)

As a developer using multiple browser tabs or devices, I want conversation state to stay synchronized across all connected clients.

**Acceptance Scenarios**:

1. **Given** a job is created from another browser/API, **When** I have the chat page open, **Then** the new conversation appears and streaming is set up automatically.
2. **Given** a conversation is archived in one browser, **Then** all other connected browsers remove it from their active list.
3. **Given** a conversation is streaming in the current tab, **When** another tab tries to subscribe, **Then** the duplicate is skipped.

---

### Edge Cases

- Server storage unavailable → API calls fail gracefully with error logging; client shows empty state
- Corrupted conversation file → Server skips corrupted JSON files; client discards entries failing `isValidConversation()` type guard
- 100 conversation limit → Block new conversation creation; display message instructing user to archive or delete
- Legacy migration → Server auto-migrates from single `conversations.json` to per-file storage on first read
- Stale archive events → `useGlobalNotifications` debounces refresh; streaming conversations are preserved during merge

## Clarifications

### Session 2026-02-08

- Q: What should happen at the 100-conversation limit? → A: Block creation until user deletes a conversation (hard limit, not soft warning).
- Q: What should "graceful load failure" mean for corrupted data? → A: Discard only corrupted entries, load valid ones, show toast notification.
- Q: Are worktree fields (worktreePath, worktreeBranch, baseBranch, featureId) owned by 009 or 011? → A: Owned by 011-chat-worktree-integration; 009 only manages core conversation fields.
- Q: What debounce interval for auto-save (FR-009) and search (FR-010)? → A: 400ms for both.

### Session 2026-03-21

- Q: Why move from localStorage to server-side? → A: Server-side persistence enables cross-browser sync, server-initiated jobs, and removes localStorage size limits.
- Q: What is the storage format? → A: Per-conversation JSON files under `~/.spec-cat/data/conversations/{id}.json`, archived conversations in `archived-conversations.json`.
- Q: How does cross-browser sync work? → A: Server emits events via EventBus → WebSocket global channel → `useGlobalNotifications` composable refreshes conversation list.

## Requirements *(mandatory)*

### Functional Requirements

#### Conversation List
- **FR-001**: System MUST display a list of all conversations on the main Chat page, sorted by newest created first
- **FR-002**: System MUST persist conversations to server-side filesystem storage (hard limit 100). Each conversation is stored as an individual JSON file under `~/.spec-cat/data/conversations/{id}.json`. When 100 conversations exist, new conversation creation MUST be blocked with a message instructing the user to archive or delete an existing conversation first.
- **FR-003**: System MUST allow users to select a conversation to load it in the chat panel
- **FR-004**: System MUST auto-generate conversation titles from the first user message (50 char truncation)
- **FR-005**: System MUST allow users to rename conversation titles inline (Enter/Escape/blur to save)
- **FR-006**: System MUST allow users to delete conversations with confirmation modal
- **FR-007**: System MUST display conversation metadata (title, last message preview, timestamp). Worktree branch and path display is owned by 011-chat-worktree-integration.
- **FR-008**: System MUST sort conversations by `createdAt` descending (newest created first)
- **FR-009**: System MUST automatically save messages (debounced at 400ms per conversation) via `POST /api/conversations/update` for single-conversation saves
- **FR-010**: System MUST provide search/filter for conversations (debounced at 400ms, searches title + content)
- **FR-011**: System MUST show streaming status on active conversations in list, distinguishing between active streaming (currently selected + streaming, brighter glow) and idle streaming (streaming in background, subtle animation)

#### Server-Side Persistence
- **FR-012**: System MUST provide REST API endpoints for conversation CRUD:
  - `GET /api/conversations` — read all conversations and archived conversations
  - `POST /api/conversations` — write all conversations (bulk save)
  - `POST /api/conversations/update` — upsert a single conversation (per-conversation save)
- **FR-013**: Server MUST store each conversation as a separate JSON file (`{id}.json`) in the conversations directory, enabling per-conversation atomic writes
- **FR-014**: Server MUST support legacy migration from single `conversations.json` to per-file storage, merging without duplicates

#### Archive System
- **FR-015**: System MUST allow archiving conversations via `POST /api/conversations/{conversationId}/archive`, which:
  - Creates an `ArchivedConversation` snapshot with `archivedAt` timestamp
  - Cleans up associated worktree (remove + prune) and branch (delete) before archiving
  - Blocks archive if worktree/branch cleanup fails
  - Emits `conversation_archived` event to all connected clients
- **FR-016**: System MUST provide `GET /api/conversations/archives` to list archived conversations sorted by `archivedAt` descending, with optional search query `?q=`
- **FR-017**: System MUST allow restoring archived conversations via `POST /api/conversations/archives/{archiveId}/restore`
- **FR-018**: System MUST allow deleting archived conversations via `DELETE /api/conversations/archives/{archiveId}`

#### Cross-Browser Synchronization
- **FR-019**: System MUST synchronize conversation state across connected browsers/tabs via EventBus → WebSocket global channel → `useGlobalNotifications` composable
- **FR-020**: When a `conversation_archived` event is received, the client MUST remove the archived conversation from the active list (debounced refresh) while preserving conversations that are currently streaming locally
- **FR-021**: When a `job_created` event is received from another browser/API, the client MUST set up streaming subscription for the new conversation if not already streaming locally

### Key Entities

- **Conversation**: id, title, createdAt, updatedAt, messages[], cwd (worktreePath?, worktreeBranch?, baseBranch?, featureId?, providerId?, providerModelKey?, providerSessionId? are defined by 011-chat-worktree-integration)
- **ArchivedConversation**: id, sourceConversationId, title, messages[], createdAt, updatedAt, archivedAt, cwd, providerId?, providerModelKey?, featureId?, baseBranch?

See `specs/007-ai-provider-chat/data-model.md` for full entity definitions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- [x] Conversation list shows all past conversations
- [x] Conversations persist across browser refreshes via server-side storage
- [x] Users can delete, rename, and search conversations
- [x] Streaming status badge shows on active conversations with active/idle distinction
- [x] Conversations can be archived with worktree cleanup
- [x] Archive state syncs across connected browsers/tabs
- [x] Per-conversation atomic saves via `POST /api/conversations/update`
- [x] Legacy migration from single-file to per-file storage works transparently

## Assumptions

- Server-side filesystem storage via `~/.spec-cat/data/` is available
- Max 100 active conversations (hard limit — creation blocked, not just warned)
- WebSocket connection is available for cross-browser sync notifications

## Out of Scope

- Sharing or exporting conversations
- Conversation tagging or categorization
- Full offline support (requires server connection)
