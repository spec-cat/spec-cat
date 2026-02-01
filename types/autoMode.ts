/**
 * Auto Mode Type Definitions
 * Types for the background spec processing scheduler
 */

/** Processing state for a single feature in an Auto Mode session */
export type AutoModeTaskState = 'queued' | 'running' | 'completed' | 'failed' | 'skipped'

/** Overall session state */
export type AutoModeSessionState = 'active' | 'stopped' | 'completed' | 'idle'

/** A single feature being processed by Auto Mode */
export interface AutoModeTask {
  featureId: string
  state: AutoModeTaskState
  worktreePath?: string
  worktreeBranch?: string
  baseBranch?: string
  /** Current speckit step being executed */
  currentStep?: string
  /** Error message if failed */
  error?: string
  startedAt?: string
  completedAt?: string
}

/** An Auto Mode session (one activation cycle) */
export interface AutoModeSession {
  id: string
  state: AutoModeSessionState
  tasks: AutoModeTask[]
  startedAt: string
  completedAt?: string
}

/** Auto Mode configuration persisted across sessions */
export interface AutoModeConfig {
  enabled: boolean
  concurrency: number           // Default: 3 (FR-013, FR-016)
}

/** Server-side session persistence for page refresh resilience (FR-015) */
export interface AutoModePersistedSession {
  sessionId: string
  enabled: boolean
  tasks: AutoModeTask[]
  startedAt: string
}

/** Server → Client WebSocket message types */
export interface AutoModeStatusMessage {
  type: 'auto_mode_status'
  session: AutoModeSession | null
  enabled: boolean
}

export interface AutoModeTaskUpdateMessage {
  type: 'auto_mode_task_update'
  task: AutoModeTask
}

export interface AutoModeErrorMessage {
  type: 'auto_mode_error'
  error: string
}

/** AI provider CLI message forwarded from the scheduler for a specific feature's conversation */
export interface AutoModeConversationMessage {
  type: 'auto_mode_message'
  featureId: string
  /** The CLI message (assistant text, tool use, etc.) */
  sdkMessage: {
    type: string
    message?: {
      content: Array<{
        type: string
        text?: string
        id?: string
        name?: string
        input?: Record<string, unknown>
      }>
    }
    content?: string
    [key: string]: unknown
  }
}

/** Sent when a speckit step starts for a feature */
export interface AutoModeStepStartMessage {
  type: 'auto_mode_step_start'
  featureId: string
  step: string
}

/** Sent when a speckit step completes for a feature */
export interface AutoModeStepCompleteMessage {
  type: 'auto_mode_step_complete'
  featureId: string
  step: string
}

export type AutoModeWSMessage =
  | AutoModeStatusMessage
  | AutoModeTaskUpdateMessage
  | AutoModeErrorMessage
  | AutoModeConversationMessage
  | AutoModeStepStartMessage
  | AutoModeStepCompleteMessage

/** API response types */
export interface AutoModeToggleResponse {
  success: boolean
  enabled: boolean
  error?: string
}

export interface AutoModeStatusResponse {
  enabled: boolean
  session: AutoModeSession | null
}
