/**
 * Minimal in-process async mutex keyed by string.
 *
 * Serializes async operations that share mutable state (e.g. git operations on
 * the same repository) so concurrent requests cannot interleave and corrupt the
 * working tree / index. Each key owns an independent promise chain.
 */

const chains = new Map<string, Promise<unknown>>()

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve()
  // Swallow the predecessor's result/rejection so one failure does not poison
  // the chain for subsequent waiters.
  const run = previous.catch(() => undefined).then(fn)
  chains.set(key, run)
  // Only clear when this run is still the tail — avoids dropping a newer task.
  // Use then(onFulfilled, onRejected) rather than finally() so the cleanup's
  // derived promise settles fulfilled and never surfaces as an unhandled
  // rejection; the original `run` is returned for the caller to handle.
  const settle = () => {
    if (chains.get(key) === run) {
      chains.delete(key)
    }
  }
  run.then(settle, settle)
  return run
}
