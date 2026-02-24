# Feature Specification: AI Provider Chat

**Feature Branch**: `007-ai-provider-chat`
**Created**: 2026-02-02
**Status**: Implemented
**Input**: User description: "Implement multi-provider AI chat supporting Claude, Codex, and future providers"

## Related Specs

Features originally part of this spec have been split into focused specs:

- **009-conversation-management** - Conversation list, persistence, search, rename, delete
- **010-chat-permission-system** - Permission modes (plan/ask/auto/bypass), request/approval UI
- **011-chat-worktree-integration** - Worktree isolation, preview, finalize, recovery
- **012-cascade-automation** - Kanban cascade pipeline (Plan → Tasks → Implement)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Interactive Chat Conversation (Priority: P1)

As a developer using Spec Cat, I want to have an interactive chat conversation with AI providers (Claude, Codex, Gemini) so that I can get coding assistance, ask questions about my codebase, and receive AI-powered help directly within the application.

**Acceptance Scenarios**:

1. **Given** the chat panel is open, **When** I type a message and press send (or Enter), **Then** I see my message displayed and receive a streaming response from the selected AI provider.
2. **Given** the AI provider is responding, **When** the response is being generated, **Then** I see the response text appearing incrementally with an animated cursor.
3. **Given** the AI is generating, **When** I click the stop button, **Then** generation stops and the partial response is preserved.
4. **Given** the last message errored, **When** I click retry, **Then** the message is resent.

---

### User Story 2 - Chat Panel Toggle & Resize (Priority: P1)

As a developer, I want to quickly open/close and resize the chat panel so that I can access AI chat while maintaining focus on my main work area.

**Acceptance Scenarios**:

1. **Given** the chat panel is closed, **When** I click the toggle button, **Then** the panel opens from the right side.
2. **Given** the chat panel is open, **When** I drag the left edge, **Then** I can resize the panel (300px-600px).
3. **Given** I resize the panel, **When** I refresh the browser, **Then** my panel width is preserved.

---

### User Story 3 - AI Provider Selection (Priority: P1)

As a developer, I want to select between different AI providers and their models so that I can use the most suitable AI for my specific needs.

**Acceptance Scenarios**:

1. **Given** the settings panel is open, **When** I view the provider selector, **Then** I see all available providers (Claude, Codex, Gemini) with their capabilities.
2. **Given** a provider is selected, **When** I view the model dropdown, **Then** I see all available models for that provider.
3. **Given** I select a different provider/model, **When** I start a new conversation, **Then** the selected provider is used for responses.
4. **Given** a provider doesn't support certain features (e.g., permissions), **When** those features are required, **Then** the provider is shown as disabled with a clear reason.

---

### Edge Cases

- Provider CLI/SDK not installed or not authenticated → Display "{Provider} Error: {message}"
- Network disconnection during response → Display "Connection closed: {reason} (code: {code})" with close-code meaning fallback (for example, code `1005` = "No status code received from peer")
- Provider process crashes → Display "{Provider} exited unexpectedly (code: {exitCode}, signal: {signal})"
- Invalid JSON from server → Display "Failed to parse server response: {error}"
- Provider process spawn failure → Display "Failed to start {Provider}: {error}"
- Session corruption → Auto-retry without resume (for providers that support it)
- Provider not supporting required capability → Display in UI with reason, disable selection

## Requirements *(mandatory)*

### Functional Requirements

#### Chat Panel
- **FR-001**: System MUST provide a chat panel on the right side of the application
- **FR-002**: System MUST provide a toggle button to open/close the chat panel
- **FR-003**: System MUST allow users to type and send text messages to the selected AI provider
- **FR-004**: System MUST display AI responses in a conversational format (role-based styling)
- **FR-005**: System MUST stream AI responses in real-time (text appears incrementally with animated cursor) for providers that support streaming
- **FR-006**: System MUST show a bounce loading indicator while AI is generating
- **FR-007**: System MUST maintain conversation history within the current session
- **FR-008**: System MUST automatically scroll to show new messages (with 50px threshold detection)
- **FR-008a**: System MUST maintain scroll position at bottom when input area expands/contracts
- **FR-009**: System MUST pass the current working directory context to the AI provider
- **FR-010**: System MUST display the current working directory (abbreviated) in the chat panel header
- **FR-011**: System MUST provide a stop button to abort in-progress response generation
- **FR-012**: System MUST provide a way to start a new conversation
- **FR-017**: System MUST allow resizing the chat panel width (300px-600px, default 400px, persisted to localStorage)

