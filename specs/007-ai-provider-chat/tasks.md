# Tasks: AI Provider Chat

**Input**: Design documents from `/specs/007-ai-provider-chat/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/chat-api.yaml

**Tests**: Manual testing only (per constitution - no automated tests requested)

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Related Specs

Conversation management tasks (Phases 8-9) have been moved to `009-conversation-management`.
Permission, worktree, and cascade tasks are covered by specs 010, 011, 012 respectively.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- **Nuxt 3**: `components/`, `composables/`, `stores/`, `server/`, `types/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Type definitions and shared infrastructure

- [x] T001 [P] Create chat type definitions in types/chat.ts (ChatMessage, ChatSession, ChatPanelState, SSE events)
- [x] T002 [P] Create chat Pinia store skeleton in stores/chat.ts (messages, session, panel state)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server-side infrastructure that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Create chatService.ts in server/utils/chatService.ts (session management, Claude SDK integration)
- [x] T004 Implement send message endpoint in server/api/chat/send.post.ts
- [x] T005 Implement SSE streaming endpoint in server/api/chat/stream.get.ts
- [x] T006 Implement stop endpoint in server/api/chat/stop.post.ts

**Checkpoint**: Server infrastructure ready - UI implementation can begin

---

## Phase 3: User Story 1 & 2 - Interactive Chat + Panel Toggle (Priority: P1) MVP

**Goal**: Enable interactive chat with Claude via right-side panel with toggle

**Independent Test**: Open chat panel with toggle button, send a message, see streaming response from Claude

### Implementation for User Story 1 & 2

- [x] T007 [P] [US1] Create useChatStream composable in composables/useChatStream.ts (EventSource connection, message handling) [FR-005]
- [x] T008 [P] [US2] Create useChatPanel composable in composables/useChatPanel.ts (panel open/close, width state)
- [x] T009 [P] [US1] Create useAutoScroll composable in composables/useAutoScroll.ts (auto-scroll behavior)
- [x] T010 [P] [US1] Create ChatMessage component in components/chat/ChatMessage.vue (single message display with markdown) [FR-004]
- [x] T011 [US1] Create ChatMessages component in components/chat/ChatMessages.vue (message list with scroll)
- [x] T012 [US1] Create ChatInput component in components/chat/ChatInput.vue (input field, send button, Enter key) [FR-016]
- [x] T013 [US1] [US2] Create ChatPanel component in components/chat/ChatPanel.vue (main panel container, header, CWD display) [FR-001]
- [x] T014 [US2] Create ChatPanelToggle component in components/chat/ChatPanelToggle.vue (toggle button for header) [FR-002]
- [x] T015 [US2] Update default layout in layouts/default.vue (add right panel, integrate ChatPanel) [FR-001]
- [x] T016 [US1] Wire up send message flow in ChatInput (call API, connect SSE, update store) [FR-003]
- [x] T017 [US1] Add loading indicator during streaming in ChatMessage.vue [FR-006]
- [x] T018 [US1] Add input disable during streaming in ChatInput.vue [FR-014]

**Checkpoint**: User Story 1 & 2 complete - can open panel, send message, see streaming response

---

## Phase 4: Conversation History (Priority: P2)

**Goal**: Maintain and display conversation history within session

**Independent Test**: Send multiple messages, scroll through history, close/reopen panel, verify history preserved

- [x] T019 Implement message persistence in chat store (addMessage, updateMessage actions) [FR-007]
- [x] T020 Add chronological message display in ChatMessages.vue (timestamp, ordering)
- [x] T021 Implement history preservation on panel close/reopen in useChatPanel.ts
- [x] T022 Add auto-scroll on new message in ChatMessages.vue using useAutoScroll [FR-008]
- [x] T063 Replace partial message windowing with viewport virtualization in ChatMessages (`useVirtualMessageList`, absolute-positioned visible rows, measured heights) [FR-019]

**Checkpoint**: Conversation history works

---

## Phase 5: Working Directory Context (Priority: P2)

**Goal**: Display and use current working directory for Claude context

**Independent Test**: Open panel, verify CWD displayed in header, ask Claude about project files, verify context-aware response

- [x] T023 Add CWD display in ChatPanel header (abbreviated path, full path on hover) [FR-010]
- [x] T024 Implement CWD fetch in chat store (get from server or config)
- [x] T025 Pass CWD to chatService when starting session [FR-009]

**Checkpoint**: CWD displayed and used for context

---

## Phase 6: Stop Generation (Priority: P3)

**Goal**: Allow users to stop Claude's response generation

**Independent Test**: Send a complex request, click stop while streaming, verify generation stops, verify partial response shown

