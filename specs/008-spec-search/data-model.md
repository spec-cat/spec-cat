# Data Model: Spec Vector Search

**Feature**: 008-spec-search
**Date**: 2026-02-06
**Updated**: 2026-02-16
**Status**: Draft

## Entity Overview

- `source_files`: hash-tracked source-of-truth file state for reconciliation
- `chunks`: canonical indexed chunks with metadata
- `chunks_fts`: FTS5 keyword index
- `chunks_vec`: vector index for semantic search
- `IndexRuntimeState`: in-memory scheduler/indexing runtime state exposed via API

## SQLite Schema

### source_files

```sql
CREATE TABLE IF NOT EXISTS source_files (
  path TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);
```

### chunks

```sql
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_path TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  file_type TEXT NOT NULL,
  heading_hierarchy TEXT,
  content TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  fr_tags TEXT,
  task_tags TEXT,
  FOREIGN KEY (source_path) REFERENCES source_files(path) ON DELETE CASCADE
);

CREATE INDEX idx_chunks_feature ON chunks(feature_id);
CREATE INDEX idx_chunks_source ON chunks(source_path);
```

### chunks_fts (FTS5)

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  content,
  feature_id,
  file_type,
  content='chunks',
  content_rowid='id'
);
```

### chunks_vec (sqlite-vec)

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding float[384]
);
```

## TypeScript Entities

```typescript
// types/specSearch.ts

export interface SpecChunk {
  id?: number
  sourcePath: string
  featureId: string
  fileType: string
  headingHierarchy: string[]
  content: string
  lineStart: number
  lineEnd: number
  frTags: string[]
  taskTags: string[]
}

export interface SourceFile {
  path: string
  contentHash: string
  indexedAt: string
}

export interface SearchResult {
  chunk: SpecChunk
  score: number
  matchType: 'keyword' | 'semantic' | 'hybrid'
  ftsScore?: number
  vectorDistance?: number
}

export interface SearchResponse {
  results: SearchResult[]
  totalCount: number
  searchTime: number
  mode: 'keyword' | 'semantic' | 'hybrid'
  warning?: string
}

export interface IndexStatus {
  fileCount: number
  chunkCount: number
  lastIndexedAt: string | null
  lastScanAt: string | null
  isIndexing: boolean
  currentJob: 'startup-reconcile' | 'poll-scan' | 'manual-reindex' | null
  schedulerActive: boolean
  pollIntervalSeconds: number
  modelLoaded: boolean
  vectorEnabled: boolean
  dbPath: string
}

export interface ReindexResponse {
  success: boolean
  filesIndexed: number
  chunksCreated: number
  skippedUnchanged: number
  duration: number
  status: 'completed' | 'already-indexing' | 'failed'
  error?: string
}
```

## Scheduler/Indexing State Model

- Runtime state is held in singleton scheduler service and surfaced through `GET /api/specs/status`.
- `source_files` provides persisted comparison baseline across restarts.
- Startup flow:
  1. enumerate `specs/**/*.md`
  2. hash all files
  3. compare with `source_files`
  4. apply upsert/delete incrementally
  5. set `lastScanAt` and `lastIndexedAt`
- Steady-state flow:
  - repeat the same compare/apply cycle every 30 seconds.
- Concurrency model:
  - single active job lock; overlapping manual/scheduled requests do not run concurrently.

## Relationships

```text
specs/**/*.md (source of truth)
       |
       v
scheduler.ts
  |- startup reconcile (once)
  |- poll scan (every 30s)
  |- manual reindex trigger
       |
       v
indexer.ts (hash compare + upsert/delete)
       |
       |- source_files (hash baseline)
       |- chunks (content + metadata)
       |- chunks_fts (keyword)
       |- chunks_vec (semantic)

status.get.ts -> IndexStatus (runtime + counts)
UI indicator/button -> status + reindex APIs
```
