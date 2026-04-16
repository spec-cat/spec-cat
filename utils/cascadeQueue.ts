export interface CascadeEntry {
  featureId: string
  queue: string[]
}

/**
 * Per-conversation cascade step registry.
 *
 * A cascade entry holds the featureId and a FIFO queue of step names
 * remaining to send. Each entry is keyed by conversationId so independent
 * cascades across conversations don't interact.
 *
 * The registry is a thin wrapper around a Map — no side effects, no IO.
 * WebSocket or chat store interaction stays in the consumer.
 */
export function createCascadeRegistry() {
  const entries = new Map<string, CascadeEntry>()

  function enable(conversationId: string, featureId: string, remainingSteps: string[]): void {
    entries.set(conversationId, {
      featureId,
      queue: [...remainingSteps],
    })
  }

  function disable(conversationId?: string): void {
    if (conversationId) {
      entries.delete(conversationId)
    } else {
      entries.clear()
    }
  }

  function get(conversationId: string): CascadeEntry | undefined {
    return entries.get(conversationId)
  }

  /**
   * Pop the next step for a conversation's cascade, or null when the queue
   * is empty/absent. Deletes the entry when the queue drains.
   */
  function popNextStep(conversationId: string): { featureId: string; step: string } | null {
    const entry = entries.get(conversationId)
    if (!entry || entry.queue.length === 0) return null
    const step = entry.queue.shift()!
    if (entry.queue.length === 0) {
      entries.delete(conversationId)
    }
    return { featureId: entry.featureId, step }
  }

  function has(conversationId: string): boolean {
    return entries.has(conversationId)
  }

  function size(): number {
    return entries.size
  }

  return { enable, disable, get, popNextStep, has, size }
}

export type CascadeRegistry = ReturnType<typeof createCascadeRegistry>
