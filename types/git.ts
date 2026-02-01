// TypeScript interfaces generated from OpenAPI spec
// Used by both client and server components

// =============================================================================
// Core Git Entities
// =============================================================================

export interface Commit {
  hash: string              // Full SHA-1 hash (40 chars)
  shortHash: string         // Abbreviated hash (7 chars)  
  message: string           // Full commit message
  subject: string           // First line of commit message
  author: CommitAuthor      // Author information
  committer?: CommitAuthor  // Committer (if different from author)
  date: string             // ISO 8601 timestamp
  parents: string[]        // Parent commit hashes
  branches: string[]       // Branches containing this commit
  tags: string[]           // Tags pointing to this commit
}

export interface CommitDetail extends Commit {
  fileChanges: FileChange[] // Files modified in this commit
  stats: CommitStats       // Summary statistics
}

export interface CommitAuthor {
  name: string
  email: string            // RFC 5322 email format
  date: string            // ISO 8601 timestamp
}

export interface CommitStats {
  additions: number        // Lines added
  deletions: number        // Lines deleted
  filesChanged: number     // Total files modified
}

export interface FileChange {
  path: string             // File path relative to repository root
  oldPath?: string         // Previous path for renames/moves
  status: FileChangeStatus // Type of modification
  additions: number        // Lines added in this file
  deletions: number        // Lines deleted in this file
  binary: boolean          // Whether file contains binary data
}

export enum FileChangeStatus {
  Added = 'A',
  Modified = 'M', 
  Deleted = 'D',
  Renamed = 'R',
  Copied = 'C',
  Unmerged = 'U'
}

export interface Branch {
  name: string             // Branch name (e.g., "main", "feature/auth")
  ref: string              // Full ref name (e.g., "refs/heads/main")
  tip: string              // Hash of tip commit
  upstream?: UpstreamBranch // Remote tracking information
  ahead: number            // Commits ahead of upstream
  behind: number           // Commits behind upstream
  color: string            // Hex color for visualization (#RRGGBB)
  isHead: boolean          // Whether this is current branch
  isRemote: boolean        // Whether this is remote tracking branch
  lastCommitDate: string   // ISO 8601 timestamp of tip commit
}

export interface UpstreamBranch {
  remote: string           // Remote name (e.g., "origin")
  branch: string           // Remote branch name
  url?: string            // Remote URL
}

export interface RepositoryStatus {
  currentBranch: string    // Name of current branch
  head: string             // Current HEAD commit hash
  workingDirectory: WorkingDirectoryStatus
  stagingArea: StagingAreaStatus
  remotes: Remote[]        // Configured remotes
  lastUpdated: string      // ISO 8601 timestamp when captured
  gitDir: string           // Path to .git directory
}

export interface WorkingDirectoryStatus {
  clean: boolean           // No uncommitted changes
  untracked: string[]      // Untracked file paths
  modified: string[]       // Modified tracked file paths
  deleted: string[]        // Deleted file paths
}

export interface StagingAreaStatus {
  hasChanges: boolean      // Files staged for commit
  staged: string[]         // Staged file paths
  partiallyStaged: string[] // Files with partial staging
}

export interface Remote {
  name: string             // Remote name (e.g., "origin")
  url: string              // Remote URL (for both fetch/push if same)
  fetchUrl: string         // Explicit fetch URL
  pushUrl: string          // Explicit push URL
}

// =============================================================================
// API Request/Response Types
// =============================================================================

export interface GraphQueryParams {
  limit?: number           // Maximum commits (1-500, default 50)
  offset?: number          // Skip count (default 0)
  branch?: string          // Filter to specific branch
  author?: string          // Filter by author email/name
  search?: string          // Search commit messages
  since?: string          // ISO 8601 date - commits after
  until?: string          // ISO 8601 date - commits before
}

export interface GraphResponse {
  commits: Commit[]
  branches: Branch[]
  pagination: Pagination
  layout_hints: LayoutHints
}

export interface BranchResponse {
  branches: Branch[]
  current: string          // Current branch name
}

export interface CheckoutRequest {
  workingDirectory?: string // Working directory path (optional, uses server default)
  branchName: string        // Branch to checkout
  force?: boolean          // Discard local changes (default false)
  createBranch?: boolean   // Create new branch
  fromCommit?: string      // Create branch from specific commit
}

export interface CheckoutResponse {
  success: boolean
  newHead?: string
  newBranch?: string
  previousBranch?: string
  warnings?: string[]      // Optional warning messages
}

export interface Pagination {
  offset: number
  limit: number
  total: number            // Total commits matching query
  hasMore: boolean         // Whether more results available
}

export interface LayoutHints {
  totalCommits: number     // Total repository commits
  maxLanes: number         // Maximum concurrent branches
  suggestedViewport: {
    height: number         // Recommended viewport height
    commitsPerPage: number // Commits per virtual page
  }
}

