# Research: Cascade Automation

**Feature**: 012-cascade-automation
**Date**: 2026-02-08

## Research Topics

### R1: Cascade Queue Pattern

**Question**: How should cascade steps be queued and auto-executed in a WebSocket-streaming chat system?

**Decision**: In-memory `Map<conversationId, { queue: string[], featureId: string }>` stored at module level in the `useChatStream` composable.

**Rationale**:
- Cascade is transient — if the page reloads or WebSocket disconnects, the user must restart the pipeline. Persisting the queue would create stale state recovery complexity with minimal benefit.
- The `Map` key is `conversationId`, which naturally scopes cascade to a single conversation.
- Queue is consumed via `shift()` on each `'done'` event, providing simple FIFO ordering.
- A 1.5-second delay after auto-commit allows the worktree to settle before the next step starts.

**Alternatives Considered**:
1. **Pinia store state**: Would add unnecessary persistence/reactivity complexity for ephemeral queue data.
2. **Server-side queue**: Would require additional API surface and server state management for a client-orchestrated flow.
3. **localStorage queue**: Unnecessary persistence — if the page reloads, the streaming context is lost anyway.

---

### R2: Conversation Reuse by Feature

**Question**: How should the system find and reuse an existing conversation for a given feature?

**Decision**: Linear search via `conversations.find(c => c.featureId === featureId)` in the Pinia store.

**Rationale**:
- With the `MAX_CONVERSATIONS = 100` limit, linear search is O(100) worst case — negligible performance impact.
- The `featureId` field is an optional property on `Conversation`, added at creation time when a cascade is triggered.
- A streaming conversation must NOT be reused (checked via `isConversationStreaming()`), to avoid queueing conflicts.

**Alternatives Considered**:
1. **Separate index/map**: Over-engineering for 100-item array; adds sync maintenance burden.
2. **Server-side lookup**: Conversations are client-persisted in localStorage; server has no conversation registry.

---

### R3: Force-New Conversation (Shift+Click)

**Question**: How should the force-new mechanism work without disrupting existing conversations?

**Decision**: Check `event.shiftKey` in the cascade handler. When true, skip the `findConversationByFeature()` call and always create a new conversation.

**Rationale**:
- Shift+click is a well-understood modifier convention in web UIs.
- The old conversation retains its `featureId` but is simply not found by subsequent non-Shift clicks because `findConversationByFeature()` returns the first match (the newest, since conversations are prepended).
- No cleanup of old conversations needed — they remain accessible in the conversation list.

**Alternatives Considered**:
1. **UI dropdown/dialog**: Adds UI complexity for an infrequent action.
2. **Right-click context menu**: Less discoverable and requires custom context menu implementation.

---

### R4: Speckit Command Integration

**Question**: How should speckit pipeline steps translate to chat messages?

**Decision**: Format as `/speckit.{step} {featureId}` (e.g., `/speckit.plan 004-spec-viewer`). Each speckit command triggers a context reset (clears `providerSessionId`) so each step gets a fresh provider session with appropriate spec context injected.

**Rationale**:
- Speckit commands are already implemented as slash commands in `/.claude/commands/`.
- Context reset prevents session memory from one step polluting the next (e.g., plan context shouldn't carry into tasks generation).
- The server detects `/speckit.*` commands via regex and injects feature spec context via `--append-system-prompt`.

**Alternatives Considered**:
1. **Direct API calls**: Would bypass the chat UI, losing the conversational feedback loop.
2. **Persistent session across steps**: Steps have different concerns; a fresh session per step is cleaner.

---

### R5: Error Recovery in Cascade

**Question**: How should the cascade behave when a step fails?

**Decision**: Disable cascade on any error — call `disableCascade(conversationId)` to clear the queue. The user sees the error in the chat and must manually restart.

**Rationale**:
- Auto-retrying speckit steps is risky — a failed step may produce partial output that subsequent steps would build on incorrectly.
- The user can inspect the error, fix the issue, and re-trigger from the appropriate step.
- Cascade is disabled on: WebSocket errors, PTY exit errors, permission denials, and user aborts.

**Alternatives Considered**:
1. **Auto-retry with backoff**: Inappropriate for generative AI steps where output quality varies.
2. **Skip failed step**: Would produce incomplete pipelines (e.g., skipping `tasks` but running `implement`).

---

### R6: Worktree Integration with Cascade

**Question**: How should cascade steps interact with worktrees?

**Decision**: The conversation's worktree is created at cascade initiation (in `createConversation`) and reused across all cascade steps. Auto-commit occurs after each step completes, before the next step starts.

**Rationale**:
- Each step builds on the previous step's output (e.g., `tasks` reads `plan.md` created by `plan`).
- Auto-committing after each step provides checkpoints and makes the work resumable.
- The worktree branch uses the `featureId` as the branch name for feature-originated conversations.
- The 1.5s delay between auto-commit and next step ensures git operations complete.

**Alternatives Considered**:
1. **Separate worktree per step**: Would prevent steps from seeing each other's output.
2. **No auto-commit**: Would risk losing intermediate work if the process fails.

---

## Summary

| Decision | Pattern | Key Rationale |
|----------|---------|---------------|
| Cascade queue | In-memory Map | Ephemeral, no persistence needed |
| Conversation reuse | Linear search by featureId | Simple, performant at scale (100 max) |
| Force-new | Shift+click modifier | Standard web convention |
| Command format | `/speckit.{step} {featureId}` | Leverages existing slash commands |
| Error handling | Disable cascade, manual restart | Safety over convenience |
| Worktree | Shared across steps, auto-commit each | Steps build on each other |
