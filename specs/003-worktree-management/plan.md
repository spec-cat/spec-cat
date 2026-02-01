# Implementation Plan: Worktree Management

**Branch**: `003-worktree-management` | **Date**: 2026-02-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-worktree-management/spec.md`

## Summary

Implement a worktree management interface that enables parallel development in isolated git worktrees. The system provides a card-based worktree list with status badges, creation modal with auto-generated feature numbers, deletion with confirmation, and worktree switching. Server-side APIs wrap `git worktree` commands and provide status information (clean/dirty/ahead/behind/diverged).

## Technical Context

**Language/Version**: TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+)
**Primary Dependencies**: Pinia (v2.2+) for state, Tailwind CSS for styling, @heroicons/vue for icons
**Storage**: Git repository (worktree metadata), filesystem (worktree directories at `/tmp/`)
**Testing**: Manual testing; TypeScript type checking as first line of defense
**Target Platform**: Web browser (desktop primary), server-side Node.js for git worktree operations
**Project Type**: Web application (Nuxt 3 fullstack)
**Performance Goals**: Worktree list load <2s, creation/deletion <5s
**Constraints**: Worktree paths restricted to `/tmp/`; main worktree cannot be deleted
**Scale/Scope**: 3 components, 1 store, 1 type file, 2 pages, 4 server API routes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Nuxt 3 + Vue 3 + TypeScript 5.6+ | PASS | Framework matches constitution |
| Pinia for global state | PASS | `stores/worktree.ts` uses Pinia options API |
| Tailwind CSS only | PASS | All styling via Tailwind + retro-terminal theme |
| @heroicons/vue for icons | PASS | Used in UI elements |
| No external dependencies beyond approved | PASS | Uses only `child_process` for git commands |
| Manual testing only | PASS | No automated tests |
| Simplicity over complexity | PASS | Direct git CLI wrapping, simple card-based UI |
| Server-side via Nitro only | PASS | All git operations in `/server/api/worktrees/` |

## Project Structure

### Documentation (this feature)

```text
specs/003-worktree-management/
├── plan.md              # This file
├── research.md          # Research decisions
├── data-model.md        # Data model definitions
├── quickstart.md        # Implementation quickstart guide
└── tasks.md             # Task breakdown
```

### Source Code (repository root)

```text
# Pages
pages/worktrees/
├── index.vue                            # Worktree list page (renders WorktreePanel)
└── [name].vue                           # Worktree detail page (commits, squash, cherry-pick)

# Components
components/worktree/
├── WorktreePanel.vue                    # Main worktree panel (list, create, delete, switch)
├── WorktreeCreateModal.vue              # Creation modal (form validation, auto-numbering)
└── WorktreeStatusBadge.vue              # Color-coded status badge (clean/dirty/ahead/behind/diverged)

# Store
stores/
└── worktree.ts                          # Worktree state (list, CRUD operations, working directory)

# Types
types/
└── worktree.ts                          # Worktree, WorktreeStatus, API request/response types

# Server API routes
server/api/worktrees/
├── index.get.ts                         # GET /api/worktrees - List all worktrees with status
├── index.post.ts                        # POST /api/worktrees - Create new worktree
├── [name].delete.ts                     # DELETE /api/worktrees/:name - Delete worktree
└── [name]/
    └── switch.post.ts                   # POST /api/worktrees/:name/switch - Switch to worktree
```

**Structure Decision**: Nuxt 3 convention with dynamic route pages. Worktree API routes use RESTful patterns. The store uses Pinia options API (different from gitGraph which uses composition API) for simpler CRUD operations.

## FR Coverage Matrix

| FR | Description | Implementation Files |
|----|-------------|---------------------|
| FR-001a | Worktree name and path display | `components/worktree/WorktreePanel.vue` (card layout with name, path) |
| FR-001b | Connected branch display | `components/worktree/WorktreePanel.vue` (branch name on card) |
| FR-001c | Main and current badges | `components/worktree/WorktreePanel.vue` (isMain, isCurrent conditional badges) |
| FR-001d | Hover action buttons | `components/worktree/WorktreePanel.vue` (delete/switch buttons on hover) |
| FR-002a | Clean status badge | `components/worktree/WorktreeStatusBadge.vue` (green badge), `server/api/worktrees/index.get.ts` (getWorktreeStatus) |
| FR-002b | Dirty status badge | `components/worktree/WorktreeStatusBadge.vue` (yellow badge), `server/api/worktrees/index.get.ts` (git status --porcelain check) |
| FR-002c | Ahead status badge | `components/worktree/WorktreeStatusBadge.vue` (cyan badge), `server/api/worktrees/index.get.ts` (rev-list --left-right --count) |
| FR-002d | Behind status badge | `components/worktree/WorktreeStatusBadge.vue` (orange badge), `server/api/worktrees/index.get.ts` |
| FR-002e | Diverged status badge | `components/worktree/WorktreeStatusBadge.vue` (red badge), `server/api/worktrees/index.get.ts` |
| FR-003a | Auto feature number generation | `server/api/worktrees/index.post.ts` (getNextFeatureNumber from branches + specs) |
| FR-003b | Description input (required) | `components/worktree/WorktreeCreateModal.vue` (form validation) |
| FR-003c | Short name input (optional, auto-gen) | `components/worktree/WorktreeCreateModal.vue` (optional field) |
| FR-003d | Base branch selection | `components/worktree/WorktreeCreateModal.vue` (baseBranch field, default: current HEAD) |
| FR-003e | Worktree path pattern | `server/api/worktrees/index.post.ts` (`/tmp/{branchName}-{randomId}`) |
| FR-003f | Branch exists 409 error | `server/api/worktrees/index.post.ts` (checkBranchExists before creation) |
| FR-004a | Delete confirmation dialog | `components/worktree/WorktreePanel.vue` (confirm before delete) |
| FR-004b | Main worktree undeletable | `stores/worktree.ts` (check isMain), `server/api/worktrees/[name].delete.ts` |
| FR-004c | Optional branch deletion | `stores/worktree.ts` (deleteBranch parameter), `server/api/worktrees/[name].delete.ts` |
| FR-004d | Force-remove fallback | `server/api/worktrees/[name].delete.ts` (filesystem direct delete on git worktree remove failure) |
| FR-004e | Post-delete prune | `server/api/worktrees/[name].delete.ts` (git worktree prune after deletion) |
| FR-005 | Worktree switching | `stores/worktree.ts` (switchWorktree), `server/api/worktrees/[name]/switch.post.ts` |
| FR-006 | Commit count display | `components/worktree/WorktreePanel.vue` (commitCount), `server/api/worktrees/index.get.ts` (getCommitCount) |
| FR-007 | Last commit info | `components/worktree/WorktreePanel.vue` (lastCommit hash, message, time), `server/api/worktrees/index.get.ts` (getLastCommit) |
| FR-008 | Active worktree indication | `components/worktree/WorktreePanel.vue` (isCurrent highlight styling) |

## Complexity Tracking

No constitution violations. All implementations use approved dependencies and standard git worktree commands.
