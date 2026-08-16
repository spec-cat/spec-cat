import type { ProviderId } from '~/server/utils/session-store'

export type SpecFile = {
  filename: string
  label: string
}

export type SpecFeature = {
  id: string
  name: string
  files: SpecFile[]
  hasSpec: boolean
  hasPlan: boolean
  hasTasks: boolean
  completedTasks: number
  totalTasks: number
}

export type GitCommit = {
  hash: string
  shortHash: string
  subject: string
  author: {
    name: string
    email: string
  }
  date: string
  parents: string[]
  refs: string[]
  branches: string[]
  tags: string[]
  lane: number
  color: string
}

export type GitBranch = {
  name: string
  hash: string
  current: boolean
  remote: boolean
  color: string
}

export type GitStash = {
  index: number
  hash: string
  message: string
  branch: string
  date: string
}

export type GitStatusFile = {
  path: string
  status: string
  oldPath?: string
}

export type GitCommitFile = {
  path: string
  status: string
  oldPath?: string
}

export type GitFileDiff = {
  path: string
  oldPath?: string
  hash: string
  binary: boolean
  truncated: boolean
  bytes: number
  diff: string
}

export type GitDiffLine = {
  key: string
  oldLine: number | null
  newLine: number | null
  content: string
  kind: 'header' | 'hunk' | 'add' | 'remove' | 'context'
}

export type GitGraphResponse = {
  root: string
  head: string
  headHash?: string
  commits: GitCommit[]
  branches: GitBranch[]
  stashes?: GitStash[]
  mergeBases?: string[]
  status: {
    clean: boolean
    changed: number
    staged: number
    unstaged: number
    untracked: number
    stagedFiles: GitStatusFile[]
    unstagedFiles: GitStatusFile[]
  }
  generatedAt: string
}

export type GraphSegment = {
  type: 'vertical' | 'vertical-top' | 'vertical-bottom' | 'branch-out' | 'branch-in' | 'merge-out' | 'merge-in'
  fromLane: number
  toLane: number
  color: string
  style: 'rounded' | 'angular'
}

export type GraphRowData = {
  commitHash: string
  lane: number
  color: string
  nodeType: 'regular' | 'merge' | 'head' | 'stash' | 'uncommitted'
  isMainline: boolean
  connections: GraphSegment[]
}

export type GitContextMenu =
  | { type: 'commit'; x: number; y: number; commit: GitCommit }
  | { type: 'branch'; x: number; y: number; branch: string; commit: GitCommit }
  | { type: 'tag'; x: number; y: number; tag: string; commit: GitCommit }
  | { type: 'stash'; x: number; y: number; stash: GitStash }
  | { type: 'workingTree'; x: number; y: number }

export type GitCompareFile = {
  path: string
  status: string
  oldPath?: string
  additions: number
  deletions: number
}

export type GitCompareResponse = {
  from: string
  to: string
  files: GitCompareFile[]
  stats: { filesChanged: number; additions: number; deletions: number }
}

export type GitRemoteDetail = {
  name: string
  fetchUrl: string
  pushUrl: string
}

export type SessionProviderOption = {
  id: ProviderId
  name: string
}

export type SessionOptions = {
  branches: string[]
  providers: SessionProviderOption[]
}

export type ShellSessionInfo = { id: string; tmuxName: string; createdAt: number }

export type ConversationWorkspaceExpose = {
  connect: (targetSessionId?: string, provider?: ProviderId, creation?: { baseBranch?: string; featureId?: string }) => void
  sendCommand: (value: string) => boolean
  sendText: (value: string) => boolean
  isConnected: () => boolean
  close: () => void
  reset: (cursorBlink?: boolean) => void
  setCursorBlink: (value: boolean) => void
  write: (value: string, scrollToBottom?: boolean) => void
  writeln: (value: string) => void
  setSessionId: (value: string) => void
  clearSessionId: () => void
  getInitialSessionId: (fallback?: string) => string | undefined
  scheduleConversationFit: (delay?: number) => void
  settleConversationFit: () => void
  refreshShells: () => Promise<void>
  createShell: () => Promise<void>
  killShell: (id: string) => Promise<void>
  selectShell: (id: string) => void
  scheduleShellFit: (delay?: number) => void
  settleShellFit: () => void
}

export type SpecWorkspaceExpose = {
  refresh: () => Promise<void>
  trackSessionState: (session: import('~/server/utils/session-store').SessionListItem, state: string) => void
  waitForNewSessionAttached: (timeout?: number) => Promise<string>
  waitForSessionIdle: (id: string, timeout?: number) => Promise<boolean>
  dispatchFeatureAction: (action: PendingFeatureAction) => void
  getPendingAction: () => PendingFeatureAction | null
  getPendingActionLabel: () => string
  clearPendingAction: () => void
  closeTopmost: () => boolean
  submitTopmost: () => boolean
}

export type GitWorkspaceExpose = {
  refresh: () => Promise<void>
  poll: () => Promise<void>
  invalidate: () => void
  closeFloatingMenus: () => void
  closeHighPriorityModal: () => boolean
  submitHighPriorityModal: () => boolean
  closeModal: () => boolean
  submitModal: () => boolean
  hasDiffPreview: () => boolean
  closeDiffPreview: () => void
}

export type CascadeState = {
  sessionId: string
  featureId: string
  steps: string[]
  index: number
  phase: 'waiting-start' | 'waiting-idle'
}

export type PendingFeatureAction =
  | { kind: 'conversation'; featureId: string }
  | { kind: 'speckit'; featureId: string; step: string }
  | { kind: 'skill'; featureId: string; skillId: string }
  | { kind: 'cascade'; featureId: string }

export type SkillInfo = { id: string; name: string; description: string; path: string | null }

export type TraceabilityInfo = {
  featureId: string
  counts: { total: number; coveredInPlan: number; coveredInTasks: number; uncovered: number }
  alerts: string[]
  risk: 'none' | 'low' | 'medium' | 'high'
}

export type GitDialogField =
  | { kind: 'text'; key: string; label: string; value: string; placeholder?: string }
  | { kind: 'select'; key: string; label: string; value: string; options: string[] }
  | { kind: 'checkbox'; key: string; label: string; value: boolean }

export type GitDialogState = {
  title: string
  message: string
  danger: boolean
  confirmLabel: string
  fields: GitDialogField[]
  resolve: (result: Record<string, string | boolean> | null) => void
}

export type GitDialogOptions = {
  title: string
  message?: string
  danger?: boolean
  confirmLabel?: string
  fields?: GitDialogField[]
}

export type WorktreeItem = {
  path: string
  head: string
  branch: string | null
  detached: boolean
  locked: boolean
  prunable: boolean
  isMain: boolean
  managed: boolean
}

export type ToastType = 'success' | 'error' | 'info' | 'warning'
export type ToastItem = { id: number; type: ToastType; message: string }

export type AppSettingsPayload = {
  theme?: string
  gitGraphState?: 'floating' | 'pinned' | 'none'
  defaultProvider?: ProviderId
}

export type CommitFileTreeRow =
  | { kind: 'folder'; path: string; name: string; depth: number; expanded: boolean }
  | { kind: 'file'; file: GitCommitFile; name: string; depth: number }
