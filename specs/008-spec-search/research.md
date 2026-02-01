# Research: Spec Vector Search

**Feature**: 008-spec-search
**Date**: 2026-02-06
**Updated**: 2026-02-16

## Research Summary

This feature introduces SQLite-backed indexing, vector retrieval, and resilient index synchronization. The cache must remain correct even when Spec Cat is offline and spec files change.

---

## Decision 1: SQLite as Search Index Storage

**Question**: Where should the search index be stored?

**Decision**: SQLite database via `better-sqlite3` at `~/.spec-cat/projects/{hash}/specs-index.db`

**Rationale**:
- Embedded, zero external service
- Fast local queries with FTS5
- Rebuildable cache aligns with `specs/*` source-of-truth requirement

---

## Decision 2: Embedding Model Selection

**Question**: Which embedding model should be used?

**Decision**: BGE-small-en-v1.5 (384 dims) via `@xenova/transformers`

**Rationale**:
- Good retrieval quality/cost balance
- Local inference supports local-first workflow

---

## Decision 3: Vector Storage

**Question**: How to store/query vectors?

**Decision**: `sqlite-vec` virtual table `vec0(float[384])`

**Rationale**:
- Native SQLite integration
- SQL-based KNN retrieval

---

## Decision 4: Chunking Strategy

**Question**: How to split markdown?

**Decision**: H3 boundaries with H2 fallback; target 15-60 lines; split >80 lines at paragraph breaks.

---

## Decision 5: Hybrid Ranking

**Question**: How to combine keyword and semantic results?

**Decision**: Reciprocal Rank Fusion (RRF) with `k=60`.

---

## Decision 6: Change Detection Baseline

**Question**: How to detect file changes accurately?

**Decision**: Persist SHA-256 per file in `source_files` and compare against freshly scanned hashes.

**Rationale**:
- Works across restarts and offline edits
- Avoids false positives from mtime-only logic

---

## Decision 7: Indexing Trigger Architecture

**Question**: Should indexing use file watchers or scheduled hash scans?

**Decision**: Use startup reconciliation + periodic hash polling every 30 seconds. Do not rely on chokidar as primary sync strategy.

**Rationale**:
- Watchers cannot observe edits made while app is down
- Startup reconciliation guarantees cache repair on restart
- Fixed polling gives predictable behavior and simpler operational model
- Hash diffing keeps polling inexpensive at project scale

**Implementation shape**:
- On server boot: run `startup-reconcile`
- During runtime: run `poll-scan` every 30s
- Use single-job lock to prevent overlap (`already indexing`)

---

## Decision 8: Indexing State Visibility

**Question**: How should users know indexing progress and control recovery?

**Decision**: Expose runtime index state via status API and add UI indicator + manual reindex button.

**Rationale**:
- Users need confidence that index freshness is maintained
- Manual recovery path is required for operations/debugging

**State fields**:
- `isIndexing`
- `currentJob` (`startup-reconcile` | `poll-scan` | `manual-reindex`)
- `lastScanAt`
- `lastIndexedAt`
- `schedulerActive`
- `pollIntervalSeconds`

---

## Decision 9: Lazy Model Loading

**Question**: When should embeddings model load?

**Decision**: Load lazily on first semantic/hybrid request.

---

## Decision 10: Pipeline Context Injection

**Question**: How should search improve `/implement`?

**Decision**: Query index from task description and inject top-5 chunks into prompt.

---

## Decision 11: Graceful Degradation

**Question**: How to handle missing vector/model/db issues?

**Decision**:
- Vector/model failures -> keyword-only + warning
- Missing/corrupt DB -> rebuild and continue
- Missing `specs/` -> empty safe responses

