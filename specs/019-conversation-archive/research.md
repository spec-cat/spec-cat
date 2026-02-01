# Research: Conversation Archive & Reopen

**Feature**: 019-conversation-archive
**Date**: 2026-02-14

## Decision 1: Persist Active and Archived Conversations in a Versioned Unified Store

- **Decision**: Move from `StoredConversations { version, conversations[] }` to `StoredConversationsV2 { version: 2, activeConversations[], archivedConversations[] }`.
- **Rationale**: Active and archive lists need different lifecycle rules and sorting; keeping one file preserves existing persistence path and minimizes system complexity.
- **Alternatives considered**:
  - Keep a single mixed array with `archivedAt?`: rejected because it complicates active-only limits/sorting/filtering.
  - Separate archive JSON file: rejected because migration and consistency complexity increases.

## Decision 2: Backward-Compatible Migration on Read

- **Decision**: On load, accept both legacy v1 payloads (no archive list) and v2 payloads; treat legacy items as active conversations.
- **Rationale**: FR-012 requires no breakage for pre-archive schema users.
- **Alternatives considered**:
  - Hard fail on old versions: rejected due to data-loss risk and poor UX.
  - One-time offline migration script: rejected since runtime migration in loader is simpler.

## Decision 3: Archive Is a Store Mutation, Not Hard Delete

- **Decision**: Replace delete action in list UI with archive action that removes from active list and appends immutable snapshot to archive list.
- **Rationale**: FR-001/FR-002 require preservation and non-destructive behavior.
- **Alternatives considered**:
  - Keep both delete and archive in active row: rejected because spec requires delete replacement as primary action.

## Decision 4: Streaming Conversations Cannot Be Archived

- **Decision**: Block archive when `chatStore.isConversationStreaming(id)` is true and surface a toast message.
- **Rationale**: Prevents partial snapshots and race conditions while assistant output is still mutating state.
- **Alternatives considered**:
  - Force stop stream then archive: rejected as surprising side effect.
  - Queue archive until stream completes: rejected for hidden delayed behavior.

## Decision 5: Restore Creates a New Active Conversation Copy

- **Decision**: Restore operation generates new `Conversation.id`, copies full message history and metadata context (`cwd`, `featureId`, `baseBranch`, optional finalized marker semantics), and never mutates archive source.
- **Rationale**: FR-006/FR-007/FR-008 require restore-as-new with immutable archive records.
- **Alternatives considered**:
  - Unarchive original conversation object: rejected because it violates immutability and historical auditability.

## Decision 6: Active Limit Enforcement on Restore

- **Decision**: Reuse existing `MAX_CONVERSATIONS=100` limit check before restore; fail with user-facing guidance if active list is full.
- **Rationale**: FR-010 requires unchanged hard-cap behavior.
- **Alternatives considered**:
  - Permit 101st conversation for restore only: rejected because it creates inconsistent policy.

## Decision 7: Archive View Search and Sort

- **Decision**: Archive list sorts by `archivedAt DESC` and supports title+message-content filtering using the same search interaction model as active list (existing immediate input behavior in panel).
- **Rationale**: FR-004 and FR-005.
- **Alternatives considered**:
  - Title-only search: rejected because requirements include message content.
  - Separate debounce timing: rejected for inconsistent UX.

## Decision 8: Corrupted Archive Entries Are Skipped, Not Fatal

- **Decision**: Reuse partial-recovery pattern from existing conversation loader; invalid archived records are dropped while valid records continue loading.
- **Rationale**: Matches existing resilience behavior and edge-case requirement for corrupted payloads.
- **Alternatives considered**:
  - Fail whole load: rejected as too fragile.

## Decision 9: API Contract Pattern

- **Decision**: Keep existing `/api/conversations` read/write contract and add explicit archive-focused endpoints for list/reopen semantics:
  - `GET /api/conversations/archives`
  - `POST /api/conversations/{conversationId}/archive`
  - `POST /api/conversations/archives/{archiveId}/restore`
- **Rationale**: Maps directly to user actions and keeps boundaries clear between generic persistence and archive workflow.
- **Alternatives considered**:
  - Client-only archive mutations with bulk POST `/api/conversations`: rejected as less explicit and harder to validate server-side.

## Outcome

All technical clarifications resolved. No remaining `NEEDS CLARIFICATION` items.
