# Quickstart: Worktree Management

**Feature**: 003-worktree-management
**Date**: 2026-02-01

## Prerequisites

- Node.js 18+ with pnpm package manager
- Git repository with worktree support (git 2.15+)
- Existing Nuxt 3 project with Tailwind CSS and Pinia configured
- Write access to `/tmp/` directory

## Quick Implementation Checklist

### 1. Create Type Definitions

```bash
touch types/worktree.ts
```

Define: `WorktreeStatus`, `Worktree`, `WorktreeListResponse`, `WorktreeCreateRequest`, `WorktreeCreateResponse`, `WorktreeDeleteResponse`, `WorktreeSwitchResponse`. See data-model.md for complete definitions.

### 2. Create Server API Routes

```bash
mkdir -p server/api/worktrees server/api/worktrees/[name]
touch server/api/worktrees/index.get.ts
touch server/api/worktrees/index.post.ts
touch server/api/worktrees/[name].delete.ts
touch server/api/worktrees/[name]/switch.post.ts
```

Key implementations:
- `GET /api/worktrees`: Parse `git worktree list --porcelain`, enrich with status (git status, rev-list), last commit, commit count
- `POST /api/worktrees`: Auto-generate feature number, create worktree at `/tmp/{name}-{randomId}`
- `DELETE /api/worktrees/:name`: Try `git worktree remove`, fallback to `rm -rf`, then `git worktree prune`
- `POST /api/worktrees/:name/switch`: Switch active worktree

### 3. Create Pinia Store

```bash
touch stores/worktree.ts
```

Implement with options API:
- State: worktrees array, currentBranch, mainWorktree, workingDirectory, loading, error
- Getters: activeWorktree, featureWorktrees, mainWorktreeInfo, hasWorktrees, dirtyWorktrees
- Actions: initialize (fetch cwd), fetchWorktrees, createWorktree, deleteWorktree, switchWorktree

### 4. Create Components

```bash
mkdir -p components/worktree
touch components/worktree/WorktreePanel.vue
touch components/worktree/WorktreeCreateModal.vue
touch components/worktree/WorktreeStatusBadge.vue
```

- **WorktreePanel**: Full card-based list with create button, delete/switch actions per card
- **WorktreeCreateModal**: Form with description (required), shortName (optional), baseBranch (optional)
- **WorktreeStatusBadge**: Color-coded badge component accepting `WorktreeStatus` prop

### 5. Create Pages

```bash
mkdir -p pages/worktrees
touch pages/worktrees/index.vue
```

- `index.vue`: Simple page that renders `<WorktreePanel />`

## Verification Steps

1. **List loads**: Navigate to `/worktrees`, see all worktrees as cards
2. **Status badges**: Each card shows correct status (clean/dirty/ahead/behind/diverged)
3. **Main badge**: Main worktree has "main" badge, active worktree has "current" badge
4. **Create worktree**: Click create, fill description, feature number auto-generated
5. **Branch exists error**: Try creating with existing branch name, see 409 error
6. **Delete worktree**: Click delete, confirm dialog, worktree removed
7. **Delete with branch**: Check "delete branch" option, both worktree and branch removed
8. **Main undeletable**: Main worktree delete button disabled or hidden
9. **Switch worktree**: Click switch, isCurrent updates
10. **Commit count**: Feature worktrees show commits ahead of main
11. **Last commit**: Each card shows last commit hash, message, and relative time
12. **Detail page**: Click card, navigate to `/worktrees/[name]` with commit history

## Key Files Summary

| File | Purpose | FR Coverage |
|------|---------|-------------|
| types/worktree.ts | Type definitions | - |
| stores/worktree.ts | Worktree CRUD state | FR-001 to FR-009 |
| components/worktree/WorktreePanel.vue | Main list view | FR-001, FR-004, FR-005, FR-006, FR-007, FR-008 |
| components/worktree/WorktreeCreateModal.vue | Creation form | FR-003 |
| components/worktree/WorktreeStatusBadge.vue | Status badge | FR-002 |
| server/api/worktrees/index.get.ts | List API | FR-001, FR-002, FR-006, FR-007 |
| server/api/worktrees/index.post.ts | Create API | FR-003 |
| server/api/worktrees/[name].delete.ts | Delete API | FR-004 |
| server/api/worktrees/[name]/switch.post.ts | Switch API | FR-005 |
| pages/worktrees/index.vue | List page | - |
| pages/worktrees/[name].vue | Detail page | FR-009 |

## Common Issues

**Worktree creation fails**: Ensure `/tmp/` directory exists and is writable.

**Status shows clean when dirty**: `git status --porcelain` runs in the worktree's `cwd`, not the main project.

**Branch already exists (409)**: Feature number collisions can occur if branches were manually created. The auto-numbering scans both branches and specs directories.

**Delete fails silently**: If `git worktree remove` fails, the filesystem fallback (`rm -rf`) handles cleanup. `git worktree prune` always runs after.

**Working directory not initialized**: The store calls `/api/cwd` on `initialize()`. Ensure this is called before any other action.
