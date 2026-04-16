/**
 * A per-key debounced save scheduler.
 *
 * Multiple calls to `schedule(key)` during the debounce window coalesce
 * into a single flush; `flush(key)` cancels any pending timer and runs
 * the callback immediately. `cancel(key)` drops the pending timer
 * without flushing.
 *
 * Caller supplies `onFlush(key)` which performs the actual save. The
 * scheduler has no knowledge of the payload — it only manages timers.
 */
export interface SaveScheduler {
  schedule(key: string): void
  flush(key: string): void
  cancel(key: string): void
  cancelAll(): void
  hasPending(key: string): boolean
  pendingCount(): number
}

export interface SaveSchedulerOptions {
  onFlush: (key: string) => void
  delayMs: number
  setTimer?: typeof setTimeout
  clearTimer?: typeof clearTimeout
}

export function createSaveScheduler(options: SaveSchedulerOptions): SaveScheduler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const setTimer = options.setTimer ?? setTimeout
  const clearTimer = options.clearTimer ?? clearTimeout

  function schedule(key: string): void {
    // If a flush is already queued for this key, let it run — coalesce.
    if (timers.has(key)) return
    const timer = setTimer(() => {
      timers.delete(key)
      options.onFlush(key)
    }, options.delayMs)
    timers.set(key, timer)
  }

  function flush(key: string): void {
    const timer = timers.get(key)
    if (timer) {
      clearTimer(timer)
      timers.delete(key)
    }
    options.onFlush(key)
  }

  function cancel(key: string): void {
    const timer = timers.get(key)
    if (timer) {
      clearTimer(timer)
      timers.delete(key)
    }
  }

  function cancelAll(): void {
    for (const timer of timers.values()) clearTimer(timer)
    timers.clear()
  }

  return {
    schedule,
    flush,
    cancel,
    cancelAll,
    hasPending: (key) => timers.has(key),
    pendingCount: () => timers.size,
  }
}
