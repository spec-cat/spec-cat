import type { ProviderId } from './session-store'
import { isProviderTurnComplete } from './providers/turn-completion'

const DEFAULT_QUIET_MS = 900
const DEFAULT_MIN_TURN_MS = 1200
const DEFAULT_MAX_TURN_MS = Number(process.env.TERMINAL_TURN_MAX_MS || 2 * 60 * 60 * 1000)

type TurnMonitorOptions = {
  provider: ProviderId
  captureScreen: () => Promise<string>
  onComplete: () => Promise<void>
  quietMs?: number
  minTurnMs?: number
  maxTurnMs?: number
  onError?: (error: unknown) => void
}

export type TurnMonitor = {
  submitted: () => void
  output: () => void
  /**
   * Completes the in-flight turn from an external, deterministic signal (a
   * CLI Stop hook), bypassing the quiet-window screen check. Both this and
   * the internal quiet-window check claim the turn synchronously before
   * running onComplete, so whichever fires first wins and the other becomes a
   * no-op — onComplete runs at most once per submitted turn.
   */
  complete: () => Promise<void>
  dispose: () => void
}

export function createTurnMonitor(options: TurnMonitorOptions): TurnMonitor {
  const quietMs = options.quietMs ?? DEFAULT_QUIET_MS
  const minTurnMs = options.minTurnMs ?? DEFAULT_MIN_TURN_MS
  const maxTurnMs = options.maxTurnMs ?? DEFAULT_MAX_TURN_MS
  let submittedAt: number | null = null
  let outputAfterSubmit = false
  let timer: NodeJS.Timeout | null = null
  let checking = false
  let disposed = false

  const schedule = () => {
    if (!submittedAt || disposed) return
    if (timer) clearTimeout(timer)
    const remaining = Math.max(quietMs, minTurnMs - (Date.now() - submittedAt))
    timer = setTimeout(check, remaining)
  }

  // Synchronously claims the in-flight turn. Exactly one caller — the
  // quiet-window check or an external complete() — gets `true` per turn,
  // which is the once-per-turn guard against double auto-commits.
  const claimTurn = () => {
    if (!submittedAt) return false
    submittedAt = null
    outputAfterSubmit = false
    if (timer) clearTimeout(timer)
    timer = null
    return true
  }

  const check = async () => {
    timer = null
    if (!submittedAt || !outputAfterSubmit || checking || disposed) return
    checking = true

    try {
      if (Date.now() - submittedAt > maxTurnMs) {
        claimTurn()
        return
      }

      const screen = await options.captureScreen()
      // The turn may have been completed externally while the capture was in
      // flight; claimTurn() below then fails and no second commit happens.
      if (submittedAt && !isProviderTurnComplete(options.provider, screen)) {
        schedule()
        return
      }

      if (!claimTurn()) return
      await options.onComplete()
    } catch (error) {
      options.onError?.(error)
    } finally {
      checking = false
    }
  }

  return {
    submitted() {
      if (disposed || submittedAt) return
      submittedAt = Date.now()
      outputAfterSubmit = false
      schedule()
    },
    output() {
      if (!submittedAt || disposed) return
      outputAfterSubmit = true
      schedule()
    },
    async complete() {
      if (disposed || !claimTurn()) return
      try {
        await options.onComplete()
      } catch (error) {
        options.onError?.(error)
      }
    },
    dispose() {
      disposed = true
      if (timer) clearTimeout(timer)
      timer = null
    }
  }
}
