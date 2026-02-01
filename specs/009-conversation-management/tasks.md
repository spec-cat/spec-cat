# Tasks: Conversation Management

**Input**: Design documents from `/specs/009-conversation-management/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md
**Feature Branch**: `009-conversation-management`
**Dependencies**: 007-claude-code-chat (core chat infrastructure)

**Tests**: Manual testing only (per spec). No automated test tasks included.

**Organization**: Single user story (US1 — Conversation List & Persistence, P2). Tasks are organized into setup, foundational, story implementation, and polish phases.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1)
- Exact file paths included in descriptions

---

## Phase 1: Setup

**Purpose**: Types, constants, and utility functions that all other phases depend on

- [x] T001 [P] Define Conversation, StoredConversations interfaces, ChatMessage re-export, and constants (STORAGE_KEY_CONVERSATIONS, STORAGE_VERSION, MAX_CONVERSATIONS=100, WARN_CONVERSATIONS_THRESHOLD=80) in `types/chat.ts` [FR-002, FR-004, FR-007]
- [x] T002 [P] Implement generateConversationId() and generateConversationTitle(firstMessage, maxLength=50) helper functions in `types/chat.ts` [FR-004]
- [x] T003 [P] Implement isValidConversation() type guard for corrupted-data filtering in `types/chat.ts` [FR-002]

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: localStorage persistence layer — MUST be complete before store or UI work

**⚠️ CRITICAL**: No store or component work can begin until this phase is complete

- [x] T004 Implement loadConversations() with SSR guard, JSON parse, version check, and isValidConversation() filter in `utils/conversationStorage.ts` [FR-001, FR-002]
- [x] T005 Implement saveConversations() with SSR guard and QuotaExceededError handling in `utils/conversationStorage.ts` [FR-002, FR-009]
- [x] T006 [P] Implement clearConversations() and getStorageSize() utility functions in `utils/conversationStorage.ts` [FR-002]

**Checkpoint**: Storage utility complete — store layer can now be implemented

---

## Phase 3: User Story 1 — Conversation List & Persistence (Priority: P2) 🎯 MVP

**Goal**: Users can create, view, select, rename, delete, and search conversations with full localStorage persistence, auto-generated titles, debounced auto-save, and streaming status badges.

**Independent Test**: Navigate to Chat page → create conversation → send message → see auto-title → rename → search → delete with confirmation → refresh browser → verify persistence.

### Store Layer (depends on Phase 2)

- [x] T007 [US1] Add conversation state to Pinia store: conversations ref, activeConversationId ref, streamingConversations Set, and computed properties (activeConversation, hasConversations, sortedConversations sorted by createdAt desc) in `stores/chat.ts` [FR-001, FR-008]
- [x] T008 [US1] Implement loadConversations() store action that calls conversationStorage.loadConversations(), populates state, and sorts in `stores/chat.ts` [FR-001, FR-002]
- [x] T009 [US1] Implement createConversation(options?) store action with checkStorageLimits() guard (block at 100), ID generation, default title "New Conversation", and immediate save in `stores/chat.ts` [FR-002, FR-004]
- [x] T010 [US1] Implement selectConversation(id) store action that sets activeConversationId in `stores/chat.ts` [FR-003]
- [x] T011 [P] [US1] Implement deleteConversation(id) store action that removes from array, clears activeConversationId if deleted was active, clears debounce timers, and saves in `stores/chat.ts` [FR-006]
- [x] T012 [P] [US1] Implement renameConversation(id, title) store action with 100-char limit, updatedAt refresh, and save in `stores/chat.ts` [FR-005]
- [x] T013 [US1] Implement saveConversation(id, immediate?) with per-conversation debounce Map (400ms) and saveAllConversations() in `stores/chat.ts` [FR-009]
- [x] T014 [US1] Implement updateConversationTitleIfNeeded() that auto-generates title from first user message via generateConversationTitle() when title is still "New Conversation" in `stores/chat.ts` [FR-004]
- [x] T015 [US1] Implement sortConversations() action and checkStorageLimits() returning { atLimit, nearLimit, count } in `stores/chat.ts` [FR-002, FR-008]

### UI Components (depends on Store Layer)

- [x] T016 [P] [US1] Create ConversationItem.vue with props (conversation, isActive, isStreaming), emits (select, delete, rename), last-message preview (60 char truncated), relative timestamp formatting, and click-to-select in `components/chat/ConversationItem.vue` [FR-001, FR-007]
- [x] T017 [P] [US1] Create DeleteConfirmModal.vue with props (show, title), emits (confirm, cancel), Teleport to body, backdrop click-to-cancel, and transition animations in `components/chat/DeleteConfirmModal.vue` [FR-006]
- [x] T018 [US1] Create ConversationList.vue with search input, "New Chat" button, ConversationItem v-for loop over filteredConversations, empty states ("No conversations yet" / "No matching conversations"), and DeleteConfirmModal integration in `components/chat/ConversationList.vue` [FR-001, FR-003, FR-006]

### Inline Rename (depends on T016)

- [x] T019 [US1] Add inline edit mode to ConversationItem.vue: isEditing ref, editTitle ref, startEdit(), saveEdit() on Enter/blur, cancelEdit() on Escape, autofocus input, click.stop on edit area in `components/chat/ConversationItem.vue` [FR-005]

### Search & Filter (depends on T018)

- [x] T020 [US1] Implement debounced search in ConversationList.vue: searchQuery ref, 400ms debounce watch, debouncedQuery ref, filteredConversations computed that filters sortedConversations by title + message content (case-insensitive) in `components/chat/ConversationList.vue` [FR-010]

### Streaming Badge (depends on T016)

- [x] T021 [US1] Add streaming status badge to ConversationItem.vue: conditional animated pulse dot (w-2 h-2 rounded-full bg-retro-cyan animate-pulse) when isStreaming prop is true in `components/chat/ConversationItem.vue` [FR-011]

### Storage Limits UI (depends on T018)

- [x] T022 [US1] Add storage limit warnings to ConversationList.vue: red banner at 100 ("Delete a conversation to create a new one"), yellow banner at 80-99 showing count/100, disable "New Chat" button when atLimit in `components/chat/ConversationList.vue` [FR-002]

**Checkpoint**: User Story 1 complete — all conversation management functionality is independently testable

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, data integrity, and integration validation

- [x] T023 Handle corrupted localStorage gracefully: ensure loadConversations() discards invalid entries via isValidConversation() filter and logs warning for corrupted data in `utils/conversationStorage.ts` and `stores/chat.ts` [FR-002]
- [x] T024 Validate SSR safety: ensure all localStorage access is guarded with `typeof window !== 'undefined'` checks in `utils/conversationStorage.ts` [FR-002]
- [x] T025 Run quickstart.md manual testing checklist to verify all acceptance scenarios pass [FR-001 through FR-011]

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types/constants) — BLOCKS store and UI
- **User Story 1 (Phase 3)**: Depends on Phase 2 (storage utilities)
  - Store layer (T007-T015): Depends on Phase 2
  - UI components (T016-T018): Depends on store layer being functional
  - Inline rename (T019): Depends on T016 (ConversationItem)
  - Search/filter (T020): Depends on T018 (ConversationList)
  - Streaming badge (T021): Depends on T016 (ConversationItem)
  - Storage limits UI (T022): Depends on T018 (ConversationList)
- **Polish (Phase 4)**: Depends on Phase 3 completion

### Within User Story 1

```
T007 (state) → T008 (load) → T009 (create) → T010 (select)
                                  ↓
                            T011 [P] (delete)
                            T012 [P] (rename)
                                  ↓
                            T013 (auto-save) → T014 (auto-title) → T015 (sort/limits)
                                  ↓
                            T016 [P] (ConversationItem) → T019 (inline rename)
                                                        → T021 (streaming badge)
                            T017 [P] (DeleteConfirmModal)
                                  ↓
                            T018 (ConversationList) → T020 (search/filter)
                                                    → T022 (storage limits UI)
