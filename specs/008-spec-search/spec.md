# Feature Specification: Spec Vector Search

**Feature Branch**: `008-spec-search`
**Created**: 2026-02-06
**Updated**: 2026-02-16
**Status**: In Progress (implementation largely complete; manual validation pending)
**Input**: User description: "Enable vector search by embedding specs into SQLite. `specs/*` files are the source of truth and SQLite acts only as a cache."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keyword Search Across Specs (Priority: P1)

As a developer using Spec Cat, I want to search across all spec files in the current project using keywords so that I can quickly find relevant requirements, decisions, and implementation details without manually opening each file.

**Why this priority**: Keyword search is the most basic and immediately useful search capability. It delivers value even without vector embeddings and serves as the foundation for all other search features.

**Independent Test**: Call the search API with keyword queries and verify relevant spec chunks and metadata are returned.

**Acceptance Scenarios**:

1. **Given** specs have been indexed, **When** I search for "sidebar", **Then** I receive chunks from spec files that contain the word "sidebar" ranked by relevance.
2. **Given** specs have been indexed, **When** I search for "FR-001", **Then** I receive the chunk containing FR-001's definition and related chunks.
3. **Given** specs have been indexed, **When** I search for a term that does not exist, **Then** I receive zero results.

---

### User Story 2 - Semantic Search Across Specs (Priority: P1)

As a developer, I want to search specs using natural language queries so that I can find conceptually related content even when exact keywords do not match.

**Why this priority**: Semantic search is the core differentiator of this feature.

**Independent Test**: Search with natural-language queries and verify semantically relevant results are returned.

**Acceptance Scenarios**:

1. **Given** specs have embeddings, **When** I search "how does the app handle errors", **Then** I receive chunks about error handling and edge cases even without exact keyword matches.
2. **Given** specs have embeddings, **When** I search "real-time updates", **Then** I receive chunks about streaming, WebSocket, and SSE-related behavior.
3. **Given** the embedding model has not been downloaded, **When** semantic search is triggered, **Then** the model is downloaded lazily and search completes.

---

### User Story 3 - Resilient Auto Indexing Across Restarts (Priority: P2)

As a developer, I want index synchronization to work even if Spec Cat was offline while spec files changed, so that restart automatically reconciles stale index data.

**Why this priority**: Files can change while the app is not running. Restart-time reconciliation is required to keep the cache trustworthy.

**Independent Test**: Stop Spec Cat, modify spec files, start Spec Cat, and verify only changed files are re-indexed by hash comparison.

**Acceptance Scenarios**:

1. **Given** Spec Cat was stopped and `specs/*` changed, **When** Spec Cat starts, **Then** it compares current file hashes with stored `source_files.content_hash` and re-indexes only changed/new/deleted files.
2. **Given** no spec files changed while stopped, **When** Spec Cat starts, **Then** no file is re-indexed.
3. **Given** Spec Cat is running, **When** 30 seconds elapse, **Then** the scheduler scans hashes and applies incremental re-indexing.

---

### User Story 4 - Visible Indexing State and Manual Reindex (Priority: P2)

As a developer, I want to see when indexing is running and trigger reindex manually so that I can trust index freshness and recover quickly when needed.

**Why this priority**: Operational visibility and manual override improve reliability and user control.

**Independent Test**: Trigger manual reindex from UI and verify indexing state appears while running and clears on completion.

**Acceptance Scenarios**:

1. **Given** indexing is in progress (startup, scheduler, or manual), **When** I view the UI, **Then** an indexing indicator is visible.
2. **Given** I click "Reindex Specs", **When** a full reindex starts, **Then** `isIndexing=true` is reflected immediately and completion stats are shown when done.
3. **Given** an indexing job is already running, **When** another manual reindex is requested, **Then** the system prevents overlapping jobs and returns a clear "already indexing" response.

---

### User Story 5 - Pipeline Context Injection (Priority: P2)

As a developer using the `/implement` pipeline, I want Spec Cat to inject relevant spec context automatically so AI output remains spec-aligned.

**Why this priority**: This is the highest-value integration of search with implementation workflow.

**Independent Test**: Run `/implement` and verify top relevant chunks are injected.

**Acceptance Scenarios**:

1. **Given** specs are indexed and `/implement` is run, **When** task execution starts, **Then** top-5 relevant chunks are injected.
2. **Given** index is unavailable, **When** `/implement` runs, **Then** pipeline continues without context injection.

---

### User Story 6 - Manual Reindex and Status API (Priority: P3)

As a developer, I want status and reindex APIs so I can diagnose index health quickly.

**Why this priority**: Operational tools are useful for debugging and recovery.

**Independent Test**: Call reindex and status APIs; verify counts, timestamps, scheduler state, and indexing state.

**Acceptance Scenarios**:

1. **Given** I call reindex API, **When** reindex completes, **Then** response includes files indexed, chunks created, skipped unchanged, and duration.
2. **Given** index exists, **When** I call status API, **Then** response includes `fileCount`, `chunkCount`, `lastIndexedAt`, `lastScanAt`, `isIndexing`, `schedulerActive`, and `pollIntervalSeconds`.
3. **Given** DB is missing/corrupt, **When** reindex is triggered, **Then** DB is recreated from `specs/*`.

