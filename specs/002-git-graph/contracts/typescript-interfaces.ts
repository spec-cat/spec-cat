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
  force?: boolean          // Discard local changes (default false)
}

export interface CheckoutResponse {
  success: boolean
  newBranch: string
  previousBranch: string
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