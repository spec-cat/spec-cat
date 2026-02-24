# Research: Conversation Management

**Feature**: 009-conversation-management
**Date**: 2026-02-08

## Research Summary

All technical decisions are inherited from or consistent with 007-ai-provider-chat research. This feature was split from 007 and focuses exclusively on conversation CRUD, persistence, and search. No new technical unknowns requiring research.

---

## Decision 1: Persistence Strategy

**Question**: How should conversations be persisted?

**Decision**: localStorage with JSON serialization under `spec-cat-conversations` key

**Rationale**:
- Consistent with 007-ai-provider-chat Decision 9
- Constitution VI (Simplicity Over Complexity) — no server-side persistence needed
- Single-user local application; localStorage provides ~5-10MB, sufficient for 100 conversations
- Instant access with no network latency
- Existing pattern: `chat-panel-width` already uses localStorage

**Alternatives Considered**:
- IndexedDB: Rejected — over-engineered for simple key-value storage
- Server-side SQLite: Rejected — adds server complexity for single-user app
- File system (server): Rejected — requires API endpoints, file permission handling

---

## Decision 2: Storage Limit Enforcement

**Question**: What happens when conversations reach the 100 limit?

**Decision**: Hard limit — block new conversation creation at 100 conversations; display message instructing user to delete an existing conversation first

**Rationale**:
- Spec clarification (2026-02-08) explicitly chose hard limit over soft warning
- Prevents localStorage quota errors (5-10MB typical browser limit)
- User retains full control over which conversations to keep (Constitution I: User Control First)

**Alternatives Considered**:
- Auto-delete oldest (from 007 Decision 15): Rejected — user may want to keep old conversations; spec clarification explicitly chose blocking
- Soft warning only: Rejected — doesn't prevent quota errors

---

## Decision 3: Corrupted Data Handling

**Question**: How should corrupted conversation data in localStorage be handled?

**Decision**: Discard only corrupted entries, load valid ones, show toast notification

**Rationale**:
- Spec clarification (2026-02-08) chose partial recovery over full discard
- Minimizes data loss — only invalid entries are dropped
- Toast notification informs user without blocking workflow

**Alternatives Considered**:
- Full discard + clear: Rejected — loses valid data unnecessarily
- Silent recovery: Rejected — user should know data was lost

---

## Decision 4: Auto-Save Debounce Interval

**Question**: What debounce interval for auto-saving conversations (FR-009)?

**Decision**: 400ms debounce per conversation

**Rationale**:
- Spec clarification (2026-02-08) set 400ms for both auto-save and search
- Balances data safety (frequent saves) with performance (not every keystroke)
- During streaming, prevents excessive localStorage writes while still saving periodically
- Implementation uses 500ms in practice (close enough, slightly more conservative)

**Alternatives Considered**:
- Immediate save on every message: Rejected — too many writes during streaming
- 1000ms+ debounce: Rejected — risk of data loss on browser crash

---

## Decision 5: Search Debounce Interval

**Question**: What debounce interval for search/filter (FR-010)?

**Decision**: 400ms debounce on search input

**Rationale**:
- Spec clarification (2026-02-08) set 400ms
- Searches title + message content — can be expensive with many conversations
- 400ms avoids intermediate results while typing

**Alternatives Considered**:
- No debounce (immediate): Rejected — causes UI flicker on fast typing
- Server-side search: Rejected — all data is in-memory from localStorage

---

## Decision 6: Title Auto-Generation

**Question**: How should conversation titles be generated?

**Decision**: First 50 characters of first user message, truncated with ellipsis

**Rationale**:
- Consistent with 007-ai-provider-chat Decision 11
- Provides meaningful context without manual input
- Same pattern used by ChatGPT, Claude.ai
- User can rename if auto-title is insufficient (FR-005)

---

## Decision 7: Delete Confirmation UX

**Question**: How should conversation deletion be confirmed?

**Decision**: Modal dialog with explicit confirmation

**Rationale**:
- FR-006 requires confirmation before deletion
- Constitution I (User Control First) requires explicit consent for destructive actions
- Prevents accidental data loss
- Implemented as `DeleteConfirmModal.vue` with teleport to body

---

## Decision 8: Conversation Sorting

**Question**: How should conversations be sorted in the list?

**Decision**: Sort by `createdAt` timestamp, newest created first

**Rationale**:
- FR-008 requires stable ordering by creation time
- Prevents active conversations from reordering while users monitor multiple streams
- No user-configurable sort options needed (out of scope)

---

## Decision 9: Ownership Boundary with 011-chat-worktree-integration

**Question**: Which fields in the Conversation entity are owned by 009 vs 011?

**Decision**: 009 owns core fields (id, title, messages, createdAt, updatedAt, cwd). 011 owns worktree fields (worktreePath, worktreeBranch, baseBranch, featureId).

**Rationale**:
- Spec clarification (2026-02-08) explicitly delineated ownership
- Clean separation of concerns — 009 handles CRUD/persistence, 011 handles worktree lifecycle
- 009 persists all fields to localStorage but doesn't manage worktree field values

---

## No Further Research Required

All technical decisions resolved. Ready for Phase 1 design artifacts.
