import { describe, expect, it } from 'vitest'
import {
  checkExistingConnection,
  createConnectionState,
  isStaleConnection,
  type ConnectionState,
} from '~/utils/wsConnectionState'

function mockWs(readyState: number = WebSocket.OPEN): WebSocket {
  return { readyState } as WebSocket
}

describe('createConnectionState', () => {
  it('builds an empty connection state with the given ws/conversationId', () => {
    const ws = mockWs()
    const state = createConnectionState(ws, 'conv-1', () => 1000)
    expect(state).toMatchObject({
      ws,
      conversationId: 'conv-1',
      currentMessageId: '',
      currentTextBlockId: null,
      currentThinkingBlockId: null,
      healthCheckInterval: null,
      lastMessageTime: 1000,
      lastServerError: null,
      lastSocketError: null,
      isReplaying: false,
      replayBuffer: [],
    })
    expect(state.activeTools.size).toBe(0)
  })

  it('uses Date.now() as default clock', () => {
    const before = Date.now()
    const state = createConnectionState(mockWs(), 'c1')
    const after = Date.now()
    expect(state.lastMessageTime).toBeGreaterThanOrEqual(before)
    expect(state.lastMessageTime).toBeLessThanOrEqual(after)
  })
})

describe('isStaleConnection', () => {
  const ws1 = mockWs()
  const ws2 = mockWs()

  it('returns false when the pool has no entry for the conversation', () => {
    const pool = new Map<string, ConnectionState>()
    expect(isStaleConnection(pool, 'c1', ws1)).toBe(false)
  })

  it('returns false when the pool entry matches the ws', () => {
    const pool = new Map<string, ConnectionState>([['c1', createConnectionState(ws1, 'c1')]])
    expect(isStaleConnection(pool, 'c1', ws1)).toBe(false)
  })

  it('returns true when the pool holds a different ws for the conversation', () => {
    const pool = new Map<string, ConnectionState>([['c1', createConnectionState(ws2, 'c1')]])
    expect(isStaleConnection(pool, 'c1', ws1)).toBe(true)
  })
})

describe('checkExistingConnection', () => {
  it('returns none when the pool is empty', () => {
    const pool = new Map<string, ConnectionState>()
    expect(checkExistingConnection(pool, 'c1')).toEqual({ kind: 'none' })
  })

  it('returns open when the ws is OPEN', () => {
    const ws = mockWs(WebSocket.OPEN)
    const conn = createConnectionState(ws, 'c1')
    const pool = new Map([['c1', conn]])
    const result = checkExistingConnection(pool, 'c1')
    expect(result.kind).toBe('open')
    if (result.kind === 'open') expect(result.conn).toBe(conn)
  })

  it('returns stale when the ws is closing/closed/connecting', () => {
    for (const rs of [WebSocket.CONNECTING, WebSocket.CLOSING, WebSocket.CLOSED]) {
      const conn = createConnectionState(mockWs(rs), 'c1')
      const pool = new Map([['c1', conn]])
      const result = checkExistingConnection(pool, 'c1')
      expect(result.kind).toBe('stale')
    }
  })
})
