# Tasks: Spec Vector Search

**Input**: Design documents from `/specs/008-spec-search/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md
**Feature Branch**: `008-spec-search`

**Tests**: Manual testing + `pnpm typecheck`

## Phase 1: Setup

- [X] T001 [P] Add domain types (`SpecChunk`, `SourceFile`, `SearchResult`, `SearchRequest/Response`, `IndexStatus`, `ReindexResponse`, runtime state fields) in `types/specSearch.ts` [FR-010, FR-013b, FR-015]
- [X] T002 [P] Add spec search module barrel in `server/utils/specSearch/index.ts` [FR-002..FR-017]
- [ ] T003 [P] Install dependencies (`better-sqlite3`, `sqlite-vec`, `@xenova/transformers`, `@types/better-sqlite3`) in `package.json`/lockfile [FR-003, FR-005]

## Phase 2: Foundation

- [X] T004 Implement DB singleton and base schema (`source_files`, `chunks`, indexes) in `server/utils/specSearch/database.ts` [FR-002, FR-007]
- [X] T005 Implement FTS5 virtual table + keyword query in `server/utils/specSearch/database.ts` [FR-004]
- [X] T006 [P] Implement sqlite-vec bootstrap and availability detection in `server/utils/specSearch/database.ts` [FR-003, FR-013]
- [X] T007 [P] Implement markdown chunker (H3/H2 split, oversized split, FR/T extraction) in `server/utils/specSearch/chunker.ts` [FR-001, FR-001a, FR-001b]
- [X] T008 Implement indexer core (`reindexAll`, `reindexFile`, `deleteFileChunks`) with SHA-256 skip logic in `server/utils/specSearch/indexer.ts` [FR-007, FR-007a, FR-011a]

## Phase 3: User Story 1 - Keyword Search (P1)

- [X] T009 [US1] Implement `GET /api/specs/search` keyword mode in `server/api/specs/search.get.ts` [FR-004, FR-010]
- [X] T010 [US1] Add feature/file-type filters to search API + SQL clauses [FR-009]
- [X] T011 [US1] Add timing/total metadata in search response [FR-010]

## Phase 4: User Story 2 - Semantic/Hybrid Search (P1)

- [X] T012 [P] [US2] Implement lazy embedding loader/inference in `server/utils/specSearch/embeddings.ts` [FR-012]
- [X] T013 [US2] Implement vector KNN query in `server/utils/specSearch/database.ts` [FR-005]
- [X] T014 [US2] Implement hybrid RRF merge with dedup in `server/utils/specSearch/database.ts` [FR-006]
- [X] T015 [US2] Extend search API for `semantic|hybrid` + degraded fallback warnings [FR-013, FR-013a, FR-013b]

## Phase 5: User Story 3 - Resilient Auto Indexing (P2)

- [X] T016 [P] [US3] Implement scheduler service in `server/utils/specSearch/scheduler.ts` with 30-second polling and job lock [FR-008b, FR-008c]
- [X] T017 [US3] Implement startup reconciliation (new/changed/deleted detection against `source_files`) in `server/utils/specSearch/scheduler.ts` + `indexer.ts` [FR-008, FR-008a]
- [X] T018 [US3] Wire scheduler startup in server plugin/init path and ensure graceful shutdown cleanup [FR-008, FR-008b]

## Phase 6: User Story 4 - Visibility + Manual Reindex (P2)

- [X] T019 [P] [US4] Implement `POST /api/specs/reindex` with overlap protection (`already indexing`) in `server/api/specs/reindex.post.ts` [FR-008c, FR-011a]
- [X] T020 [P] [US4] Implement `GET /api/specs/status` runtime fields (`isIndexing`, `currentJob`, `lastScanAt`, `schedulerActive`, `pollIntervalSeconds`) in `server/api/specs/status.get.ts` [FR-015]
- [X] T021 [US4] Add indexing indicator UI bound to status API in `components/settings/SettingsModal.vue` (or equivalent visible panel) [FR-016]
- [X] T022 [US4] Add manual "Reindex Specs" button that calls reindex API and shows completion/error state [FR-017]

## Phase 7: User Story 5 - Pipeline Integration (P2)

- [X] T023 [P] [US5] Implement context formatter/helper in `server/utils/specSearch/contextInjector.ts` [FR-014]
- [X] T024 [US5] Integrate context lookup into implement pipeline entry route [FR-014]
- [X] T025 [US5] Add no-index/no-result fallback behavior without blocking pipeline [FR-014, FR-013]

## Phase 8: Reliability and Validation

- [X] T026 [P] Add DB missing/corruption recovery path in utility layers [FR-011, FR-011a, FR-013]
- [ ] T027 Validate restart reconciliation flow (offline edit while app down) and document measured timings in `specs/008-spec-search/quickstart.md` [SC-004, SC-009]
- [ ] T028 Run `pnpm typecheck` and manual endpoint/UI checks; adjust edge-case handling [FR-001..FR-017]

## Dependencies & Parallelism

- Parallel group A: `T001`, `T002`, `T003`.
- Parallel group B (after `T004`): `T006`, `T007`.
- Parallel group C (after `T009`): `T012`, `T016`.
- Parallel group D: `T019`, `T020`.
- Story order: US1 -> US2 -> US3 -> US4 -> US5.
