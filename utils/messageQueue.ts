import type { ChatImageAttachment } from '~/types/chat'

export interface QueuedMessage {
  id: string
  text: string
  attachments: ChatImageAttachment[]
}

/**
 * Produce a unique queued-message id. Deterministic variants of now()/random()
 * make the result testable.
 */
export function createQueuedMessageId(
  now: () => number = Date.now,
  random: () => number = Math.random,
): string {
  return `q-${now()}-${random().toString(36).slice(2, 8)}`
}

/**
 * Build a queued message from a draft (text + attachments). Returns null
 * when both are empty — the queue rejects fully-empty drafts.
 */
export function buildQueuedMessage(
  draft: { text: string; attachments: readonly ChatImageAttachment[] },
  makeId: () => string = createQueuedMessageId,
): QueuedMessage | null {
  const text = draft.text.trim()
  if (text.length === 0 && draft.attachments.length === 0) return null
  return {
    id: makeId(),
    text,
    attachments: [...draft.attachments],
  }
}

/**
 * Remove an entry from a queue by id. Pure — returns a new array.
 */
export function removeFromQueue<T extends { id: string }>(queue: readonly T[], id: string): T[] {
  return queue.filter((m) => m.id !== id)
}