#### Error Handling
- **FR-013**: System MUST handle and display errors gracefully
- **FR-013a**: System MUST display detailed error messages including the cause
- **FR-013b**: System MUST log errors to browser console for debugging
- **FR-013c**: System MUST allow users to dismiss error banners
- **FR-013d**: System MUST handle WebSocket connection errors with descriptive messages, including close code meaning fallback when `reason` is empty, `wasClean` state, and the last server error context when available
- **FR-013e**: System MUST handle provider process failures (non-zero exit codes, spawn failures)
- **FR-013f**: System MUST handle JSON parsing errors from server responses

#### Input & Keyboard
- **FR-014**: System MUST prevent sending messages while Claude is currently responding
- **FR-015**: System MUST preserve message formatting (code blocks, inline code, bold, line breaks) via simple markdown rendering
- **FR-016**: System MUST support Enter to send, Shift+Enter for newline
- **FR-016a**: System MUST provide a retry button when the last message errored
- **FR-016b**: System MUST grow the input area container height as the textarea expands with multi-line content (up to 200px max)
- **FR-018**: System MUST route all AI requests through the configured provider and model selection
- **FR-019**: System MUST render chat history with viewport-based virtualization so DOM node count remains bounded as message count grows

#### Provider Selection
- **FR-020**: System MUST support multiple AI providers (Claude, Codex, Gemini, and future providers)
- **FR-021**: System MUST allow users to select provider and model from available options
- **FR-022**: System MUST display provider capabilities (streaming, permissions, resume, etc.)
- **FR-023**: System MUST disable providers that don't support required capabilities with clear reasoning
- **FR-024**: System MUST persist provider/model selection to settings
- **FR-025**: System MUST use AIProvider interface for all provider interactions

### Key Entities

- **ChatMessage**: role (user/assistant), content, timestamp, status (streaming/stopped/error)
- **ChatSession**: sessionId, cwd, status (idle/streaming/error), providerId, modelKey
- **ChatPanelState**: isOpen, width
- **AIProvider**: metadata (id, name, capabilities), streamChat(), isModelSupported()
- **AIProviderSelection**: providerId, modelKey

## Success Criteria *(mandatory)*

### Measurable Outcomes

- [x] Users can send messages and receive streaming responses
- [x] Response streaming is visible (text appears incrementally with cursor)
- [x] Multi-turn conversations maintain context via session ID
- [x] Stop button halts generation immediately
- [x] New conversation starts fresh without page reload
- [x] Error states are communicated clearly with dismissible banners
- [x] Code blocks are displayed with proper formatting
- [x] Long conversations keep smooth scrolling and input responsiveness via virtualized message rendering
- [x] Chat input area expands with multi-line content without overflowing the viewport
- [x] Scroll position stays at bottom when input area expands (no drift upward)

## Technical Implementation

### Components
- `components/chat/ChatPanel.vue` - Main panel with header, CWD display, close button
- `components/chat/ChatPanelToggle.vue` - Toggle button for panel visibility
- `components/chat/ChatMessages.vue` - Message list with auto-scroll and loading indicator
- `components/chat/ChatMessage.vue` - Individual message with markdown rendering
- `components/chat/ChatInput.vue` - Input textarea, send/stop/retry buttons
- `components/settings/ProviderSelector.vue` - Provider and model selection UI

### Store
- `stores/chat.ts` - Messages, session state, panel state, streaming state

### Composables
- `composables/useChatStream.ts` - WebSocket streaming, message handling
- `composables/useChatPanel.ts` - Panel toggle, resize with mouse drag
- `composables/useAutoScroll.ts` - Auto-scroll with 50px threshold detection
- `composables/useVirtualMessageList.ts` - Virtualized chat message rendering with measured row heights

### Types
- `types/chat.ts` - ChatMessage, ChatSession, ChatPanelState, MessageStatus, SessionStatus
- `types/aiProvider.ts` - AIProviderMetadata, AIProviderSelection, AIProviderCapabilities

### Server APIs
- `POST /api/chat` - Send message with SSE streaming (alternative to WebSocket)

### WebSocket
- `/_ws` - Claude CLI streaming with PTY, session handling

### Server Utilities
- `server/utils/aiProvider.ts` - AIProvider interface and streamChatWithProvider()
- `server/utils/aiProviderRegistry.ts` - Provider registration and management
- `server/utils/aiProviderSelection.ts` - Provider/model selection logic
- `server/utils/claudeProvider.ts` - Claude provider implementation
- `server/utils/codexProvider.ts` - Codex provider implementation

## Assumptions

- At least one AI provider CLI/SDK is installed and configured
- Users have authenticated with their chosen provider(s)
- node-pty is available for PTY-based CLI interaction (for providers that use it)
- Each provider implements the AIProvider interface

## Out of Scope

- File upload or image input capabilities
- Voice input/output
- Sharing or exporting conversations
- Custom system prompts or persona configuration
- Syntax highlighting in code blocks (simple markdown only)
