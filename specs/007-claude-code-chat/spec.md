# Feature Specification: Claude Code Chat

**Feature Branch**: `007-claude-code-chat`
**Created**: 2026-02-02
**Status**: Implemented
**Input**: User description: "Implement Claude Code chat using the local Claude Code CLI"

## Related Specs

Features originally part of this spec have been split into focused specs:

- **009-conversation-management** - Conversation list, persistence, search, rename, delete
- **010-chat-permission-system** - Permission modes (plan/ask/auto/bypass), request/approval UI
- **011-chat-worktree-integration** - Worktree isolation, preview, finalize, recovery
- **012-cascade-automation** - Kanban cascade pipeline (Plan → Tasks → Implement)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Interactive Chat Conversation (Priority: P1)

As a developer using Spec Cat, I want to have an interactive chat conversation with Claude using the local Claude Code CLI so that I can get coding assistance, ask questions about my codebase, and receive AI-powered help directly within the application.

**Acceptance Scenarios**:

1. **Given** the chat panel is open, **When** I type a message and press send (or Enter), **Then** I see my message displayed and receive a streaming response from Claude.
2. **Given** Claude is responding, **When** the response is being generated, **Then** I see the response text appearing incrementally with an animated cursor.
3. **Given** Claude is generating, **When** I click the stop button, **Then** generation stops and the partial response is preserved.
4. **Given** the last message errored, **When** I click retry, **Then** the message is resent.

---

### User Story 2 - Chat Panel Toggle & Resize (Priority: P1)

As a developer, I want to quickly open/close and resize the chat panel so that I can access Claude while maintaining focus on my main work area.

**Acceptance Scenarios**:

1. **Given** the chat panel is closed, **When** I click the toggle button, **Then** the panel opens from the right side.
2. **Given** the chat panel is open, **When** I drag the left edge, **Then** I can resize the panel (300px-600px).
3. **Given** I resize the panel, **When** I refresh the browser, **Then** my panel width is preserved.

---

### Edge Cases

- Claude Code CLI not installed or not authenticated → Display "Claude CLI Error: {message}"
- Network disconnection during response → Display "Connection closed: {reason} (code: {code})"
- Claude CLI process crashes → Display "Claude CLI exited unexpectedly (code: {exitCode}, signal: {signal})"
- Invalid JSON from server → Display "Failed to parse server response: {error}"
- PTY process spawn failure → Display "Failed to start Claude CLI: {error}"
- Session corruption → Auto-retry without --resume flag

## Requirements *(mandatory)*

### Functional Requirements

#### Chat Panel
- **FR-001**: System MUST provide a chat panel on the right side of the application
- **FR-002**: System MUST provide a toggle button to open/close the chat panel
- **FR-003**: System MUST allow users to type and send text messages to Claude
- **FR-004**: System MUST display Claude's responses in a conversational format (role-based styling)
- **FR-005**: System MUST stream Claude's responses in real-time (text appears incrementally with animated cursor)
- **FR-006**: System MUST show a bounce loading indicator while Claude is generating
- **FR-007**: System MUST maintain conversation history within the current session
- **FR-008**: System MUST automatically scroll to show new messages (with 50px threshold detection)
- **FR-009**: System MUST pass the current working directory context to the Claude Code CLI
- **FR-010**: System MUST display the current working directory (abbreviated) in the chat panel header
- **FR-011**: System MUST provide a stop button to abort in-progress response generation
- **FR-012**: System MUST provide a way to start a new conversation
- **FR-017**: System MUST allow resizing the chat panel width (300px-600px, default 400px, persisted to localStorage)

#### Error Handling
- **FR-013**: System MUST handle and display errors gracefully
- **FR-013a**: System MUST display detailed error messages including the cause
- **FR-013b**: System MUST log errors to browser console for debugging
- **FR-013c**: System MUST allow users to dismiss error banners
- **FR-013d**: System MUST handle WebSocket connection errors with descriptive messages
- **FR-013e**: System MUST handle Claude CLI process failures (non-zero exit codes, spawn failures)
- **FR-013f**: System MUST handle JSON parsing errors from server responses

#### Input & Keyboard
- **FR-014**: System MUST prevent sending messages while Claude is currently responding
- **FR-015**: System MUST preserve message formatting (code blocks, inline code, bold, line breaks) via simple markdown rendering
- **FR-016**: System MUST support Enter to send, Shift+Enter for newline
- **FR-016a**: System MUST provide a retry button when the last message errored
- **FR-018**: System MUST route all AI requests through the configured `claudeModel` setting (no per-request model overrides)

### Key Entities

- **ChatMessage**: role (user/assistant), content, timestamp, status (streaming/stopped/error)
- **ChatSession**: sessionId, cwd, status (idle/streaming/error)
- **ChatPanelState**: isOpen, width

## Success Criteria *(mandatory)*

### Measurable Outcomes

- [x] Users can send messages and receive streaming responses
- [x] Response streaming is visible (text appears incrementally with cursor)
- [x] Multi-turn conversations maintain context via session ID
- [x] Stop button halts generation immediately
- [x] New conversation starts fresh without page reload
- [x] Error states are communicated clearly with dismissible banners
- [x] Code blocks are displayed with proper formatting

## Technical Implementation

### Components
- `components/chat/ChatPanel.vue` - Main panel with header, CWD display, close button
- `components/chat/ChatPanelToggle.vue` - Toggle button for panel visibility
- `components/chat/ChatMessages.vue` - Message list with auto-scroll and loading indicator
- `components/chat/ChatMessage.vue` - Individual message with markdown rendering
- `components/chat/ChatInput.vue` - Input textarea, send/stop/retry buttons

### Store
- `stores/chat.ts` - Messages, session state, panel state, streaming state

### Composables
- `composables/useChatStream.ts` - WebSocket streaming, message handling
- `composables/useChatPanel.ts` - Panel toggle, resize with mouse drag
- `composables/useAutoScroll.ts` - Auto-scroll with 50px threshold detection

### Types
- `types/chat.ts` - ChatMessage, ChatSession, ChatPanelState, MessageStatus, SessionStatus

### Server APIs
- `POST /api/chat` - Send message with SSE streaming (alternative to WebSocket)

### WebSocket
- `/_ws` - Claude CLI streaming with PTY, session handling

### Server Utilities
- `server/utils/claude.ts` - Claude CLI path detection (system, which, node_modules)
- `server/utils/claudeService.ts` - Claude SDK query() for one-off operations
- `server/utils/claudeModel.ts` - Resolve configured `claudeModel` for all AI calls

## Assumptions

- Claude Code CLI (`@anthropic-ai/claude-code`) is installed as project dependency
- Users have authenticated with Claude Code CLI
- node-pty is available for PTY-based CLI interaction

## Out of Scope

- File upload or image input capabilities
- Voice input/output
- Sharing or exporting conversations
- Custom system prompts or persona configuration
- Syntax highlighting in code blocks (simple markdown only)
