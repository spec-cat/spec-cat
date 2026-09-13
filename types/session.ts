export type ProviderId = 'claude' | 'codex' | 'agy'

export type StoredTerminalSession = {
  id: string
  provider: ProviderId
  title?: string
  tmuxName: string
  cwd: string
  cliBin: string
  providerSessionId?: string
  projectDir?: string
  featureId?: string
  worktreeBranch?: string
  baseBranch?: string
  previewBranch?: string
  finalized?: boolean
  finalizedAt?: string
  finalCommit?: string
  archived?: boolean
  archivedAt?: string
  branchKept?: boolean
  createdAt: string
  updatedAt: string
}

export type SessionRuntimeState = {
  state: 'idle' | 'working' | 'waiting_input' | 'disconnected' | 'dead' | 'unknown'
  active: boolean
  tmuxAlive: boolean
  tmuxAttached: boolean
  paneCommand?: string
  panePid?: number
  checkedAt: string
  reason?: string
}

export type SessionListItem = StoredTerminalSession & {
  logBytes: number
  runtime?: SessionRuntimeState
  preview?: string
  linkedFeatures?: string[]
}
