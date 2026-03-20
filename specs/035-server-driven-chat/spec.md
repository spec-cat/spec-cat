# Feature Specification: Server-Driven Chat Architecture

**Feature Branch**: `035-server-driven-chat`
**Created**: 2026-03-20
**Status**: In Progress
**Input**: Server-side job queue + event bus enabling server/scheduler-initiated conversations with client subscribe/replay

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Server-initiated conversation via REST API (Priority: P1)

As a server administrator or scheduler, I want to start an AI conversation through a REST API so that automated workflows can execute AI tasks without a client being connected.

**Why this priority**: This is the core capability that decouples AI execution from client presence, enabling batch operations, scheduled tasks, and CI/CD integrations.

**Independent Test**: POST to `/api/jobs` with a message and verify that a conversation is created in storage and a job is submitted to the queue.

**Acceptance Scenarios**:

1. **Given** a valid message and optional conversationId, **When** POST `/api/jobs` is called, **Then** a conversation record is created in the filesystem store and a job is submitted with status `queued` or `running`.
2. **Given** no conversationId is provided, **When** POST `/api/jobs` is called, **Then** a new conversationId is auto-generated and returned in the response.
3. **Given** a `source` of `scheduler`, **When** the job is created, **Then** the conversation record has `source: 'scheduler'` persisted.

---

### User Story 2 - Client discovers server-initiated conversations (Priority: P1)

As a user, I want to see conversations started by the server/scheduler in my conversation list so that I can observe what automated tasks have been running.

**Why this priority**: Without discovery, server-initiated work is invisible to users.

**Independent Test**: After a server-initiated job creates a conversation, call `refreshServerConversations()` and verify the new conversation appears in the store.

**Acceptance Scenarios**:

1. **Given** a server-initiated conversation exists in storage but not in the client store, **When** `refreshServerConversations()` is called, **Then** the conversation is merged into the local state.
2. **Given** multiple server-initiated conversations exist, **When** the client refreshes, **Then** all new conversations are added without duplicating existing ones.
3. **Given** a server-initiated conversation has `source: 'scheduler'`, **When** displayed in the conversation list, **Then** the source is available for UI differentiation (badge, icon, etc.).

---

### User Story 3 - Client subscribes and replays buffered events (Priority: P1)

As a user, I want to connect to an in-progress server-initiated conversation and see all events that happened before I connected so that I don't miss any AI output.

**Why this priority**: Without replay, late-joining clients see an empty chat even though the AI has been producing output.

**Independent Test**: Start a job via API, let it produce events, then connect a WebSocket client with `subscribe` message and verify all buffered events are replayed.

**Acceptance Scenarios**:

1. **Given** a job has produced N events, **When** a client sends `{ type: 'subscribe', conversationId, cursor: 0 }`, **Then** the server sends `replay_start`, all N events, then `replay_end`.
2. **Given** a client already received some events (cursor=K), **When** it reconnects with `cursor: K`, **Then** only events from index K onward are replayed.
3. **Given** no active job exists for the conversation, **When** a client subscribes, **Then** a `subscribed` message is returned with no replay.
4. **Given** a job is still running after replay, **When** new events are produced, **Then** the subscribed client receives them in real-time via EventBus.

---

### User Story 4 - Job status monitoring and cancellation (Priority: P2)

As a user or administrator, I want to query job status and cancel running jobs via REST API so that I can monitor and control automated tasks.

**Why this priority**: Observability and control over server-initiated work is essential for production use.

**Independent Test**: List jobs via GET `/api/jobs`, query a specific job via GET `/api/jobs/:id`, and cancel a running job via POST `/api/jobs/:id/cancel`.

**Acceptance Scenarios**:

1. **Given** multiple jobs exist, **When** GET `/api/jobs` is called, **Then** all jobs are returned with id, conversationId, source, status, createdAt, and eventCount.
2. **Given** a job exists, **When** GET `/api/jobs/:id?cursor=5` is called, **Then** the job details and events from index 5 onward are returned with nextCursor.
3. **Given** a running job, **When** POST `/api/jobs/:id/cancel` is called, **Then** the job is aborted and the response confirms success.
4. **Given** a finished job, **When** POST `/api/jobs/:id/cancel` is called, **Then** the response indicates the job already finished.

---

### User Story 5 - EventBus decouples execution from transport (Priority: P1)

