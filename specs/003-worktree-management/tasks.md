# Tasks: Worktree Management

**Input**: Design documents from `/specs/003-worktree-management/`
**Prerequisites**: plan.md, spec.md, data-model.md, research.md, quickstart.md

**Tests**: Manual testing only (per plan.md) - no automated test tasks included.

**Organization**: Tasks are grouped by phase and FR to enable traceability.

## Format: `[ID] [P?] [FR-XXX] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[FR-XXX]**: Which functional requirement this task satisfies
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md structure (Nuxt 3 web application):

```text
components/worktree/   # Worktree components
pages/worktrees/       # Worktree pages
stores/                # Pinia stores
types/                 # TypeScript definitions
server/api/worktrees/  # Server API routes
server/utils/          # Server utilities
```

---

## Phase 1: Setup (Types & Store)

**Purpose**: Type definitions and state management foundation

- [x] T001 [P] [FR-001] Define TypeScript types in `types/worktree.ts` (Worktree, WorktreeStatus, API request/response types)
- [x] T002 [P] [FR-001] Create Pinia worktree store in `stores/worktree.ts` with state, getters, and CRUD actions

---

## Phase 2: Server API Routes

**Purpose**: Backend API for git worktree operations

- [x] T003 [P] [FR-001, FR-002, FR-006, FR-007, FR-008] Implement `GET /api/worktrees` in `server/api/worktrees/index.get.ts` — parse `git worktree list --porcelain`, compute status (clean/dirty/ahead/behind/diverged), commit count, last commit info, and current worktree identification
- [x] T004 [P] [FR-003] Implement `POST /api/worktrees` in `server/api/worktrees/index.post.ts` — auto-generate feature number (FR-003a), require description (FR-003b), optional shortName (FR-003c), baseBranch selection (FR-003d), path pattern `/tmp/{branchName}-{randomId}` (FR-003e), 409 on existing branch (FR-003f)
- [x] T005 [P] [FR-004] Implement `DELETE /api/worktrees/:name` in `server/api/worktrees/[name].delete.ts` — optional branch deletion (FR-004c), force-remove fallback with filesystem direct delete (FR-004d), post-delete `git worktree prune` (FR-004e)
- [x] T006 [P] [FR-005] Implement `POST /api/worktrees/:name/switch` in `server/api/worktrees/[name]/switch.post.ts` — checkout branch, return updated worktree status

---

## Phase 3: Server Utilities

**Purpose**: Security and helper utilities

- [x] T007 [P] [NFR-002] Create `server/utils/validateWorktree.ts` — path validation ensuring `/tmp/` prefix, path traversal prevention
- [x] T008 [P] [FR-005] Create `server/utils/worktreeResolver.ts` — worktree resolution for feature-based pipeline execution

---

## Phase 4: Components

**Purpose**: UI components for worktree management

- [x] T009 [FR-002] Create `components/worktree/WorktreeStatusBadge.vue` — color-coded status badges: clean (green), dirty (yellow), ahead (cyan), behind (orange), diverged (red)
- [x] T010 [FR-003] Create `components/worktree/WorktreeCreateModal.vue` — modal with description input (required), optional shortName, form validation, error display, ESC to close
- [x] T011 [FR-001, FR-004, FR-005, FR-006, FR-007, FR-008] Create `components/worktree/WorktreePanel.vue` — card-based worktree list with name/path/branch display (FR-001a/b), main/current badges (FR-001c), hover action buttons for delete/switch (FR-001d), commit count (FR-006), last commit info (FR-007), active worktree highlighting (FR-008), delete confirmation dialog (FR-004a), main worktree protection (FR-004b)

---

## Phase 5: Pages

**Purpose**: Route pages for worktree list and detail views

- [x] T012 [P] [FR-001] Create `pages/worktrees/index.vue` — renders WorktreePanel component
- [x] T013 [P] [FR-009] Create `pages/worktrees/[name].vue` — worktree detail page with commit list (FR-009a)

---

## FR Coverage Verification

| FR | Tasks | Status |
|----|-------|--------|
| FR-001 (Worktree List Display) | T001, T002, T003, T011, T012 | Done |
| FR-002 (Worktree Status) | T003, T009 | Done |
| FR-003 (Worktree Creation) | T004, T010 | Done |
| FR-004 (Worktree Deletion) | T005, T011 | Done |
| FR-005 (Worktree Switching) | T006, T008 | Done |
| FR-006 (Commit Count Display) | T003, T011 | Done |
| FR-007 (Last Commit Info) | T003, T011 | Done |
| FR-008 (Active Worktree Indication) | T003, T011 | Done |
| FR-009 (Worktree Detail Page) | T013 | Done |
| NFR-001 (Isolation Guarantee) | T015 | Done |
| NFR-002 (Path Safety) | T007 | Done |
| NFR-003 (Performance Requirements) | T003, T004, T005 | Done |

## FR Traceability Addendum (2026-02-14)

- [x] T014 [Traceability] Expand worktree list/status sub-requirement mapping in task matrix [FR-001b, FR-002a, FR-002b, FR-002c, FR-002d, FR-002e]
- [x] T015 [NFR-001] Verify worktree isolation by ensuring all git operations use `-C {worktreePath}` flag or proper cwd parameter in server APIs

## Success Criteria Verification

- [x] Worktree list is correctly displayed as cards
- [x] Worktree status is correctly reflected with color badges
- [x] Worktree create/delete/switch works properly
- [x] Feature number auto-generation works
- [x] Force-remove fallback works
- [x] Main worktree cannot be deleted
- [x] Worktree detail page shows commit history
- [x] Worktree isolation is maintained (NFR-001)
- [x] Path safety is enforced (NFR-002)
- [x] Performance meets requirements (NFR-003)
