# Research: Auto Mode (013-auto-mode)

**Date**: 2026-02-24
**Phase**: 0 — Outline & Research

## R-001: How does Auto Mode integrate with existing conversation system?

**Decision**: Extend the existing Conversation entity with an `autoMode?: boolean` field. Auto Mode creates conversations via `chatStore.createConversation({ featureId })` — the same API used by cascade automation (012).

**Rationale**: The spec explicitly states "reuses existing chat UI and conversation system." The `Conversation` interface already has `featureId?: string` which is the primary key for feature-to-conversation association. Adding `autoMode: boolean` enables UI differentiation (badge) without any structural change.

**Alternatives considered**:
- Separate data structure for Auto Mode sessions → Rejected because it would duplicate conversation management, violate Simplicity principle, and prevent reuse of preview/finalize flow.
- Using conversation title prefix (e.g., "[AUTO]") instead of a flag → Rejected because it's fragile, pollutes user-visible titles, and breaks search.

## R-002: Server-side vs client-side cascade orchestration

**Decision**: Client-side orchestration using existing cascade automation infrastructure with server-side queue management.

**Rationale**: The spec states "reuses existing chat UI and conversation system — each spec unit gets its own conversation with cascade pipeline." The existing cascade automation (012) already handles client-side cascade execution through the chat streaming infrastructure. Auto Mode will trigger these cascades programmatically.

**Alternatives considered**:
- Pure server-side orchestration → Rejected because it would duplicate cascade logic and break consistency with manual cascade execution.
- Hybrid model → This is actually what we're implementing: server manages the queue, client executes cascades.

## R-003: Concurrency model for parallel spec processing

**Decision**: Process up to N features concurrently using Promise-based concurrency control (default N=3, configurable via settings).

**Rationale**: FR-013 requires concurrent processing. JavaScript's Promise.all with chunking provides simple concurrency control. The existing conversation system can handle multiple concurrent sessions.

**Alternatives considered**:
- Worker threads → Rejected; unnecessary complexity for this scale.
- Sequential processing only → Rejected; FR-013 explicitly requires configurable concurrency.

**Implementation pattern**:
```typescript
async function processWithConcurrency(queue: string[], concurrency: number) {
  const active = new Set<Promise<void>>()

  for (const featureId of queue) {
    while (active.size >= concurrency) {
      await Promise.race(active)
    }

    const promise = processFeature(featureId)
      .finally(() => active.delete(promise))
    active.add(promise)
  }

  await Promise.all(active)
}
```

## R-004: Queue state persistence for page refresh resilience

**Decision**: Dual persistence - runtime state in Pinia store, durable state in localStorage.

**Rationale**: FR-015 requires queue state persistence. LocalStorage provides sufficient durability for queue metadata (feature IDs, states). The chat store already follows this pattern for other persistent state.

**Alternatives considered**:
- Server-side file storage → Rejected as more complex than needed for simple queue state.
- IndexedDB → Rejected; localStorage is simpler and sufficient for queue metadata.
- In-memory only → Rejected; doesn't survive page refresh per FR-015.

## R-005: Constitution conversation handling

**Decision**: Create a dedicated conversation with `featureId: 'constitution'`. This conversation runs the constitution update workflow.

**Rationale**: FR-012 specifies a dedicated conversation with featureId "constitution". The constitution workflow is different from feature specs — it updates project-wide configuration. Treating it as a special case in the queue keeps the architecture clean.

**Alternatives considered**:
- Processing constitution as part of every feature cascade → Rejected; constitution is project-wide, not per-feature.
- Separate background job → Rejected; the spec explicitly says it should be a conversation visible in the list.

## R-006: Concurrency settings storage

**Decision**: Add `autoModeConcurrency: number` to the existing settings store in Pinia. Persist via localStorage like other settings.

**Rationale**: FR-016 requires a settings page control. The existing settings infrastructure provides the established pattern for user preferences.

**Alternatives considered**:
- Separate localStorage key → Rejected; settings should be centralized.
- Server-side config → Rejected; this is a user preference that should follow the user.

## R-007: Spec discovery and change detection

**Decision**: Server endpoint to list specs with SHA-256 hashes, client-side comparison with previous run.

**Rationale**: FR-003b requires SHA-256 hash comparison to skip unchanged specs. Server has filesystem access to compute hashes efficiently.

**Alternatives considered**:
- Client-side hashing → Rejected; would require fetching all spec content.
- File modification times → Rejected; less reliable than content hashing.

## R-008: "Auto" badge implementation

**Decision**: Add badge in ConversationListItem.vue component, styled with retro terminal theme colors.

**Rationale**: FR-008 requires visual distinction. Following existing badge patterns (streaming indicator) ensures consistency.

**Alternatives considered**:
- Different background color → Rejected; badges are clearer.
- Separate list section → Rejected; spec says normal conversation list.