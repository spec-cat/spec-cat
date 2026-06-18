# Tasks: Server-Driven Chat Architecture

**Feature**: 035-server-driven-chat
**Created**: 2026-03-20

## Phase 1: Core Infrastructure

### T-001: Create EventBus singleton [FR-005, FR-006]
- [x] `server/utils/eventBus.ts` — per-conversation pub/sub [FR-005, FR-006]
- [x] `emit(conversationId, event)` / `subscribe(conversationId, callback)`
- [x] Multiple subscribers per conversation
- [x] `hasSubscribers()` check

### T-002: Create JobQueue singleton [FR-001, FR-011]
- [x] `server/utils/jobQueue.ts` — job lifecycle management
- [x] `submit(msg, source)` with source: `'user' | 'scheduler' | 'cascade'` [FR-001]
- [x] `abort()`, `respondToPermission()`, `resetContext()`, `cleanup()`
- [x] `getJob()`, `getActiveJob()`, `listJobs()`, `listAllJobs()` [FR-011]
- [x] Event buffering in `ChatJob.events[]`
- [x] Provider execution decoupled from WebSocket

### T-003: Refactor WebSocket handler [FR-005]
- [x] `server/routes/_ws.ts` — thin transport layer
- [x] Delegates to `jobQueue.submit()` for chat messages
- [x] Subscribes peers to EventBus for real-time forwarding [FR-005]
- [x] `cleanup()` on peer disconnect (aborts user jobs, preserves scheduler jobs)

## Phase 2: Client Subscribe + Job API

### T-004: Add ConversationSource type [FR-007]
- [x] `types/chat.ts` — `ConversationSource = 'user' | 'scheduler' | 'cascade'` [FR-007]
- [x] `Conversation.source?: ConversationSource` field added

### T-005: Create Job Submit API [FR-001, FR-008]
- [x] `server/api/jobs/index.post.ts` — POST `/api/jobs` [FR-001]
- [x] Accepts message, conversationId?, title?, source?, permissionMode?, cwd?, featureId?, providerId?, providerModelKey?
- [x] Creates conversation in filesystem store via `upsertConversationInStorage()` [FR-008]
- [x] Submits job to queue, returns `{ jobId, conversationId, source }`

### T-006: Create Job List API [FR-002]
- [x] `server/api/jobs/index.get.ts` — GET `/api/jobs` [FR-002]
- [x] Optional `?conversationId=X` filter
- [x] Returns serialized job summaries (id, conversationId, source, status, createdAt, eventCount)

### T-007: Create Job Get API [FR-003]
- [x] `server/api/jobs/[id].get.ts` — GET `/api/jobs/:id` [FR-003]
- [x] Cursor-based event retrieval via `?cursor=N`
- [x] Returns job details + events from cursor + nextCursor

### T-008: Create Job Cancel API [FR-004]
- [x] `server/api/jobs/[id]/cancel.post.ts` — POST `/api/jobs/:id/cancel` [FR-004]
- [x] Aborts running job, returns success/failure reason

### T-009: Add WS Subscribe message + Event Replay [FR-005, FR-006]
- [x] `SubscribeMessage` type in `_ws.ts`
- [x] `handleSubscribe()` — subscribes peer to EventBus [FR-005]
- [x] Replays buffered events: `replay_start` → events → `replay_end` [FR-006]
- [x] Returns `subscribed` if no events to replay

### T-010: Add Client Subscribe composable [FR-010]
- [x] `useChatStream.subscribe(conversationId, messageId, cursor?)` function [FR-010]
- [x] Connects WebSocket, sends subscribe message
- [x] Handles `replay_start`, `replay_end`, `subscribed` responses
- [x] Replay events processed through existing `handleMessage()` pipeline

### T-011: Add Client Conversation Refresh [FR-009]
- [x] `refreshServerConversations()` in `stores/chat.ts` [FR-009]
- [x] Reloads from server storage, merges new conversations
- [x] Deduplicates by conversation ID
- [x] Sorts after merge

## Phase 2.5: Interactive PTY Execution + Anchored Persistence

### T-016: Route execution through the interactive PTY [FR-012]
- [x] `runProvider()` delegates to `runProviderViaPty()`; `runProviderViaStream()` retained for rollback [FR-012]
- [x] `injectMessage()` waits for composer-idle, bracketed-pastes the prompt, then submits [FR-012]
- [x] Strip embedded bracketed-paste markers from the injected message [FR-012]
- [x] Prepend spec context / speckit autonomy directive (no `--append-system-prompt` in TUI) [FR-012]

### T-017: Detect turn completion via CLI Stop hook [FR-012]
- [x] `terminalSessions` injects CLI hooks (env + claude/codex settings) when `hookContext.enabled` [FR-012]
- [x] `cliHookMonitor` matches every spool record (no jobId filter) and fires `onStop` once [FR-012]
- [x] On Stop, emit final assistant text + `cli_turn_stop_confirmed` + `done` [FR-012]

### T-018: Fail-safe turn completion [FR-012]
- [x] PTY exit mid-turn finalizes the job as `error` [FR-012]
- [x] `PTY_TURN_TIMEOUT_MS` cap finalizes as `error` when no Stop hook arrives [FR-012]
- [x] Ctrl+C interrupt on cancel/supersession keeps the session alive [FR-012]
- [x] Monitor armed only post-submit so stray pre-submit Stop hooks are ignored [FR-012]
- [x] Resumed session exit retries once from a fresh session before erroring [FR-012]

### T-019: Client-anchored assistant persistence [FR-013]
- [x] Client sends `assistantMessageId`; threaded through `_ws.ts` to `startPersisting()` [FR-013]
- [x] `jobPersister` updates the exact placeholder, falling back to last-streaming [FR-013]
- [x] Regression test in `tests/server/conversationRecovery.test.ts` [FR-013]

## Phase 3: Scheduler (Not Started)

### T-012: Create Scheduler module
- [ ] `server/utils/scheduler.ts` — cron/trigger-based job scheduling
- [ ] Auto worktree allocation for scheduler jobs
- [ ] Integration with `jobQueue.submit()`

### T-013: Scheduler settings UI
- [ ] Schedule definition (cron expression or event trigger)
- [ ] Execution history view
- [ ] Navigate to conversation from execution result

## Phase 4: Notifications + Sync (Not Started)

### T-014: Server push notifications
- [ ] WS notification for new server-initiated conversations
- [ ] Client auto-refresh on notification

### T-015: Multi-tab synchronization
- [ ] Same conversation viewable from multiple tabs simultaneously
- [ ] EventBus multi-subscriber already supports this (wire UI)
