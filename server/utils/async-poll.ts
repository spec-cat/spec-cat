export type AsyncPollOptions = {
  intervalMs: number
  deadline?: number
  signal?: AbortSignal
  abortedMessage?: string
  check: () => boolean | Promise<boolean>
}

/** Repeats an async check without overlapping calls until it succeeds or expires. */
export async function pollUntil(options: AsyncPollOptions): Promise<boolean> {
  const deadline = options.deadline ?? Number.POSITIVE_INFINITY
  while (Date.now() < deadline) {
    throwIfAborted(options.signal, options.abortedMessage)
    if (await options.check()) return true
    await pollingDelay(options.intervalMs, options.signal, options.abortedMessage)
  }
  return false
}

export function pollingDelay(ms: number, signal?: AbortSignal, abortedMessage?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error(abortedMessage || 'Polling aborted'))
    const timer = setTimeout(settle, ms)
    timer.unref?.()
    signal?.addEventListener('abort', abort, { once: true })

    function settle() {
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    function abort() {
      clearTimeout(timer)
      reject(new Error(abortedMessage || 'Polling aborted'))
    }
  })
}

function throwIfAborted(signal?: AbortSignal, message?: string) {
  if (signal?.aborted) throw new Error(message || 'Polling aborted')
}
