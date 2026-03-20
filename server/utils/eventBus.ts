/**
 * Conversation-level event pub/sub singleton.
 * Decouples AI provider execution from WebSocket transport.
 * Multiple subscribers per conversation are supported (multi-tab, scheduler observer, etc.).
 */

export interface JobEvent {
  type: string
  [key: string]: unknown
}

type EventCallback = (event: JobEvent) => void

class ConversationEventBus {
  private subscribers = new Map<string, Set<EventCallback>>()

  /**
   * Emit an event to all subscribers of a conversation.
   */
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

  /**
   * Subscribe to events for a conversation.
   * Returns an unsubscribe function.
   */
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

  /**
   * Check if a conversation has any active subscribers.
   */
  hasSubscribers(conversationId: string): boolean {
    const subs = this.subscribers.get(conversationId)
    return !!subs && subs.size > 0
  }
}

export const eventBus = new ConversationEventBus()
