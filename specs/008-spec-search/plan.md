# Implementation Plan: Spec Vector Search

**Branch**: `008-spec-search` | **Date**: 2026-02-06 | **Updated**: 2026-02-16 | **Spec**: [specs/008-spec-search/spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-spec-search/spec.md`
**Status**: Draft (not yet implemented)

## Summary

Provide keyword and semantic search across spec files using SQLite FTS5 plus sqlite-vec embeddings. `specs/*` remains source of truth and SQLite is rebuildable cache. Index freshness is maintained by hash-based startup reconciliation and a 30-second polling scheduler, not event watchers. Runtime indexing state is exposed to UI, and users can trigger manual full reindex.

## Technical Context

**Language/Version**: TypeScript 5.6+ with Nuxt 3 (v3.16+)
**Primary Dependencies**: `better-sqlite3`, `sqlite-vec`, `@xenova/transformers`
**Storage**: SQLite DB at `~/.spec-cat/projects/{hash}/specs-index.db`
**Scheduler**: 30-second hash polling with startup reconciliation and single-job lock
**Testing**: Manual testing + `pnpm typecheck`
**Target Platform**: Nitro server (Node.js 18+)
**Project Type**: Full-stack feature (server APIs + UI status/action)
**Performance Goals**: keyword query <10ms; full reindex <5s; polling reconciliation <=35s
**Constraints**: model first download may require internet; graceful degradation required

## Constitution Check

| Gate | Status | Notes |
|------|--------|-------|
| User Control First | PASS | Manual reindex button and status visibility |
| Streaming-Native | N/A | Request/response search |
| CLI Parity | N/A | UI + API feature |
| Simplicity Over Complexity | PASS | Hash polling avoids watcher edge cases across downtime |
| Type Safety | PASS | Typed search/index/status contracts |
| Nuxt 3 + Pinia | PASS | Nitro APIs + existing UI/store patterns |
| Tailwind CSS only | PASS | Reuses existing UI patterns |
| Dependencies | CAUTION | Adds SQLite/vector/embedding packages only |

## Project Structure

### Documentation

```text
specs/008-spec-search/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Planned Source Changes

```text
server/api/specs/
├── search.get.ts
├── reindex.post.ts
└── status.get.ts

server/utils/specSearch/
├── index.ts
├── chunker.ts
├── database.ts
├── embeddings.ts
├── indexer.ts
├── scheduler.ts           # startup reconcile + 30s polling
└── contextInjector.ts

types/specSearch.ts

# UI integration points
stores/settings.ts or stores/chat.ts  # index status polling/state
components/settings/SettingsModal.vue # indicator + Reindex Specs action
```

## FR Coverage Matrix

| FR | Description | Implementation Files (planned) |
|----|-------------|-------------------------------|
| FR-001 | Chunk at H3/H2 boundaries | `server/utils/specSearch/chunker.ts` |
| FR-001a | Chunk sizing and oversized split | `server/utils/specSearch/chunker.ts` |
| FR-001b | FR/Task tag extraction | `server/utils/specSearch/chunker.ts` |
| FR-002 | SQLite + FTS5 storage | `server/utils/specSearch/database.ts` |
| FR-003 | Vector storage (sqlite-vec) | `server/utils/specSearch/database.ts`, `embeddings.ts` |
| FR-004 | Keyword search BM25 | `server/utils/specSearch/database.ts`, `server/api/specs/search.get.ts` |
| FR-005 | Semantic search | `database.ts`, `embeddings.ts`, `search.get.ts` |
| FR-006 | Hybrid RRF | `database.ts`, `search.get.ts` |
| FR-007 | File hash tracking | `indexer.ts`, `database.ts` |
| FR-007a | Skip unchanged files | `indexer.ts` |
| FR-008 | Startup reconciliation | `scheduler.ts`, `indexer.ts`, server plugin init |
| FR-008a | New/changed/deleted detection on startup | `scheduler.ts`, `indexer.ts` |
| FR-008b | Poll every 30s | `scheduler.ts` |
| FR-008c | Single active indexing job lock | `scheduler.ts`, `reindex.post.ts` |
| FR-009 | Filter by feature/file type | `search.get.ts`, `database.ts` |
| FR-010 | Metadata return in search results | `types/specSearch.ts`, `database.ts`, `search.get.ts` |
| FR-011 | specs as source of truth | Architecture + `indexer.ts` |
| FR-011a | Full rebuild capability | `indexer.ts`, `reindex.post.ts` |
| FR-012 | Lazy model loading | `embeddings.ts` |
| FR-013 | Graceful degradation | `search.get.ts`, `database.ts` |
| FR-013a | Keyword fallback | `search.get.ts` |
| FR-013b | Warning response | `types/specSearch.ts`, `search.get.ts` |
| FR-014 | Pipeline context injection | `contextInjector.ts` + pipeline integration route |
| FR-015 | Runtime status API fields | `scheduler.ts`, `status.get.ts`, `types/specSearch.ts` |
| FR-016 | Indexing indicator UI | UI component + store/composable using `status.get.ts` |
| FR-017 | Manual reindex UI action | UI component + `reindex.post.ts` |

## Complexity Tracking

| Item | Why Needed | Simpler Alternative Rejected |
|------|------------|------------------------------|
| sqlite-vec | semantic retrieval | pure JS scan too slow at scale |
| local embeddings | local-first behavior | external API adds cost/dependency |
| scheduler polling | survives downtime + predictable behavior | chokidar misses offline edits |