export interface ErrorResponse {
  error: string            // Error category
  message: string          // Human-readable message
  details?: object         // Additional error context
  code?: string           // Machine-readable error code
}

// =============================================================================
// Client-side State Types
// =============================================================================

export interface GraphFilters {
  search: string           // Text search in messages
  authors: string[]        // Filter by specific authors
  branches: string[]       // Show only these branches
  dateRange: DateRange     // Time-based filtering
}

export interface DateRange {
  start?: Date            // Filter start date (inclusive)
  end?: Date              // Filter end date (inclusive)
}

export interface SelectionState {
  selectedCommit: string | null  // Currently selected commit hash
  hoveredCommit: string | null   // Commit being hovered
  expandedDetails: boolean       // Whether details panel is open
}

export interface ViewportState {
  scrollY: number          // Vertical scroll position
  height: number           // Visible viewport height
  width: number            // Visible viewport width
  scale: number            // Zoom level (1.0 = normal)
}

// =============================================================================
// Graph Layout Types (Client-side computed)
// =============================================================================

export interface GraphLayout {
  commits: CommitNode[]    // Positioned commit nodes
  connections: Connection[] // Visual branch connections
  lanes: Lane[]            // Visual lane assignments
  viewport: ViewportBounds // Current visible area
}

export interface CommitNode {
  commit: Commit           // Source commit data
  x: number               // Horizontal position (pixels)
  y: number               // Vertical position (pixels)
  lane: number            // Visual lane index (0 = leftmost)
  radius: number          // Node display radius
  visible: boolean        // Whether currently in viewport
}

export interface Connection {
  from: CommitNode        // Source commit node
  to: CommitNode          // Target commit node
  lane: number            // Visual lane for this connection
  color: string           // Branch color
  type: ConnectionType    // Visual connection style
  path: string           // SVG path data
}

export enum ConnectionType {
  Straight = 'straight',  // Direct parent-child
  Merge = 'merge',        // Merge commit connection
  Branch = 'branch'       // Branch creation point
}

export interface Lane {
  index: number           // Lane position (0 = leftmost)
  branch: string          // Associated branch name
  color: string           // Display color
  active: boolean         // Currently has visible commits
  width: number           // Lane width in pixels
}

export interface ViewportBounds {
  startIndex: number      // First visible commit index
  endIndex: number        // Last visible commit index
  top: number             // Top Y coordinate
  bottom: number          // Bottom Y coordinate
  left: number            // Left X coordinate
  right: number           // Right X coordinate
}

// =============================================================================
// Real-time Update Types
// =============================================================================

export interface RepositoryChangeEvent {
  type: RepositoryChangeType
  data?: object           // Event-specific payload
  timestamp: string       // ISO 8601 timestamp
}

export enum RepositoryChangeType {
  CommitAdded = 'commit_added',
  BranchUpdated = 'branch_updated',
  BranchCreated = 'branch_created',
  BranchDeleted = 'branch_deleted',
  WorkingDirectoryChanged = 'working_directory_changed',
  StagingAreaChanged = 'staging_area_changed',
  RemoteUpdated = 'remote_updated'
}

export interface CommitAddedEvent {
  type: RepositoryChangeType.CommitAdded
  data: {
    hash: string
    branch: string
    parentHashes: string[]
  }
}

export interface BranchUpdatedEvent {
  type: RepositoryChangeType.BranchUpdated
  data: {
    name: string
    oldTip: string
    newTip: string
  }
}

// =============================================================================
// API Client Types
// =============================================================================

export interface GitApiClient {
  getGraph(params?: GraphQueryParams): Promise<GraphResponse>
  getCommitDetail(hash: string): Promise<CommitDetail>
  getBranches(includeRemote?: boolean): Promise<BranchResponse>
  checkoutBranch(name: string, options?: CheckoutRequest): Promise<CheckoutResponse>
  getRepositoryStatus(): Promise<RepositoryStatus>
  watchChanges(): EventSource // Server-sent events
}

// =============================================================================
// Composable Return Types (Vue 3 Composition API)
// =============================================================================

export interface UseGitGraphReturn {
  // State
  commits: Ref<Map<string, Commit>>
  branches: Ref<Map<string, Branch>>
  repositoryStatus: Ref<RepositoryStatus | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  
  // Computed
  layout: ComputedRef<GraphLayout | null>
  visibleCommits: ComputedRef<Commit[]>
  currentBranch: ComputedRef<Branch | null>
  
  // Actions
  loadGraph: (params?: GraphQueryParams) => Promise<void>
  refreshStatus: () => Promise<void>
  selectCommit: (hash: string | null) => void
  searchCommits: (query: string) => void
}

export interface UseGitCommandsReturn {
  // State
  executing: Ref<boolean>
  lastResult: Ref<string | null>

