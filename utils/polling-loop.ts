export type PollingScheduler = {
  set: (callback: () => void, intervalMs: number) => ReturnType<typeof setInterval>
  clear: (timer: ReturnType<typeof setInterval>) => void
}

const browserScheduler: PollingScheduler = {
  set: (callback, intervalMs) => setInterval(callback, intervalMs),
  clear: (timer) => clearInterval(timer)
}

/** Idempotent ownership wrapper for interval-based refresh loops. */
export function createPollingLoop(
  callback: () => void,
  intervalMs: number,
  scheduler: PollingScheduler = browserScheduler
) {
  let timer: ReturnType<typeof setInterval> | null = null
  return {
    start() {
      if (timer) return
      timer = scheduler.set(callback, intervalMs)
    },
    stop() {
      if (!timer) return
      scheduler.clear(timer)
      timer = null
    },
    isRunning: () => timer !== null
  }
}
