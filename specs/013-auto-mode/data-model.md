# Data Model: Auto Mode

**Date**: 2026-02-28  
**Source**: `/home/khan/src/brick/specs/013-auto-mode/spec.md`

## Entities

### AutoModeState

Runtime orchestrator state for one activation cycle.

| Field | Type | Description |
|------|------|-------------|
| enabled | `boolean` | Toggle state for Auto Mode |
| cycleId | `string` | Unique cycle identifier for current activation |
| baseBranch | `string \| null` | User-selected base branch for cycle |
| integrationBranch | `'sc/automode'` | Shared branch accumulating successful feature outputs |
| status | `'idle' \| 'running' \| 'stopping'` | Scheduler lifecycle state |
| queue | `AutoModeTask[]` | Full task list for this cycle |
| activeFeatureIds | `string[]` | Features currently running (max `concurrency`) |
| processedFeatureIds | `string[]` | Features completed, failed, or skipped in this cycle |
| concurrency | `number` | Parallel cascade limit (default 3) |
| lastStartedAt | `string \| null` | ISO timestamp when cycle started |
| lastCompletedAt | `string \| null` | ISO timestamp when cycle ended |

**Validation Rules**:
- `concurrency` must be integer >= 1.
- `integrationBranch` is always `sc/automode`.
- `enabled=true` with `status='idle'` means waiting for explicit re-toggle (single-cycle behavior).

### AutoModeTask

Queue item for one feature (or constitution unit).

| Field | Type | Description |
|------|------|-------------|
| featureId | `string` | Spec feature id (e.g., `013-auto-mode`) or `constitution` |
| kind | `'feature' \| 'constitution'` | Task category |
| state | `'queued' \| 'running' \| 'success' \| 'failed' \| 'skipped'` | Processing state |
| conversationId | `string \| null` | Bound conversation id |
| startStep | `'plan' \| 'tasks' \| 'skill:better-spec'` | First step for incremental execution |
| steps | `string[]` | Concrete command sequence to run |
| reason | `string \| null` | Skip/failure reason (`Auto Mode disabled`, `Manual interaction`, etc.) |
| startedAt | `string \| null` | ISO start time |
| completedAt | `string \| null` | ISO completion time |

**Validation Rules**:
- `state='running'` requires `conversationId` and `startedAt`.
- `state='success'` requires `completedAt` and successful `skill:better-spec` completion.
- `state='failed'` requires non-empty `reason`.

### AutoModeHashRecord

Persistent hash snapshot used for skip/incremental detection.

| Field | Type | Description |
|------|------|-------------|
| featureId | `string` | Feature identifier |
| specHash | `string` | SHA-256 of `spec.md` |
| planHash | `string` | SHA-256 of `plan.md` |
| tasksHash | `string` | SHA-256 of `tasks.md` |
| updatedAt | `string` | ISO timestamp of successful cascade completion |

**Validation Rules**:
- Hashes are 64-char lowercase hex.
- Record is written only after successful full task completion (FR-018).
- No hash update occurs for failed/skipped tasks.

### AutoModePersistedSnapshot

Durable resume payload for refresh recovery.

| Field | Type | Description |
|------|------|-------------|
| enabled | `boolean` | Persisted toggle state |
| cycleId | `string \| null` | Active cycle id or null |
| baseBranch | `string \| null` | Selected base branch for cycle |
| status | `'idle' \| 'running' \| 'stopping'` | Persisted scheduler status |
| concurrency | `number` | Persisted concurrency setting |
| tasks | `AutoModeTask[]` | Persisted queue with states |
| hashes | `Record<string, AutoModeHashRecord>` | Per-feature successful hash records |

**Validation Rules**:
- On hydration, tasks persisted as `running` are reset to `queued` (FR-015a).
- Snapshot must be project-scoped and replaced atomically.

### Conversation (Extension)

Existing conversation entity gains Auto Mode metadata.

| Field | Type | Description |
|------|------|-------------|
| autoMode | `boolean \| undefined` | True when conversation is created/managed by Auto Mode |
| featureId | `string \| undefined` | Existing feature linkage used for conversation reuse |

**Validation Rules**:
- `autoMode=true` does not alter existing conversation lifecycle permissions.
- Auto conversations remain eligible for rename/delete/preview/finalize/search.

## Relationships

- `AutoModeState (1)` has many `AutoModeTask (0..n)`.
- `AutoModeTask (0..1)` links to `Conversation (1)` via `conversationId`.
- `AutoModeHashRecord (0..1 per feature)` informs `AutoModeTask.startStep` and skip decisions.
- `AutoModePersistedSnapshot (1)` serializes `AutoModeState` + hash records for resume.

## State Transitions

### Scheduler

1. `idle -> running`: user toggles on and selects base branch.
2. `running -> stopping`: user toggles off while active tasks exist.
3. `stopping -> idle`: active tasks finish, no new tasks started.
4. `running -> idle`: queue drained (single-cycle complete).

### Task

1. `queued -> skipped`: unchanged hashes or active-worktree conflict.
2. `queued -> running`: worker slot available and Auto Mode still enabled.
3. `running -> success`: all steps complete with passing `skill:better-spec` and integration complete.
4. `running -> failed`: cascade/integration/manual interruption error.
5. `queued -> failed`: Auto Mode disabled before start.

## Derived Rules

- If `spec.md` changed: `startStep='plan'`, run `plan -> tasks -> skill:better-spec`.
- If only `plan.md` changed: `startStep='tasks'`, run `tasks -> skill:better-spec`.
- If only `tasks.md` changed: `startStep='skill:better-spec'`, run only `skill:better-spec`.
- If no files changed: mark task `skipped`.
- Feature marked `success` only after in-cycle integration to `sc/automode` succeeds (or conflict auto-resolution succeeds).