  // Actions
  checkoutBranch: (name: string, force?: boolean) => Promise<CheckoutResponse>
  getCommitDetail: (hash: string) => Promise<CommitDetail>
  refreshRepository: () => Promise<void>
}

// =============================================================================
// Constants
// =============================================================================

export const GRAPH_CONSTANTS = {
  INITIAL_LOAD: 300,       // FR-067: Initial commit load count
  INCREMENTAL_LOAD: 100,   // FR-067: Commits per incremental load
  COMMITS_PER_PAGE: 300,   // Alias for INITIAL_LOAD
  MAX_LANES: 10,
  NODE_RADIUS: 4,
  LANE_WIDTH: 20,
  ROW_HEIGHT: 32,
  COLUMN_WIDTH: 20,
  PADDING: 10,
  VISIBLE_BUFFER: 10,
  POLL_INTERVAL: 10000,    // FR-063: Auto-refresh interval (ms)
  SEARCH_DEBOUNCE: 300,    // FR-061: Search debounce (ms)
  SEARCH_CACHE_MAX: 10,    // FR-062: Max cached search results
} as const

// 12-color deterministic palette for branch visualization (FR-003)
export const BRANCH_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#F43F5E', // rose
  '#A855F7', // purple
] as const

// File status configuration for display (FR-015)
export const FILE_STATUS_CONFIG = {
  A: { label: 'Added', colorClass: 'text-retro-green' },
  M: { label: 'Modified', colorClass: 'text-retro-yellow' },
  D: { label: 'Deleted', colorClass: 'text-retro-red' },
  R: { label: 'Renamed', colorClass: 'text-retro-blue' },
  C: { label: 'Copied', colorClass: 'text-retro-purple' },
  U: { label: 'Unmerged', colorClass: 'text-retro-cyan' },
} as const

// =============================================================================
// Git Status / Staging / Commit Types
// =============================================================================

export interface GitStatusFile {
  path: string
  oldPath?: string
  status: FileChangeStatus
  staged: boolean
  unstaged: boolean
}

export interface GitStatusResponse {
  stagedFiles: GitStatusFile[]
  unstagedFiles: GitStatusFile[]
  hasChanges: boolean
  stagedCount: number
  unstagedCount: number
}

export interface GitStageRequest {
  workingDirectory?: string
  files: string[]  // empty array means stage all
}

export interface GitStageResponse {
  success: boolean
  stagedCount: number
}

export interface GitUnstageRequest {
  workingDirectory?: string
  files: string[]  // empty array means unstage all
}

export interface GitUnstageResponse {
  success: boolean
  unstagedCount: number
}

export interface GitCommitRequest {
  workingDirectory?: string
  message: string
}

export interface GitCommitResponse {
  success: boolean
  hash: string
  shortHash: string
}

// =============================================================================
// New Entity Types (Redesign)
// =============================================================================

export interface GitTag {
  name: string
  hash: string             // Commit hash this tag points to
  isAnnotated: boolean
  tagger?: { name: string; email: string; date: string }
  message?: string         // Annotated tag message
}

export interface GitStash {
  hash: string             // Stash commit hash
  index: number            // stash@{index}
  message: string          // Stash message
  date: string             // ISO 8601
  branchName: string       // Branch stash was created on
}

export interface GitRemote {
  name: string             // e.g., "origin"
  fetchUrl: string
  pushUrl: string
}

// =============================================================================
// Operation Request/Response Types (Redesign)
// =============================================================================

// Branch operations (FR-023 to FR-032)
export interface BranchRenameRequest { oldName: string; newName: string }
export interface BranchMergeRequest { branch: string; noCommit?: boolean; noFastForward?: boolean; squash?: boolean }
export interface BranchRebaseRequest { onto: string }
export interface BranchPushRequest { branch: string; remote?: string; force?: boolean; forceWithLease?: boolean }
export interface BranchPullRequest { branch: string; remote?: string; noFastForward?: boolean; squash?: boolean }
export interface BranchFetchRequest { branch?: string; remote?: string; force?: boolean; all?: boolean; prune?: boolean; pruneTags?: boolean }

// Commit operations (FR-033 to FR-039)
export interface CherryPickRequest { hash: string; recordOrigin?: boolean; noCommit?: boolean }
export interface RevertRequest { hash: string }
export interface ResetRequest { hash: string; mode: 'soft' | 'mixed' | 'hard' }
export interface CreateBranchRequest { name: string; fromCommit?: string; checkout?: boolean }

// Tag operations (FR-040 to FR-044)
export interface TagCreateRequest { name: string; hash: string; annotated?: boolean; message?: string; pushToRemote?: string }
export interface TagDeleteRequest { name: string; deleteFromRemote?: string }
export interface TagPushRequest { name: string; remote?: string }