```

### Parallel Opportunities

```bash
# Phase 1 — all types can be written in parallel:
T001 [P] (interfaces/constants)
T002 [P] (ID/title generators)
T003 [P] (type guard)

# Phase 2 — T006 can run in parallel with T004-T005:
T004 → T005 (sequential: load before save)
T006 [P] (clear/size — independent)

# Phase 3 — store delete/rename are parallel:
T011 [P] (deleteConversation)
T012 [P] (renameConversation)

# Phase 3 — UI components are parallel:
T016 [P] (ConversationItem)
T017 [P] (DeleteConfirmModal)
```

---

## Implementation Strategy

### MVP First (User Story 1 = Full Feature)

1. Complete Phase 1: Types, constants, helpers (T001-T003)
2. Complete Phase 2: localStorage utilities (T004-T006)
3. Complete Phase 3: Store → UI → Interactions (T007-T022)
4. **STOP and VALIDATE**: Run quickstart.md manual testing checklist
5. Complete Phase 4: Polish edge cases (T023-T025)

### Incremental Delivery Within US1

1. **Storage + Store**: T001-T015 → Conversation CRUD works programmatically
2. **Basic UI**: T016-T018 → Conversations visible and clickable in sidebar
3. **Interactive Features**: T019-T022 → Inline rename, search, streaming badge, limits
4. **Hardening**: T023-T025 → Edge cases, SSR safety, full validation

### Single Developer Strategy

Since this feature has one user story, work sequentially through phases:
- Phase 1 (3 tasks, parallel) → Phase 2 (3 tasks) → Phase 3 (16 tasks) → Phase 4 (3 tasks)
- Total: 25 tasks across 4 phases

---

## FR Traceability

| FR | Tasks | Description |
|----|-------|-------------|
| FR-001 | T004, T007, T008, T016, T018 | Display conversation list sorted by newest created first |
| FR-002 | T001, T003, T004, T005, T006, T009, T015, T022, T023, T024 | Persist to localStorage (hard limit 100) |
| FR-003 | T010, T018 | Select conversation to load in chat panel |
| FR-004 | T001, T002, T009, T014 | Auto-generate title from first user message (50 char) |
| FR-005 | T012, T019 | Inline rename (Enter/Escape/blur) |
| FR-006 | T011, T017, T018 | Delete with confirmation modal |
| FR-007 | T001, T016 | Display metadata (title, preview, timestamp) |
| FR-008 | T007, T015 | Sort by `createdAt` descending (newest created first) |
| FR-009 | T005, T013 | Auto-save messages (400ms debounce) |
| FR-010 | T020 | Search/filter (400ms debounce, title + content) |
| FR-011 | T021 | Streaming status badge (animated dot) |

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [US1] label = maps to User Story 1 (Conversation List & Persistence)
- This feature has a single user story, so all story-phase tasks are [US1]
- No automated tests — spec requires manual testing only
- Feature is client-side only (no server APIs, no contracts/)
- Store file `stores/chat.ts` is shared with 007; 009-owned actions are clearly scoped
- Worktree fields (worktreePath, worktreeBranch, etc.) are persisted by 009 but managed by 011

## FR Traceability Addendum (2026-02-14)

- [ ] T026 [Traceability] Backfill explicit mapping for metadata preview sub-requirement behavior [FR-007a]
