# Feature Specification: Conversation Management

**Feature Branch**: `009-conversation-management`
**Created**: 2026-02-08
**Status**: Implemented
**Split from**: `007-ai-provider-chat` (original FR-018 ~ FR-028)
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

---

### Edge Cases

- localStorage full → Block new conversation creation at 100 conversations; display message instructing user to delete an existing conversation
- Corrupted conversation data → Discard only corrupted entries, load valid ones, show toast notification informing user that some conversations could not be loaded

## Clarifications

### Session 2026-02-08

- Q: What should happen at the 100-conversation limit? → A: Block creation until user deletes a conversation (hard limit, not soft warning).
- Q: What should "graceful load failure" mean for corrupted data? → A: Discard only corrupted entries, load valid ones, show toast notification.
- Q: Are worktree fields (worktreePath, worktreeBranch, baseBranch, featureId) owned by 009 or 011? → A: Owned by 011-chat-worktree-integration; 009 only manages core conversation fields.
- Q: What debounce interval for auto-save (FR-009) and search (FR-010)? → A: 400ms for both.

## Requirements *(mandatory)*

### Functional Requirements

#### Conversation List
- **FR-001**: System MUST display a list of all conversations on the main Chat page, sorted by newest created first
- **FR-002**: System MUST persist conversations to localStorage (hard limit 100, key: `spec-cat-conversations`). When 100 conversations exist, new conversation creation MUST be blocked with a message instructing the user to delete an existing conversation first.
- **FR-003**: System MUST allow users to select a conversation to load it in the chat panel
- **FR-004**: System MUST auto-generate conversation titles from the first user message (50 char truncation)
- **FR-005**: System MUST allow users to rename conversation titles inline (Enter/Escape/blur to save)
- **FR-006**: System MUST allow users to delete conversations with confirmation modal
- **FR-007**: System MUST display conversation metadata (title, last message preview, timestamp). Worktree branch and path display is owned by 011-chat-worktree-integration.
- **FR-007a**: *(Moved to 011-chat-worktree-integration)* Worktree branch and path pill-style buttons with clipboard copy
- **FR-008**: System MUST sort conversations by `createdAt` descending (newest created first)
- **FR-009**: System MUST automatically save messages (debounced at 400ms per conversation)
- **FR-010**: System MUST provide search/filter for conversations (debounced at 400ms, searches title + content)
- **FR-011**: System MUST show streaming status badge (animated dot) on active conversations in list

### Key Entities

- **Conversation**: id, title, createdAt, updatedAt, messages[] (worktreePath?, worktreeBranch?, baseBranch?, featureId? are defined by 011-chat-worktree-integration)

See `specs/007-ai-provider-chat/data-model.md` for full entity definitions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- [x] Conversation list shows all past conversations
- [x] Conversations persist across browser refreshes
- [x] Users can delete, rename, and search conversations
- [x] Streaming status badge shows on active conversations

## Technical Implementation

### Components
- `components/chat/ConversationList.vue` - Search, filter, manage conversations
- `components/chat/ConversationItem.vue` - Conversation with inline edit, streaming badge
- `components/chat/DeleteConfirmModal.vue` - Deletion confirmation modal

### Store
- `stores/chat.ts` - Conversation CRUD, activeConversationId, sorting, search

### Utilities
- `utils/conversationStorage.ts` - localStorage load/save for conversations

### Types
- `types/chat.ts` - Conversation, generateConversationId, generateTitle

## Assumptions

- localStorage is available and sufficient for conversation storage
- Max 100 conversations (hard limit — creation blocked, not just warned)

## Out of Scope

- Server-side conversation persistence
- Sharing or exporting conversations
- Conversation tagging or categorization
