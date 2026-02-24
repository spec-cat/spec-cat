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

### FR-009: Worktree Detail Page
Must be able to view worktree details.
- **FR-009a**: Display commit history for the worktree branch

## Non-Functional Requirements

### NFR-001: Isolation Guarantee
Work between worktrees must not affect each other.

### NFR-002: Path Safety
Only safe paths are allowed when creating worktrees.

### NFR-003: Performance Requirements
- **NFR-003a**: Worktree list must load within 2 seconds for up to 20 worktrees
- **NFR-003b**: Worktree creation/deletion operations must complete within 5 seconds

## Success Criteria

- Worktree list displays all worktrees as cards with correct information
- Status badges accurately reflect worktree state (clean/dirty/ahead/behind/diverged)
- Create, delete, and switch operations complete successfully
- Feature number auto-generation produces sequential numbers without conflicts
- Force-remove fallback handles edge cases when standard removal fails
- Main worktree cannot be deleted
- Worktree detail page shows complete commit history
- Work between worktrees remains isolated (no cross-contamination)
- Only safe paths under /tmp/ are allowed for worktree creation
- Worktree list loads within 2 seconds for up to 20 worktrees
- Creation and deletion operations complete within 5 seconds
