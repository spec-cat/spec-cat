# Tasks: Project Source File Explorer Modal

**Input**: Design documents from `/specs/001-source-file-explorer/`
**Prerequisites**: spec.md, plan.md
**Feature Branch**: `001-source-file-explorer`

**Tests**: Manual testing only (no automated tests explicitly required by spec).

## Phase 1: Setup

- [ ] T001 [P] Define source explorer interfaces (`FileNode`, `FileContentResponse`, error codes) in `types/sourceExplorer.ts` [FR-002, FR-004, FR-006]
- [ ] T002 [P] Add modal open/close state and actions for source explorer in `stores/layout.ts` [FR-001]

## Phase 2: Foundational API (Blocking)

- [ ] T003 Implement project-root-safe path resolver and traversal helpers in `server/utils/projectDir.ts` (or dedicated helper) [FR-002, FR-006]
- [ ] T004 Implement `GET /api/project/tree` endpoint in `server/api/project/tree.get.ts` with hidden/binary filtering and stable sorting [FR-002, FR-007]
- [ ] T005 Implement `GET /api/project/file` endpoint in `server/api/project/file.get.ts` with size limit, read errors, and unsupported/binary detection [FR-004, FR-005, FR-006, FR-007]

## Phase 3: User Story 1 - Open Explorer Modal (P1)

**Goal**: User can open/close a dedicated source explorer modal with left/right pane layout.

**Independent Test**: Open modal from app UI, verify split layout renders, close returns to previous screen.

- [ ] T006 [US1] Create modal shell with split layout and close behaviors in `components/project/SourceExplorerModal.vue` [FR-001]
- [ ] T007 [US1] Wire modal visibility to layout store actions in `components/project/SourceExplorerModal.vue` and invocation point(s) [FR-001]
- [ ] T008 [US1] Add tree/content loading state placeholders to modal shell in `components/project/SourceExplorerModal.vue` [FR-007]

## Phase 4: User Story 2 - Browse File Tree (P2)

**Goal**: User can expand/collapse folders and navigate project structure.

**Independent Test**: Expand/collapse nested folders and verify visible items update correctly.

- [ ] T009 [P] [US2] Implement source explorer state composable (`tree`, `expandedPaths`, `selectedPath`, loading/error) in `composables/useSourceExplorer.ts` [FR-002, FR-003, FR-007]
- [ ] T010 [US2] Implement recursive file tree component with expand/collapse interactions in `components/project/SourceTree.vue` [FR-002, FR-003]
- [ ] T011 [US2] Connect tree API fetch to modal init and refresh handling in `components/project/SourceExplorerModal.vue` [FR-002, FR-007]

## Phase 5: User Story 3 - Read File Contents (P3)

**Goal**: User selects a file and reads content in right pane.

**Independent Test**: Click known text files and verify pane updates; switch between files.

- [ ] T012 [P] [US3] Implement read-only viewer component with empty/loading/error states in `components/project/SourceViewer.vue` [FR-005, FR-006, FR-007]
- [ ] T013 [US3] Wire file selection from `SourceTree` to content fetch in `composables/useSourceExplorer.ts` [FR-004, FR-007]
- [ ] T014 [US3] Render file content safely (escaped/plain preformatted view) in `components/project/SourceViewer.vue` [FR-005]
- [ ] T015 [US3] Show clear user messages for unsupported, oversized, missing, or unreadable files in `components/project/SourceViewer.vue` [FR-006]

## Phase 6: Polish

- [ ] T016 [P] Guard edge case when project has no readable files (empty tree state) in `components/project/SourceExplorerModal.vue` [FR-006, FR-007]
- [ ] T017 [P] Verify path traversal protections (`..`, absolute paths) in `server/api/project/tree.get.ts` and `server/api/project/file.get.ts` [FR-006]
- [ ] T018 Run manual acceptance checks against all scenarios and edge cases in `specs/001-source-file-explorer/spec.md` [FR-001..FR-007]

## Dependencies & Parallel Opportunities

- Setup tasks `T001`, `T002` can run in parallel.
- API tasks `T004` and `T005` share helpers (`T003`) and then can proceed in parallel.
- UI tasks `T009` and `T012` can run in parallel after foundational API is ready.
- Story order for delivery: US1 -> US2 -> US3.
