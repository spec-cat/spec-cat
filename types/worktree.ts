/**
 * Worktree types for vibe-kanban workflow
 */

export type WorktreeStatus = 'clean' | 'dirty' | 'ahead' | 'behind' | 'diverged'

export interface Worktree {
  name: string           // e.g., "001-app-layout"
  path: string           // Full path to worktree
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
    date: string
  }
}

export interface WorktreeListResponse {
  worktrees: Worktree[]
  currentBranch: string
  mainWorktree: string
}

export interface WorktreeCreateRequest {
  description: string
  shortName?: string
  baseBranch?: string
}

export interface WorktreeCreateResponse {
  success: boolean
  worktree?: Worktree
  error?: string
}

export interface WorktreeDeleteResponse {
  success: boolean
  error?: string
}

export interface WorktreeSwitchResponse {
  success: boolean
  worktree?: Worktree
  error?: string
}
