import type { ProviderId } from './session-store'
import { isSessionDeleted, readStoredSession, writeStoredSession } from './session-store'
import { findAgySessionId, findClaudeSessionId, findCodexSessionId } from './provider-resume'

type Capture = { timer: NodeJS.Timeout | null, cancelled: boolean }

const POLL_MS = 2000
const TIMEOUT_MS = 2 * 60 * 1000
const captures = new Map<string, Capture>()

/** Owns the bounded filesystem polling used to discover provider resume ids. */
export function startProviderSessionCapture(
  sessionId: string,
  provider: ProviderId,
  cwd: string,
  afterMs: number
) {
  stopProviderSessionCapture(sessionId)
  const capture: Capture = { timer: null, cancelled: false }
  captures.set(sessionId, capture)
  const deadline = afterMs + TIMEOUT_MS
  const finder = provider === 'codex'
    ? findCodexSessionId
    : provider === 'agy'
      ? findAgySessionId
      : findClaudeSessionId

  const finish = () => {
    capture.cancelled = true
    if (captures.get(sessionId) === capture) captures.delete(sessionId)
  }

  const poll = async () => {
    capture.timer = null
    if (capture.cancelled || isSessionDeleted(sessionId)) return finish()
    const providerSessionId = await finder(cwd, afterMs).catch(() => null)
    if (capture.cancelled || isSessionDeleted(sessionId)) return finish()

    if (providerSessionId) {
      const stored = await readStoredSession(sessionId).catch(() => null)
      if (stored && !capture.cancelled && !isSessionDeleted(sessionId)
        && stored.providerSessionId !== providerSessionId) {
        await writeStoredSession({
          ...stored,
          providerSessionId,
          updatedAt: new Date().toISOString()
        }).catch(() => {})
      }
      return finish()
    }

    if (Date.now() >= deadline) return finish()
    capture.timer = setTimeout(() => { void poll() }, POLL_MS)
    capture.timer.unref?.()
  }

  capture.timer = setTimeout(() => { void poll() }, POLL_MS)
  capture.timer.unref?.()
}

export function stopProviderSessionCapture(sessionId: string) {
  const capture = captures.get(sessionId)
  if (!capture) return
  capture.cancelled = true
  if (capture.timer) clearTimeout(capture.timer)
  capture.timer = null
  captures.delete(sessionId)
}
