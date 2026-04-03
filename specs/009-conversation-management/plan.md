# Implementation Plan: Conversation Management

**Branch**: `009-conversation-management` | **Date**: 2026-02-08 | **Spec**: [specs/009-conversation-management/spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-conversation-management/spec.md`
**Status**: Implemented
**Split from**: 007-ai-provider-chat

## Summary

Implement conversation list management with CRUD operations, server-side filesystem persistence (hard limit 100), search/filter, inline rename, delete confirmation, streaming status badges, auto-generated titles, archive system with worktree cleanup, and cross-browser synchronization. The feature extends the existing Pinia chat store with server-side REST APIs backed by per-conversation JSON file storage.

## Technical Context

**Language/Version**: TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+)
**Primary Dependencies**: Pinia (v2.2+), @heroicons/vue (icons), Tailwind CSS (styling)
**Storage**: Server-side filesystem (`~/.spec-cat/data/conversations/{id}.json`), hard limit 100 conversations
**Testing**: Manual testing, TypeScript type checking
**Target Platform**: Browser (Nuxt SSR/SPA) with Nitro server backend
**Project Type**: Web application (Nuxt 3 full-stack) — client-side UI + server-side REST APIs for persistence
**Performance Goals**: Search/filter responds within 400ms debounce; auto-save debounced at 400ms; per-conversation atomic saves
**Constraints**: Max 100 active conversations; SSR-safe client code; server filesystem access required
**Scale/Scope**: Single-user, up to 100 conversations with full message history, multi-browser sync via WebSocket

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| User Control First | PASS | Delete requires confirmation modal; archive cleans up worktree/branch before removing; rename is explicit user action |
| Streaming-Native | PASS | FR-011 streaming status with active/idle distinction; cross-browser sync via EventBus |
| Simplicity Over Complexity | PASS | Per-file JSON storage (no database); flat conversation array; direct store operations; REST API thin layer |
| Type Safety | PASS | `isValidConversation()` type guard; `StoredConversations` schema with version; all types in `types/chat.ts` |
| Keyboard-Driven | PASS | Enter/Escape for inline rename; standard form input patterns |

### Post-Phase 1 Re-check

| Gate | Status | Notes |
|------|--------|-------|
| User Control First | PASS | Hard limit at 100 blocks creation with user-facing message; archive requires worktree cleanup to succeed |
| Simplicity Over Complexity | PASS | No composable abstraction; store actions directly in `stores/chat.ts`; `conversationStorage.ts` is thin async utility wrapping REST API calls |
| Type Safety | PASS | Corrupted data handling: `filter(isValidConversation)` discards invalid entries safely; server skips corrupted JSON files |

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

### Source Code (repository root)

```text
# Types
types/chat.ts                              # Conversation, ArchivedConversation, StoredConversations, type guards, ID generators

# Client Storage Utility
utils/conversationStorage.ts               # Async REST API wrapper (load/save/saveOne/clear)

# Server Storage
server/utils/conversationStore.ts          # Filesystem persistence (per-file read/write/upsert/remove, legacy migration)
server/api/conversations.get.ts            # GET /api/conversations
server/api/conversations.post.ts           # POST /api/conversations (bulk write)
server/api/conversations/update.post.ts    # POST /api/conversations/update (single upsert)
server/api/conversations/[conversationId]/archive.post.ts  # Archive with worktree cleanup
server/api/conversations/archives.get.ts   # GET /api/conversations/archives
server/api/conversations/archives/[archiveId].delete.ts    # Delete archive
server/api/conversations/archives/[archiveId]/restore.post.ts  # Restore archive

# Store (shared with 007)
stores/chat.ts                             # Conversation CRUD, activeConversationId, search, sorting, limits

# Cross-Browser Sync
composables/useGlobalNotifications.ts      # WebSocket global channel for conversation_archived, job_created events

# Components
components/chat/
├── ConversationList.vue                   # Search, filter, create, manage conversations
├── ConversationItem.vue                   # Single row: title, preview, timestamp, badges, streaming animation
└── DeleteConfirmModal.vue                 # Confirmation dialog for deletion

# Alternative layout (panel version)
components/conversations/
└── ConversationsPanel.vue                 # Panel layout variant of conversation list
```

**Structure Decision**: Nuxt 3 full-stack. Client communicates with server via REST API. Server persists conversations as individual JSON files for atomic writes. Cross-browser sync via EventBus → WebSocket notifications.

## FR Coverage Matrix

| FR | Description | Implementation Files | Status |
|----|-------------|---------------------|--------|
| FR-001 | Display conversation list sorted by newest created first | `ConversationList.vue`, `stores/chat.ts` (sortConversations) | Done |
| FR-002 | Persist to server-side filesystem (hard limit 100) | `conversationStorage.ts`, `conversationStore.ts`, `stores/chat.ts` | Done |
| FR-003 | Select conversation to load in chat panel | `stores/chat.ts` (selectConversation) | Done |
| FR-004 | Auto-generate title from first user message (50 char) | `types/chat.ts` (generateConversationTitle), `stores/chat.ts` | Done |
| FR-005 | Inline rename (Enter/Escape/blur) | `ConversationItem.vue` (isEditing, saveEdit, cancelEdit) | Done |
| FR-006 | Delete with confirmation modal | `DeleteConfirmModal.vue`, `ConversationList.vue` | Done |
| FR-007 | Display metadata (title, preview, timestamp) | `ConversationItem.vue` (lastMessagePreview, formattedTimestamp) | Done |
| FR-008 | Sort by `createdAt` descending (newest created first) | `stores/chat.ts` (sortConversations, sortedConversations computed) | Done |
| FR-009 | Auto-save messages (400ms debounce, per-conversation) | `stores/chat.ts`, `POST /api/conversations/update` | Done |
| FR-010 | Search/filter (400ms debounce, title + content) | `ConversationList.vue` (searchQuery, debouncedQuery, filteredConversations) | Done |
| FR-011 | Streaming status with active/idle distinction | `ConversationItem.vue` (streaming-border, streaming-active-border) | Done |
| FR-012 | REST API endpoints for conversation CRUD | `conversations.get.ts`, `conversations.post.ts`, `update.post.ts` | Done |
| FR-013 | Per-conversation JSON file storage | `conversationStore.ts` (read/write/upsert per file) | Done |
| FR-014 | Legacy migration from single-file to per-file | `conversationStore.ts` (migrateLegacyStoreIfNeeded) | Done |
| FR-015 | Archive with worktree cleanup | `archive.post.ts`, `eventBus.ts` | Done |
| FR-016 | List archives with search | `archives.get.ts` | Done |
| FR-017 | Restore archived conversation | `restore.post.ts` | Done |
| FR-018 | Delete archived conversation | `[archiveId].delete.ts` | Done |
| FR-019 | Cross-browser sync via EventBus/WebSocket | `useGlobalNotifications.ts`, `eventBus.ts` | Done |
| FR-020 | Sync archive state across browsers | `useGlobalNotifications.ts` (conversation_archived handler) | Done |
| FR-021 | Sync job_created events across browsers | `useGlobalNotifications.ts` (job_created handler) | Done |

## Complexity Tracking

No constitution violations. Server-side persistence uses per-file JSON storage (no database). REST API layer is thin. Cross-browser sync leverages existing EventBus/WebSocket infrastructure.

