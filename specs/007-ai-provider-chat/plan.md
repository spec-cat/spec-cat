# Implementation Plan: AI Provider Chat

**Branch**: `007-ai-provider-chat` | **Date**: 2026-02-02 | **Spec**: [specs/007-ai-provider-chat/spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-ai-provider-chat/spec.md`
**Status**: Implemented

## Related Specs

Features originally part of this plan have been split into focused specs:

- **009-conversation-management** - Conversation list, persistence, search, rename, delete
- **010-chat-permission-system** - Permission modes, request/approval UI
- **011-chat-worktree-integration** - Worktree isolation, preview, finalize, recovery
- **012-cascade-automation** - Kanban cascade pipeline

## Summary

Provide an interactive chat interface supporting multiple AI providers (Claude, Codex, Gemini) through a unified AIProvider interface. Features a right-side panel with real-time streaming responses, provider/model selection, markdown rendering, error handling, and panel resize. The architecture uses provider-specific implementations (WebSocket + node-pty for Claude, custom protocols for others) abstracted behind a common interface.

## Technical Context

**Language/Version**: TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+)
**Primary Dependencies**: Provider SDKs (`@anthropic-ai/claude-code`, codex CLI, future: `@google/generative-ai`), node-pty (v1.1.0), Pinia (v2.2+), `@heroicons/vue`, marked + dompurify (markdown rendering)
**Storage**: localStorage (panel width), in-memory (session/stream state)
**Testing**: Manual testing, TypeScript type checking
**Target Platform**: Browser (Nuxt SSR/SPA) + Nitro server (WebSocket)
**Project Type**: Web application (Nuxt 3 full-stack)
**Performance Goals**: Streaming text appears with no perceptible delay; auto-scroll within 50px threshold
**Constraints**: Panel width 300-600px
**Scale/Scope**: Single-user, multiple concurrent streaming sessions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Streaming-Native | PASS | WebSocket + node-pty for real-time streaming; text appears incrementally |
| Provider Parity | PASS | Runs provider CLIs/SDKs with full feature support; provider-specific capabilities preserved |
| Keyboard-Driven | PASS | Enter to send, Shift+Enter for newline |
| Simplicity Over Complexity | PASS | Direct WebSocket, single composable for streaming |
| Type Safety | PASS | All types in `types/chat.ts` with discriminated unions and type guards |

## Project Structure

### Documentation (this feature)

```text
specs/007-ai-provider-chat/
├── plan.md              # This file
├── spec.md              # Multi-provider chat specification
├── research.md          # Technology decisions (15 decisions)
├── data-model.md        # Entity definitions and store schema (shared with 009-012)
├── quickstart.md        # Implementation guide with code snippets
├── tasks.md             # Task breakdown
└── refactor-proposal.md # Provider-agnostic refactoring plan
```

### Source Code (repository root)

```text
# Components (5 chat UI core)
components/chat/
├── ChatPanel.vue            # Main panel: header, CWD display, close button
├── ChatPanelToggle.vue      # Toggle button for panel visibility
├── ChatMessages.vue         # Message list with auto-scroll and loading indicator
├── ChatMessage.vue          # Individual message: role-based styling, markdown rendering
└── ChatInput.vue            # Input textarea, send/stop/retry buttons

# Store
stores/chat.ts               # Messages, session, panel state, streaming (composition API)

# Composables
composables/
├── useChatStream.ts         # WebSocket streaming, message handling
├── useChatPanel.ts          # Panel toggle, resize with mouse drag
├── useAutoScroll.ts         # Auto-scroll with 50px threshold detection
└── useVirtualMessageList.ts # Viewport-based virtualized message rendering

# Types
types/chat.ts                # ChatMessage, ChatSession, ChatPanelState, type guards

# Server APIs
server/api/chat.post.ts              # POST: Send message (SSE streaming alternative)

# WebSocket
server/routes/_ws.ts                 # Claude CLI streaming: PTY, session handling

# Server Utilities
server/utils/
├── aiProvider.ts                    # AIProvider interface and streamChatWithProvider()
├── aiProviderRegistry.ts            # Provider registration and management
├── aiProviderSelection.ts           # Provider/model selection logic
├── claudeProvider.ts                # Claude provider implementation
├── codexProvider.ts                 # Codex provider implementation
└── claude.ts                        # Claude CLI path detection (legacy)
```

**Note**: Additional components and server APIs exist in shared files (`stores/chat.ts`, `types/chat.ts`, `useChatStream.ts`) that also implement requirements from specs 009-012. See those specs for their specific coverage.

## FR Coverage Matrix

| FR | Description | Implementation Files | Status |
|----|-------------|---------------------|--------|
| FR-001 | Chat panel on right side | `components/chat/ChatPanel.vue`, `layouts/default.vue` | Done |
| FR-002 | Toggle button | `components/chat/ChatPanelToggle.vue`, `composables/useChatPanel.ts` | Done |
| FR-003 | Send text messages | `components/chat/ChatInput.vue`, `composables/useChatStream.ts` (sendMessage) | Done |
| FR-004 | Conversational format | `components/chat/ChatMessage.vue` (role-based styling) | Done |
| FR-005 | Real-time streaming | `server/routes/_ws.ts` (node-pty), `composables/useChatStream.ts` (processSDKMessage) | Done |
| FR-006 | Loading indicator | `components/chat/ChatMessages.vue` (bounce animation during streaming) | Done |
| FR-007 | Conversation history | `stores/chat.ts` (messages per conversation) | Done |
| FR-008 | Auto-scroll | `composables/useAutoScroll.ts` (50px threshold) | Done |
| FR-008a | Maintain scroll on input resize | `components/chat/ChatMessages.vue` (ResizeObserver) | Done |
| FR-009 | Working directory context | `server/routes/_ws.ts` (cwd passed to pty.spawn), `stores/chat.ts` (conv.cwd) | Done |
| FR-010 | CWD display | `components/chat/ChatPanel.vue` (abbreviated path in header) | Done |
| FR-011 | Stop button | `components/chat/ChatInput.vue`, `composables/useChatStream.ts` (abort) | Done |
| FR-012 | New conversation | `stores/chat.ts` (createConversation), `components/chat/ChatPanel.vue` | Done |
| FR-013 | Error handling | `composables/useChatStream.ts` (error types), `stores/chat.ts` (lastError) | Done |
| FR-013a | Detailed error messages | `server/routes/_ws.ts` (CLI exit codes, spawn failures, non-JSON diagnostics) | Done |
| FR-013b | Console logging | `composables/useChatStream.ts` (console.error on parse/connection failures) | Done |
| FR-013c | Dismissible errors | `stores/chat.ts` (clearError) | Done |
| FR-013d | WebSocket errors | `composables/useChatStream.ts` (ws.onerror, ws.onclose with close-code meaning fallback when reason is empty, wasClean flag, and last server-error context) | Done |
| FR-013e | CLI process failures | `server/routes/_ws.ts` (exit code check, signal info, non-JSON output) | Done |
| FR-013f | JSON parse errors | `composables/useChatStream.ts` (try/catch with descriptive error) | Done |
| FR-014 | Prevent double-send | `components/chat/ChatInput.vue` (disabled during streaming) | Done |
| FR-015 | Markdown rendering | `components/chat/ChatMessage.vue` (marked + dompurify) | Done |
| FR-016 | Enter/Shift+Enter | `components/chat/ChatInput.vue` (keydown handler) | Done |
| FR-016a | Retry button | `components/chat/ChatInput.vue` (shown when last message errored) | Done |
| FR-016b | Grow input area with textarea | `components/chat/ChatInput.vue` (autoResize function, min-h-[40px], items-start) | Done |
| FR-017 | Panel resize | `composables/useChatPanel.ts` (useResize with drag), `stores/chat.ts` (setPanelWidth) | Done |
| FR-019 | Virtualized message rendering | `components/chat/ChatMessages.vue`, `composables/useVirtualMessageList.ts` | Done |
| FR-020 | Support multiple AI providers | `server/utils/aiProviderRegistry.ts`, provider implementations | Done |
| FR-021 | Provider/model selection | `components/settings/ProviderSelector.vue`, `stores/settings.ts` | Done |
| FR-022 | Display provider capabilities | `components/settings/ProviderSelector.vue` (capability badges) | Done |
| FR-023 | Disable incompatible providers | `components/settings/ProviderSelector.vue` (isProviderCompatible) | Done |
| FR-024 | Persist provider selection | `stores/settings.ts` (setProviderSelection) | Done |
| FR-025 | AIProvider interface usage | `server/utils/aiProvider.ts`, all provider implementations | Done |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| WebSocket + node-pty instead of SDK query() | Full CLI features including PTY interaction, --resume | SDK query() doesn't support interactive permission handling or session resume |
| Per-conversation connection pool | Multiple conversations can stream concurrently | Single global WebSocket would serialize all conversations |

## FR Coverage Addendum (2026-02-14)

| FR | Description | Implementation Files | Status |
|----|-------------|---------------------|--------|
| FR-018 | Retry failed message/send flow | `components/chat/ChatInput.vue`, `composables/useChatStream.ts` | Done |