As a developer, I want AI provider execution to emit events through an EventBus rather than directly to WebSocket peers so that multiple subscribers (multi-tab, observers) can receive events and server-initiated jobs work without any connected client.

**Why this priority**: This is the architectural foundation that enables all other user stories.

**Independent Test**: Submit a job with no WebSocket clients connected, verify events accumulate in `job.events` buffer, then connect a client and replay them.

**Acceptance Scenarios**:

1. **Given** a job is running with no subscribers, **When** events are emitted, **Then** they are buffered in `job.events` for later replay.
2. **Given** two WebSocket clients subscribe to the same conversation, **When** an event is emitted, **Then** both clients receive it.
3. **Given** a WebSocket client disconnects, **When** the job source is `scheduler`, **Then** the job continues running (not aborted).
4. **Given** a WebSocket client disconnects, **When** the job source is `user`, **Then** the job is aborted via `cleanup()`.

### Edge Cases

- Client subscribes to a conversation with no jobs (past or present) — receives `subscribed` with no replay.
- Client subscribes while a job is in `waiting_permission` status — receives replayed events including the permission_request, allowing the client to respond.
- Multiple jobs are submitted for the same conversation in rapid succession — previous job is cancelled, new job runs.
- Server restarts mid-job — in-memory job state is lost; client must handle gracefully (no replay available).
- Job produces thousands of events — replay sends all buffered events; consider pagination in future iteration.

## Feature Requirements

### FR-001: Job REST API - Submit
POST `/api/jobs` accepts `{ message, conversationId?, title?, source?, permissionMode?, cwd?, featureId?, providerId?, providerModelKey? }`. Creates a conversation in filesystem storage if new. Returns `{ jobId, conversationId, source }`.

### FR-002: Job REST API - List
GET `/api/jobs` returns all jobs. GET `/api/jobs?conversationId=X` filters by conversation. Each entry includes `{ id, conversationId, source, status, createdAt, eventCount }`.

### FR-003: Job REST API - Get with cursor
GET `/api/jobs/:id?cursor=N` returns job details and events from index N. Returns `{ id, conversationId, source, status, createdAt, events[], nextCursor }`.

### FR-004: Job REST API - Cancel
POST `/api/jobs/:id/cancel` aborts the job if running/queued. Returns `{ success, reason? }`.

### FR-005: WebSocket Subscribe Message
Client can send `{ type: 'subscribe', conversationId, cursor? }` to subscribe to a conversation's events and receive buffered event replay.

### FR-006: Event Replay Protocol
Server responds to subscribe with `replay_start` → buffered events → `replay_end` (with nextCursor). If no events to replay, sends `subscribed`.

### FR-007: ConversationSource Type
`Conversation` type includes optional `source: 'user' | 'scheduler' | 'cascade'` field. Persisted in storage for UI differentiation.

### FR-008: Server-side Conversation Creation
When a job is submitted via REST API, a minimal `Conversation` record is created in the filesystem store with the appropriate source, enabling client discovery via `refreshServerConversations()`.

### FR-009: Client Conversation Refresh
`refreshServerConversations()` in the chat store reloads conversations from server storage and merges any new server-initiated conversations into local state without duplicating existing ones.

### FR-010: Client Subscribe Composable
`useChatStream.subscribe(conversationId, messageId, cursor?)` connects via WebSocket, sends subscribe message, and handles replay/real-time event flow.

### FR-011: JobQueue listAllJobs
`ChatJobQueue.listAllJobs()` returns all jobs across all conversations for the list API.

## Constraints

- No new runtime dependencies (uses existing Nitro server, WebSocket, filesystem storage).
- Job state is in-memory only; server restart loses active job data (acceptable for Phase 2).
- Event buffer grows unbounded per job; consider TTL/eviction in future phase.
- Permission mode defaults to `bypass` for server-initiated jobs (scheduler doesn't interact with permission prompts).

## Dependencies

- `server/utils/eventBus.ts` — ConversationEventBus singleton (Phase 1, complete)
- `server/utils/jobQueue.ts` — ChatJobQueue singleton (Phase 1, complete)
- `server/routes/_ws.ts` — WebSocket transport layer (Phase 1, refactored)
- `server/utils/conversationStore.ts` — Filesystem conversation persistence
- `types/chat.ts` — Shared type definitions
