# Implementation Plan: Conversation Management

**Branch**: `009-conversation-management` | **Date**: 2026-02-08 | **Spec**: [specs/009-conversation-management/spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-conversation-management/spec.md`
**Status**: Implemented
**Split from**: 007-ai-provider-chat

## Summary

Implement conversation list management with CRUD operations, localStorage persistence (hard limit 100), search/filter, inline rename, delete confirmation, streaming status badges, and auto-generated titles. The feature extends the existing Pinia chat store and localStorage patterns from 007-ai-provider-chat. No server-side APIs are required — all operations are client-side with localStorage as the persistence layer.

## Technical Context

**Language/Version**: TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+)
**Primary Dependencies**: Pinia (v2.2+), @heroicons/vue (icons), Tailwind CSS (styling)
**Storage**: localStorage (`spec-cat-conversations` key), hard limit 100 conversations
**Testing**: Manual testing, TypeScript type checking
**Target Platform**: Browser (Nuxt SSR/SPA)
**Project Type**: Web application (Nuxt 3 full-stack) — client-side only for this feature
**Performance Goals**: Search/filter responds within 400ms debounce; auto-save debounced at 400ms
**Constraints**: Max 100 conversations in localStorage; SSR-safe (no `window` access on server)
**Scale/Scope**: Single-user, up to 100 conversations with full message history

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| User Control First | PASS | Delete requires confirmation modal; rename is explicit user action; no auto-deletion |
| Streaming-Native | PASS | FR-011 streaming badge shows real-time status on conversations with active streams |
| Simplicity Over Complexity | PASS | localStorage for persistence (no server DB); flat conversation array (no normalization); direct store operations |
| Type Safety | PASS | `isValidConversation()` type guard; `StoredConversations` schema with version; all types in `types/chat.ts` |
| Keyboard-Driven | PASS | Enter/Escape for inline rename; standard form input patterns |

### Post-Phase 1 Re-check

| Gate | Status | Notes |
|------|--------|-------|
| User Control First | PASS | Hard limit at 100 blocks creation with user-facing message (not silent auto-delete) |
| Simplicity Over Complexity | PASS | No composable abstraction; store actions directly in `stores/chat.ts`; `conversationStorage.ts` is thin utility |
| Type Safety | PASS | Corrupted data handling: `filter(isValidConversation)` discards invalid entries safely |

## Project Structure

### Documentation (this feature)

```text
specs/009-conversation-management/
├── plan.md              # This file
├── research.md          # Phase 0: 9 decisions documented
├── data-model.md        # Phase 1: Conversation entity, store schema, storage utilities
├── quickstart.md        # Phase 1: Implementation guide with code snippets
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

**Note**: No `contracts/` directory — this feature has no server-side APIs. All operations are client-side localStorage + Pinia store.

### Source Code (repository root)

```text
# Types
types/chat.ts                              # Conversation, StoredConversations, type guards, ID/title generators

# Storage Utility
utils/conversationStorage.ts               # localStorage load/save/clear/size

# Store (shared with 007)
stores/chat.ts                             # Conversation CRUD, activeConversationId, search, sorting, limits

# Components
components/chat/
├── ConversationList.vue                   # Search, filter, create, manage conversations
├── ConversationItem.vue                   # Single row: title, preview, timestamp, badges, inline edit
└── DeleteConfirmModal.vue                 # Confirmation dialog for deletion

# Alternative layout (panel version)
components/conversations/
└── ConversationsPanel.vue                 # Panel layout variant of conversation list
```

**Structure Decision**: Nuxt 3 web application structure. All 009 code is client-side (types, utils, store, components). The store file (`stores/chat.ts`) is shared with 007 and other features but 009-owned actions are clearly delineated.

## FR Coverage Matrix

| FR | Description | Implementation Files | Status |
|----|-------------|---------------------|--------|
| FR-001 | Display conversation list sorted by newest created first | `ConversationList.vue`, `stores/chat.ts` (sortConversations) | Done |
| FR-002 | Persist to localStorage (hard limit 100) | `conversationStorage.ts`, `stores/chat.ts` (checkStorageLimits) | Done |
| FR-003 | Select conversation to load in chat panel | `stores/chat.ts` (selectConversation) | Done |
| FR-004 | Auto-generate title from first user message (50 char) | `types/chat.ts` (generateConversationTitle), `stores/chat.ts` (updateConversationTitleIfNeeded) | Done |
| FR-005 | Inline rename (Enter/Escape/blur) | `ConversationItem.vue` (isEditing, saveEdit, cancelEdit) | Done |
| FR-006 | Delete with confirmation modal | `DeleteConfirmModal.vue`, `ConversationList.vue` (handleDeleteRequest/Confirm) | Done |
| FR-007 | Display metadata (title, preview, timestamp) | `ConversationItem.vue` (lastMessagePreview, formattedTimestamp) | Done |
| FR-008 | Sort by `createdAt` descending (newest created first) | `stores/chat.ts` (sortConversations, sortedConversations computed) | Done |
| FR-009 | Auto-save messages (400ms debounce) | `stores/chat.ts` (saveConversation with debounce timer) | Done |
| FR-010 | Search/filter (400ms debounce, title + content) | `ConversationList.vue` (searchQuery, debouncedQuery, filteredConversations) | Done |
| FR-011 | Streaming status badge (animated dot) | `ConversationItem.vue` (isStreaming prop, animated pulse dot) | Done |

## Complexity Tracking

No constitution violations. All implementations follow the simplicity principle with direct store operations and thin utilities.

## FR Coverage Addendum (2026-02-14)

| FR | Description | Implementation Files | Status |
|----|-------------|---------------------|--------|
| FR-007a | Message preview truncation and fallback behavior | `components/chat/ConversationItem.vue` | Done |
