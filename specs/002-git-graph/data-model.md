# Data Model: Git Graph Visualization (Redesign)

**Feature**: 002-git-graph
**Date**: 2026-02-08
**Spec Reference**: FR-001 to FR-086

## Core Entities

### Commit (GitLogCommit)

Primary commit type used throughout the client. Populated by `/api/git/log`.

```typescript
interface GitLogCommit {
  hash: string           // Full SHA-1 hash (40 chars)
  shortHash: string      // Abbreviated hash (7 chars)
  author: string         // Author name
  email: string          // Author email
  timestamp: number      // Unix timestamp
  message: string        // Commit subject (first line)
  body?: string          // Full commit message body
  parents: string[]      // Parent commit hashes
  branches: string[]     // Branch names pointing to this commit
  tags: string[]         // Tag names pointing to this commit
  isHead?: boolean       // Current HEAD
  isMerge?: boolean      // Has 2+ parents
  signatureStatus?: 'good' | 'bad' | 'unknown' | 'none' // GPG status (FR-086)
}
```

### Branch (GitBranch)

```typescript
interface GitBranch {
  name: string             // e.g., "main", "feature/auth"
  ref: string              // e.g., "refs/heads/main"
  tip: string              // Hash of tip commit
  upstream?: { remote: string; branch: string } // Remote tracking
  ahead: number            // Commits ahead of upstream
  behind: number           // Commits behind upstream
  color: string            // Hex color from palette
  isHead: boolean          // Current branch
  isRemote: boolean        // Remote tracking branch
  lastCommitDate: string   // ISO 8601
}
```

### Tag

```typescript
interface GitTag {
  name: string
  hash: string             // Commit hash this tag points to
  isAnnotated: boolean
  tagger?: { name: string; email: string; date: string }
  message?: string         // Annotated tag message
}
```

### Stash (NEW — FR-045 to FR-051)

```typescript
interface GitStash {
  hash: string             // Stash commit hash
  index: number            // stash@{index}
  message: string          // Stash message
  date: string             // ISO 8601
  branchName: string       // Branch stash was created on
}
```

### FileChange

```typescript
interface FileChange {
  path: string
  oldPath?: string         // For renames (FR-016, FR-056)
  status: FileChangeStatus // A, M, D, R, C, U
  additions: number
  deletions: number
  binary: boolean
}

type FileChangeStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'U'
```

### GitStatusFile

```typescript
interface GitStatusFile {
  path: string
  oldPath?: string
  status: FileChangeStatus
  staged: boolean
  unstaged: boolean
}
```

### Remote (FR-074 to FR-076)

```typescript
interface GitRemote {
  name: string             // e.g., "origin"
  fetchUrl: string
  pushUrl: string
}
```

### RepositoryState (Change Detection)

```typescript
interface RepositoryState {
  headCommit: string
  branchListHash: string
  uncommittedFileCount: number
  timestamp: number
}
```

## API Response Types

### Log/Graph Responses

```typescript
interface GitLogResponse {
  commits: GitLogCommit[]
  branches: string[]
  tags: string[]
  localBranches: string[]
  hasMore: boolean
  totalCount: number
}
```

### Commit Detail Response

```typescript
interface GitShowResponse {
  commit: {
    hash: string; shortHash: string
    author: string; email: string
    committer?: string; committerEmail?: string  // FR-013
    timestamp: number
    message: string; body: string
    parents: string[]
  }
  files: { path: string; oldPath?: string; status: string; additions: number; deletions: number; binary: boolean }[]
  stats: { filesChanged: number; additions: number; deletions: number }
}
```

### Status Response

```typescript
interface GitStatusResponse {
  stagedFiles: GitStatusFile[]
  unstagedFiles: GitStatusFile[]
  hasChanges: boolean
  stagedCount: number
  unstagedCount: number
}
```

### Operation Request/Response Types (NEW)

```typescript
// Branch operations (FR-023 to FR-032)
interface BranchRenameRequest { oldName: string; newName: string }
interface BranchMergeRequest { branch: string; noCommit?: boolean; noFastForward?: boolean; squash?: boolean }
interface BranchRebaseRequest { onto: string }
interface BranchPushRequest { branch: string; remote?: string; force?: boolean; forceWithLease?: boolean }
interface BranchPullRequest { branch: string; remote?: string; noFastForward?: boolean; squash?: boolean }
interface BranchFetchRequest { branch?: string; remote?: string; force?: boolean }

// Commit operations (FR-033 to FR-039)
interface CherryPickRequest { hash: string; recordOrigin?: boolean; noCommit?: boolean }
interface RevertRequest { hash: string }
interface ResetRequest { hash: string; mode: 'soft' | 'mixed' | 'hard' }
interface CreateBranchRequest { name: string; fromCommit?: string; checkout?: boolean }

// Tag operations (FR-040 to FR-044)
interface TagCreateRequest { name: string; hash: string; annotated?: boolean; message?: string; pushToRemote?: string }
interface TagDeleteRequest { name: string; deleteFromRemote?: string }
interface TagPushRequest { name: string; remote?: string }

// Stash operations (FR-045 to FR-051)
interface StashCreateRequest { message?: string; includeUntracked?: boolean }
interface StashApplyRequest { index: number; reinstateIndex?: boolean }
interface StashPopRequest { index: number; reinstateIndex?: boolean }
interface StashDropRequest { index: number }
interface StashBranchRequest { index: number; branchName: string }

// Remote operations (FR-074 to FR-076)
interface RemoteAddRequest { name: string; url: string }
interface RemoteEditRequest { name: string; newUrl: string }
interface RemoteDeleteRequest { name: string }
interface FetchAllRequest { prune?: boolean; pruneTags?: boolean }

// Generic operation response
interface GitOperationResponse { success: boolean; message?: string; warnings?: string[] }
```

