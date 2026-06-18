# Implementation Plan: Server-Driven Chat Architecture

**Feature**: 035-server-driven-chat
**Created**: 2026-03-20
**Status**: In Progress (Phase 2 implemented)

## Architecture Overview

```
                     ┌──────────────────────────────────────┐
                     │          REST API Layer              │
                     │  POST /api/jobs (submit)             │
                     │  GET  /api/jobs (list)               │
                     │  GET  /api/jobs/:id (status+events)  │
                     │  POST /api/jobs/:id/cancel           │
                     └───────────┬──────────────────────────┘
                                 │
                     ┌───────────▼──────────────────────────┐
                     │        JobQueue (singleton)           │
                     │  submit() → runProvider()             │
                     │  abort() / respondToPermission()      │
                     │  Jobs: Map<jobId, ChatJob>            │
                     │  ChatJob.events[] (buffer)            │
                     └───────────┬──────────────────────────┘
                                 │ emit()
                     ┌───────────▼──────────────────────────┐
                     │      EventBus (singleton)             │
                     │  Per-conversation pub/sub             │
                     │  Multiple subscribers per conv        │
                     └───────────┬──────────────────────────┘
                                 │ subscribe()
              ┌──────────────────┼──────────────────────┐
              │                  │                      │
    ┌─────────▼───────┐  ┌──────▼────────┐  ┌─────────▼────────┐
    │ WS Client Tab 1 │  │ WS Client Tab 2│  │  (no client)     │
    │ subscribe msg    │  │ subscribe msg  │  │  events buffered │
    │ → replay + live  │  │ → replay + live│  │  in job.events   │
    └─────────────────┘  └───────────────┘  └──────────────────┘
```

## Phase Breakdown

### Phase 1: Core Infrastructure (COMPLETE)

Extracted from WebSocket handler into standalone modules.

| Component | File | Status |
|-----------|------|--------|
| EventBus | `server/utils/eventBus.ts` | Done |
| JobQueue | `server/utils/jobQueue.ts` | Done |
| WS refactor | `server/routes/_ws.ts` | Done |

### Phase 2: Client Subscribe + Job API (CURRENT — IMPLEMENTED)

| Component | File | FR Coverage |
|-----------|------|-------------|
| `ConversationSource` type | `types/chat.ts` | FR-007 |
| `Conversation.source` field | `types/chat.ts` | FR-007 |
| `listAllJobs()` | `server/utils/jobQueue.ts` | FR-011 |
| Submit job API | `server/api/jobs/index.post.ts` | FR-001, FR-008 |
| List jobs API | `server/api/jobs/index.get.ts` | FR-002 |
| Get job API | `server/api/jobs/[id].get.ts` | FR-003 |
| Cancel job API | `server/api/jobs/[id]/cancel.post.ts` | FR-004 |
| WS subscribe + replay | `server/routes/_ws.ts` | FR-005, FR-006 |
| Client subscribe | `composables/useChatStream.ts` | FR-010 |
| Client refresh | `stores/chat.ts` | FR-009 |

### Phase 2.5: Interactive PTY Execution + Anchored Persistence (IMPLEMENTED)

| Component | File | FR Coverage |
|-----------|------|-------------|
| `runProviderViaPty()` + `injectMessage()` | `server/utils/jobQueue.ts` | FR-012 |
| Turn-completion fallback (PTY exit / timeout) | `server/utils/jobQueue.ts` | FR-012 |
| PTY hook injection (Stop hook into spool) | `server/utils/terminalSessions.ts`, `server/utils/cliHookInjection.ts` | FR-012 |
| Stop-hook monitor (no jobId filter, `onStop`) | `server/utils/cliHookMonitor.ts` | FR-012 |
| `assistantMessageId` plumbing | `composables/useChatStream.ts`, `server/routes/_ws.ts` | FR-013 |
| Exact-placeholder update with last-streaming fallback | `server/utils/jobPersister.ts` | FR-013 |

### Phase 3: Scheduler (NOT YET)

- Cron/trigger-based job scheduling
- Auto worktree allocation for scheduler jobs
- Scheduler settings UI

### Phase 4: Notifications + Multi-client Sync (NOT YET)

- WS push notifications for new server conversations
- Client conversation list auto-refresh on notification
- Multi-tab synchronization

## Design Decisions

### D-001: In-memory job state
Jobs live only in server memory. Server restart loses all active job data. This is acceptable for Phase 2; persistent job state can be added in a later phase if needed.

**Trade-off**: Simplicity vs durability. For a local dev tool, simplicity wins.

### D-002: Event buffer unbounded
`ChatJob.events[]` grows without limit during a job's lifetime. For typical AI conversations (hundreds of events), this is fine. If scheduler runs very long tasks, a TTL or max-buffer-size should be added.

### D-003: Permission mode defaults to bypass for scheduler jobs
Server-initiated jobs default to `permissionMode: 'bypass'` since no human is present to respond to permission prompts. The API allows overriding this to `ask` mode, in which case permission_request events buffer until a client subscribes and responds.

### D-004: ConversationStore integration in POST /api/jobs
The job submission API creates the conversation record synchronously before submitting the job. This ensures the conversation is discoverable by clients immediately, even if the job hasn't produced any output yet.

### D-005: Cursor-based replay
Event replay uses a simple integer cursor (array index). The client tracks its cursor and can reconnect with the last known cursor to avoid re-processing events. This is simpler than sequence IDs and sufficient for the in-memory model.

### D-006: Interactive PTY as the live execution path
Jobs run through the provider's persistent interactive PTY instead of one-shot `-p`/`codex exec`. This preserves in-TUI context across turns and lets a terminal-ws viewer watch live. Turn completion is inferred from the CLI Stop hook because the TUI has no machine-readable "done" signal. `runProviderViaStream` is retained as dead-but-ready code for rollback during testing.

**Trade-off**: Richer/persistent sessions vs. timing-heuristic fragility (composer-ready and echo-settled are detected by idle windows). Mitigated by forced-injection/forced-submit caps.

### D-007: Turn-completion is fail-safe
Because completion depends on an out-of-band hook, the job never trusts the hook alone: a PTY exit finalizes as `error`, and an absolute `PTY_TURN_TIMEOUT_MS` cap finalizes as `error` if no Stop hook ever arrives. This guarantees the active job is always released.

## FR Coverage Matrix

| FR | Plan Section | Status |
|----|-------------|--------|
| FR-001 | Phase 2: Submit job API | Implemented |
| FR-002 | Phase 2: List jobs API | Implemented |
| FR-003 | Phase 2: Get job API | Implemented |
| FR-004 | Phase 2: Cancel job API | Implemented |
| FR-005 | Phase 2: WS subscribe | Implemented |
| FR-006 | Phase 2: Event replay protocol | Implemented |
| FR-007 | Phase 2: ConversationSource type | Implemented |
| FR-008 | Phase 2: Server-side conversation creation | Implemented |
| FR-009 | Phase 2: Client conversation refresh | Implemented |
| FR-010 | Phase 2: Client subscribe composable | Implemented |
| FR-011 | Phase 2: listAllJobs | Implemented |
| FR-012 | Phase 2.5: Interactive PTY execution + fail-safe completion | Implemented |
| FR-013 | Phase 2.5: Client-anchored assistant persistence | Implemented |
