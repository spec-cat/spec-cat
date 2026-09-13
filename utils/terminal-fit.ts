export const TERMINAL_SETTLE_DELAYS = [50, 150, 350] as const

type Timer = ReturnType<typeof setTimeout>

/** Owns the replaceable fit timer/frame and the fixed post-layout settle sequence. */
export function createTerminalFitScheduler(
  performFit: () => void,
  clock?: {
    setTimeout: (callback: () => void, delay: number) => Timer
    clearTimeout: (timer: Timer) => void
    requestAnimationFrame: (callback: () => void) => number
    cancelAnimationFrame: (frame: number) => void
  }
) {
  const schedulerClock = clock || {
    // Browser timer/animation functions are receiver-sensitive in some
    // engines. Invoke them through globalThis instead of storing bare methods,
    // which would receive this scheduler object as `this`.
    setTimeout: (callback: () => void, delay: number) => globalThis.setTimeout(callback, delay),
    clearTimeout: (timer: Timer) => globalThis.clearTimeout(timer),
    requestAnimationFrame: (callback: () => void) => globalThis.requestAnimationFrame(callback),
    cancelAnimationFrame: (frame: number) => globalThis.cancelAnimationFrame(frame)
  }
  let fitFrame: number | null = null
  let fitTimer: Timer | null = null
  const settleTimers = new Set<Timer>()

  function schedule(delay = 0) {
    if (fitTimer) schedulerClock.clearTimeout(fitTimer)
    if (fitFrame !== null) schedulerClock.cancelAnimationFrame(fitFrame)
    fitTimer = schedulerClock.setTimeout(() => {
      fitTimer = null
      fitFrame = schedulerClock.requestAnimationFrame(() => {
        fitFrame = null
        performFit()
      })
    }, delay)
  }

  function settle() {
    for (const timer of settleTimers) schedulerClock.clearTimeout(timer)
    settleTimers.clear()
    schedule()
    for (const delay of TERMINAL_SETTLE_DELAYS) {
      const timer = schedulerClock.setTimeout(() => {
        settleTimers.delete(timer)
        schedule()
      }, delay)
      settleTimers.add(timer)
    }
  }

  function dispose() {
    if (fitFrame !== null) schedulerClock.cancelAnimationFrame(fitFrame)
    if (fitTimer) schedulerClock.clearTimeout(fitTimer)
    for (const timer of settleTimers) schedulerClock.clearTimeout(timer)
    settleTimers.clear()
    fitFrame = null
    fitTimer = null
  }

  return { schedule, settle, dispose }
}