- [x] T026 Add stop button to ChatInput (visible during streaming) [FR-011]
- [x] T027 Implement stop action in chat store (call stop endpoint, update message status) [FR-011]
- [x] T028 Handle abort in chatService.ts (AbortController integration) [FR-011]
- [x] T029 Update ChatMessage to show 'stopped' status indicator [FR-011]

**Checkpoint**: Can stop generation mid-stream

---

## Phase 7: Start New Conversation (Priority: P3)

**Goal**: Allow users to clear chat and start fresh

**Independent Test**: Have active conversation, click new conversation button, verify chat clears, send new message, verify no previous context

- [x] T030 Add new conversation button to ChatPanel header [FR-012]
- [x] T031 Implement clearMessages action in chat store [FR-012]
- [x] T032 Reset session on server-side when starting new conversation [FR-012]

**Checkpoint**: Can start fresh conversations

---

## Phase 8: Enhancements (Cross-Cutting)

**Purpose**: Panel resize and error handling

- [x] T053 [P] Implement panel resize functionality in ChatPanel.vue (drag edge to resize) [FR-017]
- [x] T054 [P] Implement panel resize logic in useChatPanel.ts (min/max constraints, localStorage persistence) [FR-017]
- [x] T055 Add error display in ChatMessages.vue (connection errors, CLI errors) [FR-013] [FR-013a]
- [x] T055a Add dismiss button to error banner in ChatMessages.vue [FR-013c]
- [x] T055b Add console logging hint in error banner [FR-013b]
- [x] T056 Add retry capability after errors in ChatInput.vue [FR-016a]
- [x] T057 Handle SSE connection errors in useChatStream.ts (reconnect logic)
- [x] T057a Add WebSocket close diagnostics to error messages (close-code meaning fallback when reason is empty, wasClean, and last server-error context) [FR-013d]
- [x] T057b Add JSON parsing error handling with detailed messages [FR-013f]
- [x] T057c Add result subtype error handling (max_turns, execution errors)
- [x] T058a Handle PTY spawn failures with detailed error messages [FR-013e]
- [x] T058b Handle non-zero CLI exit codes with error reporting [FR-013e]

**Checkpoint**: All enhancements complete

---

## Phase 9: Provider Support (Priority: P1)

**Goal**: Enable multi-provider support with selection UI

**Independent Test**: Open settings, select different provider/model, send message, verify correct provider is used

- [x] T066 Create AIProvider interface in server/utils/aiProvider.ts [FR-025]
- [x] T067 Create AIProviderRegistry in server/utils/aiProviderRegistry.ts [FR-020]
- [x] T068 Implement Claude provider in server/utils/claudeProvider.ts [FR-020]
- [x] T069 Implement Codex provider in server/utils/codexProvider.ts [FR-020]
- [x] T070 Create ProviderSelector component in components/settings/ProviderSelector.vue [FR-021] [FR-022] [FR-023]
- [x] T071 Add provider/model selection to settings store [FR-024]
- [x] T072 Update chat service to use selected provider [FR-018] [FR-021] [FR-025]

**Checkpoint**: Provider selection works

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and validation

- [x] T059 [P] Validate markdown rendering in ChatMessage.vue (code blocks, formatting) [FR-015]
- [x] T060 [P] Add responsive styling for different screen sizes
- [ ] T061 Run manual test checklist from quickstart.md
- [x] T062 Code cleanup and remove any debug logging

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) ─────────────────────────────────────┐
                                                      │
Phase 2 (Foundational) ──────────────────────────────┤
           │                                          │
           ▼                                          │
Phase 3 (US1+US2: Chat+Toggle) ◀────── MVP COMPLETE  │
           │                                          │
           ├──────────────────────────────────────────┘
           │
           ▼
┌──────────┬──────────┬──────────┬──────────┐
│ Phase 4  │ Phase 5  │ Phase 6  │ Phase 7  │  (can run in parallel)
│ History  │ CWD      │ Stop     │ New Conv │
└──────────┴──────────┴──────────┴──────────┘
           │
           ▼
     Phase 8 (Enhancements)
           │
           ▼
     Phase 9 (Provider Support)
           │
           ▼
     Phase 10 (Polish)
```

---

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- MVP requires only Phases 1-3 (18 tasks)
- Manual testing per constitution - no automated test tasks
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Conversation management tasks moved to spec 009-conversation-management


## FR Traceability Addendum (2026-02-24)

- [x] T064 [P] [US1] Fix ChatInput container to grow with textarea expansion in components/chat/ChatInput.vue [FR-016b]
- [x] T065 [P] [US1] Maintain scroll position when input area resizes in components/chat/ChatMessages.vue [FR-008a]
