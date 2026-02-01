# Research: Auto Mode (009-auto-mode)

**Date**: 2026-02-08
**Phase**: 0 — Outline & Research

## R-001: How does Auto Mode integrate with existing conversation system?

**Decision**: Extend the existing Conversation entity with an `autoMode?: boolean` field. Auto Mode creates conversations via `chatStore.createConversation({ featureId })` — the same API used by cascade automation (012).

**Rationale**: The spec explicitly states "reuses existing chat UI and conversation system." The `Conversation` interface at `types/chat.ts:173` already has `featureId?: string` which is the primary key for feature-to-conversation association. Adding `autoMode: boolean` enables UI differentiation (badge) without any structural change.

**Alternatives considered**:
- Separate data structure for Auto Mode sessions → Rejected because it would duplicate conversation management, violate Simplicity principle, and prevent reuse of preview/finalize flow.
- Using conversation title prefix (e.g., "[AUTO]") instead of a flag → Rejected because it's fragile, pollutes user-visible titles, and breaks search.

## R-002: Server-side vs client-side cascade orchestration

**Decision**: Keep cascade orchestration **server-side** via `autoModeScheduler.ts`. Auto Mode uses the Claude Code SDK `query()` directly (not the chat WebSocket), running in bypass permission mode.

**Rationale**: The existing `autoModeScheduler.ts` already implements this pattern correctly. It uses `@anthropic-ai/claude-code` `query()` with `permissionMode: 'bypassPermissions'` to run speckit steps sequentially. This is fundamentally different from user-initiated cascades (which go through WebSocket + PTY). Auto Mode doesn't need interactive permission — it's a background batch processor.

**Alternatives considered**:
- Client-side orchestration via `useChatStream.enableCascade()` → Rejected because Auto Mode must work without a browser tab open, and client-side cascade state is lost on page refresh.
- Hybrid (server starts, client monitors) → This is actually what's implemented: server processes, client receives WebSocket updates.

## R-003: Concurrency model for parallel spec processing

**Decision**: Process up to N features concurrently using `Promise.all` with a concurrency-limited pool (default N=3, configurable via settings).

**Rationale**: FR-013 requires concurrent processing. The `autoModeScheduler.ts` currently processes features sequentially. It needs to be updated to use a concurrent queue pattern. The `@anthropic-ai/claude-code` SDK supports multiple concurrent `query()` instances since each spawns an independent process.

**Alternatives considered**:
- Worker threads → Rejected; unnecessary complexity. Node.js async I/O with concurrent `query()` calls is sufficient since Claude CLI is spawned as a child process.
- Sequential processing only → Rejected; FR-013 explicitly requires configurable concurrency.

**Implementation pattern**:
```typescript
async function processWithConcurrency(tasks: AutoModeTask[], concurrency: number) {
  const queue = [...tasks]
  const active: Promise<void>[] = []

  while (queue.length > 0 || active.length > 0) {
    while (active.length < concurrency && queue.length > 0) {
      const task = queue.shift()!
      active.push(processFeature(task).then(() => { /* remove from active */ }))
    }
    await Promise.race(active)
  }
}
```

## R-004: Queue state persistence for page refresh resilience

**Decision**: Persist Auto Mode session state to a JSON file at `~/.spec-cat/projects/{hash}/auto-mode-session.json` on the server side. On server restart or client reconnect, the session state is restored from this file.

**Rationale**: FR-015 requires queue state persistence. localStorage alone is insufficient because the server is the source of truth for processing state. The server needs to know which features have been processed to avoid reprocessing.

**Alternatives considered**:
- localStorage only (client-side) → Rejected because the server is processing features, not the client. Client localStorage can't track server-side progress.
- SQLite → Rejected; overkill for a single JSON document. The session state is small (list of features + states).
- In-memory only → Rejected; doesn't survive server restart per FR-015.

## R-005: Constitution conversation handling

**Decision**: Create a dedicated conversation with `featureId: 'constitution'`. This conversation runs `/speckit.constitution` instead of the normal specify → plan → tasks cascade.

**Rationale**: FR-012 specifies a dedicated conversation with featureId "constitution". The constitution workflow is different from feature specs — it uses `/speckit.constitution` which updates `.speckit/memory/constitution.md`. Treating it as a special case in the queue (detected by featureId) keeps the architecture clean.

**Alternatives considered**:
- Processing constitution as part of every feature cascade → Rejected; constitution is project-wide, not per-feature.
- Separate background job → Rejected; the spec explicitly says it should be a conversation visible in the list.

## R-006: Concurrency settings storage

**Decision**: Add `autoModeConcurrency: number` to the existing `SettingsStoreState` in `stores/settings.ts`. Persist via existing localStorage mechanism (`spec-cat-settings` key). Server reads it via a new API endpoint `GET /api/settings` or receives it in the toggle request body.

**Rationale**: FR-016 requires a settings page control. The existing settings store at `stores/settings.ts` uses a simple pattern: Pinia state + localStorage persistence. Adding a field follows the established pattern exactly.

**Alternatives considered**:
- Separate localStorage key for concurrency → Rejected; settings should be centralized.
- Server-side config file → Rejected; the setting is per-user, and localStorage + API is the established pattern.

## R-007: How to communicate concurrency setting to server

**Decision**: Pass concurrency as part of the toggle request body: `POST /api/auto-mode/toggle { enabled: true, concurrency: 3 }`. The server uses this value for the current cycle.

**Rationale**: Simple and direct. The server doesn't need to persist this setting independently — it receives it when Auto Mode is activated.

**Alternatives considered**:
- Separate settings sync API → Rejected; unnecessary complexity.
- Server-side config file → Rejected; the user controls this via the UI.

## R-008: "Auto" badge placement in conversation list

**Decision**: Add an "auto" badge in `ConversationItem.vue` next to the streaming badge. Check `conversation.autoMode === true` and render a small badge with retro-yellow styling (matching AutoModeToggle).

**Rationale**: FR-008 requires visual distinction. The existing `ConversationItem.vue` already has a "streaming" badge pattern. Following the same approach ensures UI consistency.

**Alternatives considered**:
- Different icon instead of badge → Rejected; badges are more noticeable in a list and follow existing patterns.
- Separate list section for auto mode conversations → Rejected; the spec explicitly says they should be in the normal conversation list.
