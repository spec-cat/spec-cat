# Feature: Worktree Management

## Overview
An interface for managing Git worktrees, enabling parallel development in isolated worktrees. Provides per-worktree status tracking, creation, deletion, and switching.

## Status
**Implemented** - Completed

## Functional Requirements

### FR-001: Worktree List Display
All worktrees must be displayed as cards.
- **FR-001a**: Display worktree name and path
- **FR-001b**: Display the associated branch
- **FR-001c**: Show "main" and "current" badges
- **FR-001d**: Reveal action buttons on hover

### FR-002: Worktree Status
Each worktree's status must be shown with a color-coded badge.
- **FR-002a**: Clean - no changes
- **FR-002b**: Dirty - uncommitted changes present
- **FR-002c**: Ahead - ahead of main branch
- **FR-002d**: Behind - behind main branch
- **FR-002e**: Diverged - diverged from main branch

### FR-003: Worktree Creation
Must be able to create a new worktree.
- **FR-003a**: Auto-generate feature number (next number based on existing branches/specs)
- **FR-003b**: Description input (required)
- **FR-003c**: Short name input (optional; auto-generated if omitted)
- **FR-003d**: Select base branch (default: current HEAD)
- **FR-003e**: Worktree path: `/tmp/{branchName}-{randomId}`
- **FR-003f**: Return 409 error if branch already exists

### FR-004: Worktree Deletion
Must be able to delete a worktree.
- **FR-004a**: Confirmation dialog before deletion
- **FR-004b**: Main worktree cannot be deleted
- **FR-004c**: Optionally delete the associated branch
- **FR-004d**: Fallback to direct filesystem deletion if `git worktree remove` fails
- **FR-004e**: Run `git worktree prune` after deletion

### FR-005: Worktree Switching
Must be able to switch (checkout) to another worktree.

### FR-006: Commit Count Display
Display the number of commits each worktree is ahead of main.

### FR-007: Last Commit Info
Display the last commit info for each worktree.
- Commit hash, message, time

### FR-008: Active Worktree Indication
Visually distinguish the currently active worktree.

## Non-Functional Requirements

### NFR-001: Isolation Guarantee
Work between worktrees must not affect each other.

### NFR-002: Path Safety
Only safe paths are allowed when creating worktrees.

## Technical Implementation

### Components
- `components/worktree/WorktreePanel.vue` - Main worktree panel (list, create, delete, switch)
- `components/worktree/WorktreeCreateModal.vue` - Create modal (form validation, error display)
- `components/worktree/WorktreeStatusBadge.vue` - Color-coded status badge

### Pages
- `pages/worktrees/index.vue` - Worktree list page
### Store
- `stores/worktree.ts` - Worktree state management

### Types
- `types/worktree.ts` - Worktree type definitions

### Server APIs
- `GET /api/worktrees` - Get worktree list (includes status, commit counts)
- `POST /api/worktrees` - Create worktree
- `DELETE /api/worktrees/[name]` - Delete worktree (option: deleteBranch)
- `POST /api/worktrees/[name]/switch` - Switch worktree

## Success Criteria
- [x] Worktree list is correctly displayed as cards
- [x] Worktree status is correctly reflected with color badges
- [x] Worktree create/delete/switch works properly
- [x] Feature number auto-generation works
- [x] Force-remove fallback works
