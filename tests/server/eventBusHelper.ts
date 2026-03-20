/**
 * Re-implementation of ConversationEventBus for isolated testing.
 * Mirrors the production class in ~/server/utils/eventBus.ts exactly,
 * but allows constructing fresh instances per test without importing
 * the module-level singleton.
 */

export interface JobEvent {
  type: string
  [key: string]: unknown
}

type EventCallback = (event: JobEvent) => void

export class ConversationEventBus {
  private subscribers = new Map<string, Set<EventCallback>>()

  emit(conversationId: string, event: JobEvent): void {
    const subs = this.subscribers.get(conversationId)
    if (!subs) return
    for (const callback of subs) {
      try {
        callback(event)
      } catch (err) {
        console.error('[EventBus] Subscriber error:', err)
      }
    }
  }

  subscribe(conversationId: string, callback: EventCallback): () => void {
    let subs = this.subscribers.get(conversationId)
    if (!subs) {
      subs = new Set()
      this.subscribers.set(conversationId, subs)
    }
    subs.add(callback)

    return () => {
      subs!.delete(callback)
      if (subs!.size === 0) {
        this.subscribers.delete(conversationId)
      }
    }
  }

  hasSubscribers(conversationId: string): boolean {
    const subs = this.subscribers.get(conversationId)
    return !!subs && subs.size > 0
  }
}
