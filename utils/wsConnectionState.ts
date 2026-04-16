import type { ContentBlock } from '~/types/chat'
import type { ActiveToolEntry } from '~/utils/eventBlockFactories'

/**
 * Minimal WebSocket response envelope buffered during replay windows.
 * The reducer cares about these shape bits only; the full type lives with
 * the composable.
 */
export interface BufferedResponse {
  type: string
  event?: unknown
  denied?: boolean
}

export interface ConnectionState<T extends BufferedResponse = BufferedResponse> {
  ws: WebSocket
  currentMessageId: string
  conversationId: string
  activeTools: Map<number, ActiveToolEntry>
  currentTextBlockId: string | null
  currentThinkingBlockId: string | null
  healthCheckInterval: ReturnType<typeof setInterval> | null
  lastMessageTime: number
  lastServerError: string | null
  lastSocketError: string | null
  /** Replay buffering: accumulate events during replay_start → replay_end */
  isReplaying: boolean
  replayBuffer: T[]
}

/**
 * Factory for the per-conversation connection state container. Keeps the
 * large initializer literal out of the composable.
 */
export function createConnectionState<T extends BufferedResponse>(
  ws: WebSocket,
  conversationId: string,
  now: () => number = Date.now,
): ConnectionState<T> {
  return {
    ws,
    currentMessageId: '',
    conversationId,
    activeTools: new Map(),
    currentTextBlockId: null,
    currentThinkingBlockId: null,
    healthCheckInterval: null,
    lastMessageTime: now(),
    lastServerError: null,
    lastSocketError: null,
    isReplaying: false,
    replayBuffer: [],
  }
}

/**
 * A stale connection is one whose socket has been replaced in the pool
 * (e.g. a new message was sent after abort). The outgoing close/error
 * events on the old socket must not touch the new connection's state.
 */
export function isStaleConnection<T extends BufferedResponse>(
  pool: ReadonlyMap<string, ConnectionState<T>>,
  conversationId: string,
  ws: WebSocket,
): boolean {
  const conn = pool.get(conversationId)
  return !!conn && conn.ws !== ws
}

/**
 * Check for an existing *open* connection. When false, the caller should
 * spin up a new WebSocket. Any existing-but-closed connection is returned
 * via the `stale` branch so the caller can close/evict it.
 */
export function checkExistingConnection<T extends BufferedResponse>(
  pool: ReadonlyMap<string, ConnectionState<T>>,
  conversationId: string,
): { kind: 'open'; conn: ConnectionState<T> } | { kind: 'stale'; conn: ConnectionState<T> } | { kind: 'none' } {
  const existing = pool.get(conversationId)
  if (!existing) return { kind: 'none' }
  if (existing.ws.readyState === WebSocket.OPEN) return { kind: 'open', conn: existing }
  return { kind: 'stale', conn: existing }
}
