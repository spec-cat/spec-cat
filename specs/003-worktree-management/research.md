# Research: Worktree Management

**Feature**: 003-worktree-management
**Date**: 2026-02-01
**Status**: Phase 0 Complete

## Overview

This document captures research decisions for the Worktree Management feature. All technical choices are pre-determined by the project constitution, so this research focuses on implementation patterns within those constraints.

## Research Topics

### 1. Git Worktree Command Interface

**Decision**: Server-side `git worktree` command execution via `child_process`. Parse `git worktree list --porcelain` for structured output.

**Rationale**:
- `--porcelain` format provides machine-readable output with fields: worktree path, HEAD hash, branch ref, locked/prunable status
- Each worktree block is separated by blank lines, making parsing straightforward
- Matches the pattern established in 002-git-graph for git CLI wrapping
- Constitution principle VI (Simplicity) - no external git libraries

**Alternatives Considered**:
- Plain `git worktree list`: Human-readable but harder to parse reliably
- Reading `.git/worktrees/` directory directly: Fragile, format may change between git versions

### 2. Worktree Path Strategy

**Decision**: Create worktrees in `/tmp/{branchName}-{randomId}`.

**Rationale**:
- Temporary directory keeps worktrees isolated from main project
- Random ID suffix prevents name collisions when recreating worktrees
- Pattern is predictable for cleanup and administration
- `/tmp` is always writable and expected to be ephemeral

**Alternatives Considered**:
- Sibling directory to project root: Pollutes parent directory
- Inside project `.git/` directory: Not supported by git worktree
- User-configurable path: Adds complexity without clear benefit

### 3. Worktree Status Detection

**Decision**: Three-step status check per worktree: (1) `git status --porcelain` for dirty detection, (2) `git rev-list --left-right --count HEAD...main` for ahead/behind detection.

**Rationale**:
- Status check determines: clean, dirty (uncommitted changes), ahead, behind, or diverged
- Uses standard git commands available on all platforms
- Fallback chain tries `origin/main` then `main` for comparison base
- Parallel execution via `Promise.all` for all worktrees

**Alternatives Considered**:
- Single combined check: Not possible with standard git commands
- Skip status for faster loading: Status is a core feature requirement

### 4. Feature Number Auto-Generation

**Decision**: Scan existing branch names and specs directory for `NNN-` prefix pattern, use next sequential number.

**Rationale**:
- Feature branches follow `NNN-feature-name` convention
- Scanning both branches and specs directories ensures no conflicts
- Simple increment from max found number
- Falls back to `001` if no existing features

**Alternatives Considered**:
- UUID-based naming: Not human-readable, breaks convention
- User-specified only: Error-prone, may conflict with existing features
- Database sequence: No database in this project (constitution constraint)

### 5. Worktree Deletion Strategy

**Decision**: Try `git worktree remove` first, fall back to filesystem deletion (`rm -rf`) if git command fails. Always run `git worktree prune` after deletion.

**Rationale**:
- `git worktree remove` is the proper way but can fail if worktree has uncommitted changes
- Filesystem fallback ensures cleanup even in edge cases
- `git worktree prune` cleans up stale worktree references
- Optional `deleteBranch` parameter also removes the associated branch

**Alternatives Considered**:
- Force-only deletion: Risky, may lose uncommitted work without warning
- Git worktree remove with `--force`: Possible but filesystem fallback is safer
- No fallback: Would leave broken worktree references

### 6. State Management Pattern

**Decision**: Pinia options API store with CRUD actions that update local state after successful API calls.

**Rationale**:
- Options API is simpler for straightforward CRUD operations
- Optimistic delete (remove from local array on success)
- Optimistic create (push to local array on success)
- Working directory initialization via `/api/cwd` endpoint
- Error handling with `this.error` state field

**Alternatives Considered**:
- Composition API store: Workable but options API is more concise for CRUD
- Direct API calls without store: Would lose centralized state management

### 7. Component Architecture

**Decision**: Three components - WorktreePanel (main view), WorktreeCreateModal (creation form), WorktreeStatusBadge (reusable badge).

**Rationale**:
- WorktreePanel handles the full list view with cards, actions, and state
- Modal separation keeps the create form isolated and testable
- StatusBadge is reused across list items (single responsibility principle)
- Constitution principle VI (Simplicity) - minimal component count

**Alternatives Considered**:
- Single monolithic component: Too complex, hard to maintain
- Per-card component: Adds indirection without clear benefit (cards are simple)

## Summary

All decisions align with constitution constraints. The implementation uses standard git worktree commands via `child_process`, with no external dependencies beyond those already approved. The architecture prioritizes simplicity with a small component count and straightforward CRUD patterns.