// Stash operations (FR-045 to FR-051)
export interface StashCreateRequest { message?: string; includeUntracked?: boolean }
export interface StashApplyRequest { index: number; reinstateIndex?: boolean }
export interface StashPopRequest { index: number; reinstateIndex?: boolean }
export interface StashDropRequest { index: number }
export interface StashBranchRequest { index: number; branchName: string }
export interface CleanUntrackedRequest { workingDirectory?: string }

// Remote operations (FR-074 to FR-076)
export interface RemoteAddRequest { name: string; url: string }
export interface RemoteEditRequest { name: string; newUrl: string }
export interface RemoteDeleteRequest { name: string }
export interface FetchAllRequest { prune?: boolean; pruneTags?: boolean }

// Diff request (FR-021, FR-022)
export interface DiffRequest { from: string; to: string }

// File diff types (FR-087, FR-094)
export interface FileDiffLine {
  type: 'add' | 'delete' | 'context' | 'header'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export interface FileDiffResponse {
  filePath: string
  oldPath?: string
  status: string
  binary: boolean
  lines: readonly FileDiffLine[]
  truncated: boolean
}

// Generic operation response
export interface GitOperationResponse { success: boolean; message?: string; warnings?: string[] }

// =============================================================================
// SVG Graph Layout Types (FR-001, FR-002)
// =============================================================================

export interface GraphRowData {
  commitHash: string
  lane: number             // Lane index (0 = mainline)
  color: string            // Lane color
  nodeType: 'regular' | 'merge' | 'head' | 'stash' | 'uncommitted'
  isMainline: boolean      // Whether this commit is on HEAD's first-parent chain (FR-011)
  connections: GraphSegment[]
}

export interface GraphSegment {
  type: 'vertical' | 'vertical-top' | 'vertical-bottom' | 'merge-in' | 'merge-out' | 'branch-in' | 'branch-out'
  fromLane: number
  toLane: number
  color: string
  style: 'rounded' | 'angular' // FR-002 configurable
}

// =============================================================================
// Column Layout Types (FR-071, FR-072, FR-073)
// =============================================================================

export interface ColumnConfig {
  id: 'graph' | 'description' | 'date' | 'author' | 'commit'
  visible: boolean
  width: number           // pixels
  minWidth: number
}

export interface RefLabelAlignment {
  mode: 'normal' | 'aligned-to-graph' | 'on-right'
}

// =============================================================================
// Dialog & Context Menu State
// =============================================================================

export interface DialogState {
  type: string
  props?: Record<string, unknown>
}

export interface ContextMenuState {
  type: string
  position: { x: number; y: number }
  props?: Record<string, unknown>
}

// Type aliases for backward compatibility
export type GitCommit = Commit
export type GitBranch = Branch
export type GitCheckoutRequest = CheckoutRequest
export type GitCheckoutResponse = CheckoutResponse & { error?: string }
export type GraphConnection = Connection

// Graph node as used by the layout algorithm (with GitLogCommit, color, connections)
export interface GraphNode {
  commit: GitLogCommit
  x: number
  y: number
  radius: number
  color: string
  connections: {
    fromX: number
    fromY: number
    toX: number
    toY: number
    color: string
    isMerge: boolean
  }[]
}

// =============================================================================
// Git Log API Types
// =============================================================================

export interface GitLogCommit {
  hash: string
  shortHash: string
  author: string
  email: string
  timestamp: number
  message: string
  body?: string                    // Full commit message body
  parents: readonly string[]
  branches: readonly string[]
  tags: readonly string[]
  isHead?: boolean
  isMerge?: boolean                // Has 2+ parents
  signatureStatus?: 'good' | 'bad' | 'unknown' | 'none' // GPG status (FR-086)
}

export interface GitLogResponse {
  commits: GitLogCommit[]
  branches: Branch[]
  tags: GitTag[]
  localBranches: string[]
  hasMore: boolean
  totalCount: number
}

export interface GitShowCommit {
  hash: string
  shortHash: string
  author: string
  email: string
  committer?: string               // Committer name (FR-013)
  committerEmail?: string          // Committer email (FR-013)
  timestamp: number
  message: string
  body: string
  parents: string[]
}

export interface GitShowFile {
  path: string
  oldPath?: string              // For renames (FR-016)
  status: FileChangeStatus
  additions: number
  deletions: number
  binary: boolean
}

export interface GitShowStats {
  filesChanged: number
  additions: number
  deletions: number
}

export interface GitShowResponse {
  commit: GitShowCommit
  files: GitShowFile[]
  stats: GitShowStats
}

export interface RepositoryState {
  headCommit: string
  branchListHash: string
  uncommittedFileCount: number
  workingTreeHash: string
  stashListHash: string
  timestamp: number
}

export interface GitStateResponse {
  state: RepositoryState
}