## Graph Layout Types (Client-side)

### SVG Graph Rendering (FR-001, FR-002)

```typescript
interface GraphRowData {
  commitHash: string
  lane: number             // Lane index (0 = mainline)
  color: string            // Lane color
  nodeType: 'regular' | 'merge' | 'head' | 'stash' | 'uncommitted'
  connections: GraphSegment[]
}

interface GraphSegment {
  type: 'vertical' | 'merge-in' | 'merge-out' | 'branch-in' | 'branch-out'
  fromLane: number
  toLane: number
  color: string
  style: 'rounded' | 'angular' // FR-002 configurable
}
```

### Column Layout (FR-071, FR-072, FR-073)

```typescript
interface ColumnConfig {
  id: 'graph' | 'description' | 'date' | 'author' | 'commit'
  visible: boolean
  width: number           // pixels
  minWidth: number
}

interface RefLabelAlignment {
  mode: 'normal' | 'aligned-to-graph' | 'on-right'
}
```

## Pinia Store State

```typescript
interface GitGraphState {
  // Data
  commits: GitLogCommit[]
  branches: GitBranch[]
  tags: GitTag[]
  stashes: GitStash[]          // NEW (FR-045)
  remotes: GitRemote[]         // NEW (FR-074)

  // Uncommitted changes
  stagedFiles: GitStatusFile[]
  unstagedFiles: GitStatusFile[]
  uncommittedChangesCount: number

  // Selection
  selectedCommit: GitLogCommit | null
  selectedCommitFiles: FileChange[] | null
  selectedCommitStats: { additions: number; deletions: number; filesChanged: number } | null
  comparisonCommit: GitLogCommit | null  // NEW (FR-021)
  isUncommittedChangesSelected: boolean

  // UI State
  loading: boolean
  error: string | null
  hasMore: boolean
  totalCount: number

  // Column configuration (NEW)
  columns: ColumnConfig[]
  refLabelAlignment: RefLabelAlignment

  // Search & Filter
  searchQuery: string
  searchResultIndex: number    // NEW: current result position (FR-059)
  searchResultCount: number    // NEW: total matches
  filteredBranches: string[]
  searchCache: Map<string, string[]>

  // Graph style (NEW)
  graphStyle: 'rounded' | 'angular'  // FR-002
  muteNonAncestral: boolean          // FR-011

  // Auto-refresh
  lastRepositoryState: RepositoryState | null
  lastRefreshTime: number | null
  isPollingActive: boolean
  isRefreshing: boolean

  // Detail view
  detailViewPosition: 'inline' | 'bottom'  // FR-020
  fileViewMode: 'tree' | 'list'            // FR-014

  // Active dialog/menu state
  activeDialog: DialogState | null
  activeContextMenu: ContextMenuState | null
}
```

## Constants

```typescript
const GRAPH_CONSTANTS = {
  INITIAL_LOAD: 300,       // FR-067
  INCREMENTAL_LOAD: 100,   // FR-067
  MAX_LANES: 10,
  NODE_RADIUS: 6,
  LANE_WIDTH: 20,
  ROW_HEIGHT: 32,
  PADDING: 10,
  VISIBLE_BUFFER: 10,
  POLL_INTERVAL: 10000,    // FR-063
  SEARCH_DEBOUNCE: 300,    // FR-061
  SEARCH_CACHE_MAX: 10,    // FR-062
} as const

// 12-color palette (FR-003)
const BRANCH_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
  '#06B6D4', '#84CC16', '#F43F5E', '#A855F7',
] as const

const FILE_STATUS_CONFIG = {
  A: { label: 'Added',    color: 'green',  colorClass: 'text-retro-green' },
  M: { label: 'Modified', color: 'yellow', colorClass: 'text-retro-yellow' },
  D: { label: 'Deleted',  color: 'red',    colorClass: 'text-retro-red' },
  R: { label: 'Renamed',  color: 'blue',   colorClass: 'text-retro-blue' },
  C: { label: 'Copied',   color: 'purple', colorClass: 'text-retro-purple' },
  U: { label: 'Unmerged', color: 'cyan',   colorClass: 'text-retro-cyan' },
} as const
```

## Relationships

```
Store ──manages──► Commits (N)
Store ──manages──► Branches (N)
Store ──manages──► Tags (N)           [NEW]
Store ──manages──► Stashes (N)        [NEW]
Store ──manages──► Remotes (N)        [NEW]
Store ──manages──► StagedFiles (N)
Store ──manages──► UnstagedFiles (N)

Commit ──has──► Parents (M)           [many-to-many via hash]
Commit ──selected──► FileChanges (N)  [lazy loaded]
Commit ──has──► Branches (M)          [decoration]
Commit ──has──► Tags (M)              [decoration]

GraphRowData ──wraps──► Commit        [computed per-row layout]
GraphRowData ──has──► Segments (M)    [SVG path segments]

Branch ──tracks──► Remote (0..1)
Tag ──points-to──► Commit (1)
Stash ──created-on──► Branch (1)

ComparisonView ──compares──► Commit × Commit  [FR-021]
```
