# Data Model: Worktree Management

**Feature**: 003-worktree-management
**Date**: 2026-02-01

## Core Entities

### Worktree

Represents a git worktree with its metadata and status.

```typescript
interface Worktree {
  name: string           // e.g., "001-app-layout"
  path: string           // Full filesystem path to worktree
  branch: string         // Current branch name
  isMain: boolean        // Is this the main worktree
  isCurrent: boolean     // Is this the active worktree
  isLocked: boolean      // Is the worktree locked
  status: WorktreeStatus
  commitCount: number    // Commits ahead of main
  lastCommit?: {
    hash: string
    shortHash: string
    message: string
    author: string
    date: string         // Relative date (e.g., "2 hours ago")
  }
}
```

**Validation Rules**:
- `name` derived from branch name or directory basename
- `path` must be a valid filesystem path
- `commitCount` is 0 for the main worktree
- `isMain` is true for the first worktree in git's list (the original clone)

### WorktreeStatus

```typescript
type WorktreeStatus = 'clean' | 'dirty' | 'ahead' | 'behind' | 'diverged'
```

**Status Determination**:
- `clean`: No uncommitted changes, not ahead/behind main
- `dirty`: Has uncommitted changes (git status --porcelain returns output)
- `ahead`: Commits ahead of main but not behind
- `behind`: Commits behind main but not ahead
- `diverged`: Both ahead and behind main

**Status Badge Colors** (retro-terminal theme):
- clean: `text-retro-green`
- dirty: `text-retro-yellow`
- ahead: `text-retro-cyan`
- behind: `text-retro-orange`
- diverged: `text-retro-red`

## API Request/Response Types

### WorktreeListResponse

```typescript
interface WorktreeListResponse {
  worktrees: Worktree[]
  currentBranch: string    // Currently checked-out branch
  mainWorktree: string     // Path to main worktree
}
```

### WorktreeCreateRequest

```typescript
interface WorktreeCreateRequest {
  description: string      // Required: feature description
  shortName?: string       // Optional: short name (auto-generated if omitted)
  baseBranch?: string      // Optional: base branch (default: current HEAD)
}
```

**Created Worktree Path Pattern**: `/tmp/{branchName}-{randomId}`

**Branch Name Pattern**: `{featureNumber}-{shortName}` where `featureNumber` is auto-incremented (e.g., `009-new-feature`)

### WorktreeCreateResponse

```typescript
interface WorktreeCreateResponse {
  success: boolean
  worktree?: Worktree      // Created worktree (on success)
  error?: string           // Error message (on failure)
}
```

### WorktreeDeleteResponse

```typescript
interface WorktreeDeleteResponse {
  success: boolean
  error?: string
}
```

**Delete Query Parameters**:
- `workingDirectory`: Base project directory
- `deleteBranch`: "true"/"false" - also delete the associated branch

### WorktreeSwitchResponse

```typescript
interface WorktreeSwitchResponse {
  success: boolean
  worktree?: Worktree
  error?: string
}
```

## State Management (Pinia Store)

### WorktreeState

```typescript
interface WorktreeState {
  worktrees: Worktree[]
  currentBranch: string
  mainWorktree: string
  workingDirectory: string   // Initialized from /api/cwd
  loading: boolean
  error: string | null
}
```

**Getters**:
- `activeWorktree`: Currently active worktree (isCurrent === true)
- `featureWorktrees`: All non-main worktrees
- `mainWorktreeInfo`: The main worktree
- `hasWorktrees`: Whether there are any feature worktrees
- `dirtyWorktrees`: Worktrees with uncommitted changes

**Actions**:
- `initialize()`: Fetch working directory from `/api/cwd`
- `fetchWorktrees()`: Load all worktrees with status
- `createWorktree(request)`: Create new worktree, push to local array on success
- `deleteWorktree(name, deleteBranch)`: Delete worktree, remove from local array on success
- `switchWorktree(name)`: Switch to worktree, update isCurrent flags locally

## State Transitions

### Worktree Lifecycle

```
[Not Exists] --create--> [Active/Clean] --modify files--> [Dirty]
[Dirty] --commit--> [Ahead] --push--> [Clean]
[Clean/Ahead/Dirty] --delete--> [Not Exists]
[Any] --switch--> [Current] (updates isCurrent on all worktrees)
```

### Status State Machine

```
       ┌─────────────────────────────────────────────┐
       │                 clean                         │
       │  (no uncommitted changes, synced with main)   │
       └────────┬──────────┬──────────┬───────────────┘
                │          │          │
    modify files│   commit │  main    │ both
                │          │  advances│
                v          v          v
            ┌──────┐  ┌──────┐  ┌─────────┐
            │dirty │  │ahead │  │ behind  │
            └──────┘  └──────┘  └─────────┘
                                     │
                              ahead + behind
                                     │
                                     v
                              ┌──────────┐
                              │ diverged │
                              └──────────┘
```

## Server-Side Data Flow

### GET /api/worktrees

1. Parse `git worktree list --porcelain` for raw worktree data
2. For each worktree, run in parallel:
   - `git status --porcelain` for dirty detection
   - `git rev-list --left-right --count HEAD...main` for ahead/behind
   - `git log -1 --format="..."` for last commit info
   - `git rev-list --count HEAD ^main` for commit count
3. Assemble `Worktree` objects with computed status
4. Return sorted list with metadata

### POST /api/worktrees

1. Determine next feature number (scan branches + specs)
2. Generate branch name: `{number}-{shortName}`
3. Check branch does not exist (409 if exists)
4. Get base branch (or current HEAD)
5. Generate worktree path: `/tmp/{branchName}-{randomId}`
6. Execute `git worktree add -b {branchName} {path} {baseBranch}`
7. Return created worktree info

### DELETE /api/worktrees/:name

1. Find worktree by name
2. Try `git worktree remove {path}`
3. If fails, fall back to `rm -rf {path}`
4. Run `git worktree prune`
5. Optionally delete branch: `git branch -D {name}`