---

### Edge Cases

- Embedding model download failure:
  - Vector search is disabled; keyword search still works with warning.
- sqlite-vec load failure:
  - Vector search is disabled; keyword search still works with warning.
- `specs/` directory missing:
  - Search and indexing return empty results without server crash.
- DB file removed while running:
  - Next indexing/search operation recreates DB and continues.
- Multiple changes between polling intervals:
  - Next scan picks up all deltas; job runs sequentially.
- App restart during indexing:
  - On next startup, startup reconciliation re-checks hashes and repairs drift.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST chunk spec markdown files at H3 (`###`) boundaries with H2 (`##`) fallback.
- **FR-001a**: Chunks MUST target 15-60 lines; chunks exceeding 80 lines MUST be sub-split at paragraph breaks.
- **FR-001b**: System MUST extract FR tags (`FR-NNN`) and Task IDs (`TNNN`) from each chunk.
- **FR-002**: System MUST store chunks in SQLite with FTS5 full-text index.
- **FR-003**: System MUST store vector embeddings (384-dim, BGE-small-en-v1.5) in sqlite-vec virtual table.
- **FR-004**: System MUST provide keyword search via FTS5 BM25 ranking.
- **FR-005**: System MUST provide semantic search via vector similarity (KNN).
- **FR-006**: System MUST provide hybrid search combining FTS5 and vector results via Reciprocal Rank Fusion (RRF, k=60).
- **FR-007**: System MUST track source file content hashes (SHA-256) to detect changes.
- **FR-007a**: System MUST skip re-indexing files whose content hash has not changed.
- **FR-008**: System MUST run startup reconciliation on server boot by comparing current `specs/*` hashes with persisted index hashes.
- **FR-008a**: Startup reconciliation MUST detect new, changed, and deleted spec files and apply incremental indexing before scheduler enters steady-state polling.
- **FR-008b**: System MUST run periodic hash scans every 30 seconds while server is running and apply incremental indexing for detected deltas.
- **FR-008c**: Indexing jobs MUST run sequentially and MUST NOT overlap; concurrent requests should return an `already indexing` state.
- **FR-009**: System MUST support filtering search results by feature ID and file type.
- **FR-010**: System MUST return chunk metadata (feature ID, file type, section headings, line numbers, FR tags) with search results.
- **FR-011**: System MUST treat `specs/*` files as source of truth; SQLite DB is a rebuildable cache.
- **FR-011a**: System MUST fully rebuild the index from spec files at any time.
- **FR-012**: System MUST load embedding model lazily on first semantic/hybrid search.
- **FR-013**: System MUST degrade gracefully when vector search is unavailable.
- **FR-013a**: When vector search is unavailable, system MUST fall back to keyword-only search.
- **FR-013b**: System MUST include a warning field in responses during degraded mode.
- **FR-014**: System MUST inject relevant spec context into the `/implement` pipeline prompt.
- **FR-015**: System MUST expose runtime indexer state (`isIndexing`, `currentJob`, `lastScanAt`, `lastIndexedAt`) through status API.
- **FR-016**: UI MUST display an indexing indicator while `isIndexing=true`.
- **FR-017**: UI MUST provide a manual "Reindex Specs" action that triggers full reindex via API.

### Key Entities

- **SpecChunk**: section of spec file with content, heading hierarchy, line boundaries, and extracted tags.
- **SourceFile**: tracked spec file with path, content hash, and indexing timestamp.
- **SearchResult**: ranked chunk with scores and metadata.
- **IndexRuntimeState**: scheduler/indexer runtime state (`isIndexing`, `currentJob`, `lastScanAt`, `schedulerActive`, `pollIntervalSeconds`).
- **SpecIndexDb**: per-project SQLite database at `~/.spec-cat/projects/{hash}/specs-index.db`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Keyword search for "FR-001" returns the target chunk within 10ms under typical project size.
- **SC-002**: Semantic search returns relevant chunks that keyword search misses.
- **SC-003**: Hybrid search combines keyword and semantic results with no duplicates.
- **SC-004**: Changed files are reflected in index within 35 seconds during steady-state polling.
- **SC-005**: Full reindex of a typical project (7 features, ~12 files) completes within 5 seconds.
- **SC-006**: Index DB can be deleted and fully rebuilt without data loss (source of truth is files).
- **SC-007**: When embedding/model/vector path is unavailable, keyword search still works with warning.
- **SC-008**: `/implement` receives relevant context automatically when available.
- **SC-009**: After app restart, offline file changes are reconciled at startup with hash-based incremental indexing.
- **SC-010**: UI shows indexing state within 1 second of index start and clears within 1 second of completion.

## Assumptions

- Project follows `specs/{featureId}/*.md` convention.
- Node runtime supports required packages.
- First model download may require internet.
- `~/.spec-cat/projects/{hash}/` exists.

## Out of Scope

- Cross-project search.
- User-selected/custom embedding models.
- Search-as-you-type UI behavior.
