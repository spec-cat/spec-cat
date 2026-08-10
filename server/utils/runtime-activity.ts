export type TerminalRuntimeActivity = {
  attachedPeers: number
  lastAttachedAt?: number
  lastDetachedAt?: number
  lastInputAt?: number
  lastSubmitAt?: number
  lastOutputAt?: number
  /**
   * When a deterministic turn-completion signal (a CLI Stop hook) was last
   * observed. A completion at/after lastSubmitAt means the provider is idle
   * regardless of what the screen-scrape heuristics say.
   */
  lastTurnCompletedAt?: number
}

const activityBySession = new Map<string, TerminalRuntimeActivity>()

export function getTerminalActivity(sessionId: string): TerminalRuntimeActivity | undefined {
  return activityBySession.get(sessionId)
}

export function recordTerminalAttach(sessionId: string) {
  const activity = ensureActivity(sessionId)
  activity.attachedPeers += 1
  activity.lastAttachedAt = Date.now()
}

export function recordTerminalDetach(sessionId: string) {
  const activity = ensureActivity(sessionId)
  activity.attachedPeers = Math.max(0, activity.attachedPeers - 1)
  activity.lastDetachedAt = Date.now()
}

export function recordTerminalInput(sessionId: string, text: string) {
  const activity = ensureActivity(sessionId)
  activity.lastInputAt = Date.now()

  if (text.includes('\r') || text.includes('\n')) {
    activity.lastSubmitAt = activity.lastInputAt
  }
}

export function recordTerminalOutput(sessionId: string) {
  const activity = ensureActivity(sessionId)
  activity.lastOutputAt = Date.now()
}

/** Records a prompt submission observed via a CLI hook (UserPromptSubmit). */
export function recordTerminalSubmit(sessionId: string) {
  const activity = ensureActivity(sessionId)
  activity.lastInputAt = Date.now()
  activity.lastSubmitAt = activity.lastInputAt
}

/** Records a deterministic turn completion observed via a CLI hook (Stop). */
export function recordTurnCompleted(sessionId: string) {
  const activity = ensureActivity(sessionId)
  activity.lastTurnCompletedAt = Date.now()
}

export function clearTerminalActivity(sessionId: string) {
  activityBySession.delete(sessionId)
}

function ensureActivity(sessionId: string) {
  const existing = activityBySession.get(sessionId)
  if (existing) return existing

  const activity: TerminalRuntimeActivity = {
    attachedPeers: 0
  }
  activityBySession.set(sessionId, activity)
  return activity
}
