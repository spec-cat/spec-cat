# Quickstart: Spec Vector Search

**Feature**: 008-spec-search
**Date**: 2026-02-06
**Updated**: 2026-02-16
**Status**: Draft

## Overview

Implement spec search with SQLite FTS5 + vector embeddings and resilient index sync.

Key operational behavior:
- startup hash reconciliation
- 30-second periodic hash polling
- visible indexing state in UI
- manual reindex action

## Prerequisites

- [ ] `pnpm add better-sqlite3 sqlite-vec @xenova/transformers`
- [ ] `pnpm add -D @types/better-sqlite3`
- [x] Nuxt 3 runtime
- [x] `specs/` markdown structure exists

## Implementation Order

1. `types/specSearch.ts`
2. `server/utils/specSearch/database.ts`
3. `server/utils/specSearch/chunker.ts`
4. `server/utils/specSearch/indexer.ts`
5. `server/utils/specSearch/scheduler.ts` (startup reconcile + 30s polling + lock)
6. `server/api/specs/search.get.ts`
7. `server/api/specs/status.get.ts`
8. `server/api/specs/reindex.post.ts`
9. UI indicator/button integration (`components/settings/SettingsModal.vue` or equivalent)
10. pipeline context injection integration

## Key Patterns

### Startup Reconciliation + Polling Scheduler

```typescript
// server/utils/specSearch/scheduler.ts
const POLL_INTERVAL_MS = 30_000

async function reconcileByHash(job: 'startup-reconcile' | 'poll-scan' | 'manual-reindex') {
  if (state.isIndexing) {
    return { status: 'already-indexing' as const }
  }

  state.isIndexing = true
  state.currentJob = job

  try {
    const current = await scanSpecFilesWithHashes()
    const previous = loadIndexedHashes()
    await applyDelta(current, previous) // upsert changed/new, delete removed
    state.lastScanAt = new Date().toISOString()
    state.lastIndexedAt = new Date().toISOString()
    return { status: 'completed' as const }
  } finally {
    state.isIndexing = false
    state.currentJob = null
  }
}

export async function startScheduler() {
  await reconcileByHash('startup-reconcile')
  timer = setInterval(() => {
    void reconcileByHash('poll-scan')
  }, POLL_INTERVAL_MS)
}
```

### Status API Contract

```typescript
// GET /api/specs/status
{
  fileCount: 42,
  chunkCount: 318,
  lastIndexedAt: '2026-02-16T10:20:30.000Z',
  lastScanAt: '2026-02-16T10:20:30.000Z',
  isIndexing: false,
  currentJob: null,
  schedulerActive: true,
  pollIntervalSeconds: 30,
  modelLoaded: false,
  vectorEnabled: true,
  dbPath: '~/.spec-cat/projects/{hash}/specs-index.db'
}
```

### Manual Reindex with Overlap Protection

```typescript
// POST /api/specs/reindex
if (schedulerState.isIndexing) {
  return {
    success: false,
    status: 'already-indexing',
    filesIndexed: 0,
    chunksCreated: 0,
    skippedUnchanged: 0,
    duration: 0,
  }
}

return await runManualReindex()
```

## Test Checklist

### Search Core

- [ ] Keyword query returns expected chunks and metadata.
- [ ] Semantic/hybrid mode works; fallback warning appears when vector path fails.

### Scheduler and Restart Reliability

- [ ] Stop app, change `specs/*`, restart app, verify startup reconciliation indexes only changed/new/deleted files.
- [ ] With app running, edit file and verify update appears within 35 seconds.
- [ ] Confirm only one indexing job runs at a time.

### UI Visibility and Control

- [ ] Indexing indicator appears while `isIndexing=true`.
- [ ] Manual "Reindex Specs" starts a full reindex and shows completion/error status.
- [ ] Manual reindex while indexing returns/indicates "already indexing".

### Recovery

- [ ] Delete/corrupt DB and verify rebuild from `specs/*` succeeds.

## Validation Command

```bash
pnpm typecheck
```
