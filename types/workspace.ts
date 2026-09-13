import type { ProviderId, SessionListItem } from './session'
import type { PendingFeatureAction } from './app'

export type ConversationWorkspaceExpose = {
  connect: (targetSessionId?: string, provider?: ProviderId, creation?: { baseBranch?: string, featureId?: string }) => void
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
  trackSessionState: (session: SessionListItem, state: string) => void
  waitForNewSessionAttached: (timeout?: number) => Promise<string>
  waitForSessionIdle: (id: string, timeout?: number) => Promise<boolean>
  dispatchFeatureAction: (action: PendingFeatureAction, freshConversation?: boolean) => void
  getPendingAction: () => PendingFeatureAction | null
  getPendingActionLabel: () => string
  getSkillPreparationLabel: () => string
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
