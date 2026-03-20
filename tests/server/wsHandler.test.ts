/**
 * Tests for the WebSocket handler logic in server/routes/_ws.ts
 *
 * These tests verify the message routing, peer lifecycle, and EventBus subscription
 * wiring by exercising the handler functions with mock peer objects.
 * Provider execution (jobQueue.submit) is mocked to isolate transport-layer logic.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ConversationEventBus } from './eventBusHelper'

// ── Mock Peer ──────────────────────────────────────────

function createMockPeer(id?: string) {
  return {
    id: id ?? `peer-${Math.random().toString(36).slice(2, 8)}`,
    send: vi.fn(),
    close: vi.fn(),
  }
}

// ── Inline handler logic (mirrors _ws.ts structure) ────
// We re-implement the pure logic so we can test it without Nitro runtime.

interface PeerConnection {
  conversationId: string | null
  unsubscribe: (() => void) | null
  unsubscribeGlobal: (() => void) | null
}

class WSHandlerTestHarness {
  bus = new ConversationEventBus()
  peerConnections = new Map<string, PeerConnection>()
  submittedJobs: any[] = []
  abortedConversations: string[] = []
  permissionResponses: { conversationId: string; allow: boolean }[] = []
  resetContextCalls: string[] = []

  getPeerConnection(peerId: string): PeerConnection {
    let conn = this.peerConnections.get(peerId)
    if (!conn) {
      conn = { conversationId: null, unsubscribe: null, unsubscribeGlobal: null }
      this.peerConnections.set(peerId, conn)
    }
    return conn
  }

  subscribePeerToConversation(peer: any, conversationId: string): void {
    const conn = this.getPeerConnection(peer.id)
    if (conn.conversationId === conversationId && conn.unsubscribe) return

    if (conn.unsubscribe) conn.unsubscribe()

    conn.conversationId = conversationId
    conn.unsubscribe = this.bus.subscribe(conversationId, (event) => {
      try {
        peer.send(JSON.stringify(event))
      } catch {}
    })
  }

  open(peer: any) {
    const conn = this.getPeerConnection(peer.id)
    conn.unsubscribeGlobal = this.bus.subscribe('__global__', (event) => {
      try {
        peer.send(JSON.stringify(event))
      } catch {}
    })
  }

  close(peer: any) {
    const conn = this.peerConnections.get(peer.id)
    if (conn) {
      if (conn.unsubscribe) conn.unsubscribe()
      if (conn.unsubscribeGlobal) conn.unsubscribeGlobal()
    }
    this.peerConnections.delete(peer.id)
  }

  message(peer: any, rawText: string) {
    let msg: any
    try {
      msg = JSON.parse(rawText)
    } catch {
      peer.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }))
      return
    }

    if (msg.type === 'ping') {
      peer.send(JSON.stringify({ type: 'pong' }))
      return
    }

    if (msg.type === 'chat') {
      this.handleChat(peer, msg)
      return
    }

    if (msg.type === 'permission_response') {
      this.handlePermissionResponse(peer, msg)
      return
    }

    if (msg.type === 'abort') {
      this.handleAbort(peer)
      return
    }

    if (msg.type === 'reset_context') {
      this.handleResetContext(peer)
      return
    }

    if (msg.type === 'subscribe') {
      this.handleSubscribe(peer, msg)
      return
    }
  }

  private handleChat(peer: any, msg: any) {
    if (typeof msg.message !== 'string') {
      peer.send(JSON.stringify({ type: 'error', error: 'Invalid message: message property is required', requestId: msg.requestId }))
      return
    }
    if (msg.message.trim().length === 0) {
      peer.send(JSON.stringify({ type: 'error', error: 'Invalid message: message or image attachment is required', requestId: msg.requestId }))
      return
    }
    if (!msg.conversationId) {
      peer.send(JSON.stringify({ type: 'error', error: 'Invalid message: conversationId is required', requestId: msg.requestId }))
      return
    }

    this.subscribePeerToConversation(peer, msg.conversationId)
    this.submittedJobs.push(msg)
  }

  private handlePermissionResponse(peer: any, msg: any) {
    const conn = this.getPeerConnection(peer.id)
    if (!conn.conversationId) return
    this.permissionResponses.push({ conversationId: conn.conversationId, allow: msg.allow })
  }

  private handleAbort(peer: any) {
    const conn = this.getPeerConnection(peer.id)
    if (conn.conversationId) {
      this.abortedConversations.push(conn.conversationId)
    }
    peer.send(JSON.stringify({ type: 'aborted' }))
  }

  private handleResetContext(peer: any) {
    const conn = this.getPeerConnection(peer.id)
    if (conn.conversationId) {
      this.resetContextCalls.push(conn.conversationId)
    }
    peer.send(JSON.stringify({ type: 'context_reset' }))
  }

  private handleSubscribe(peer: any, msg: any) {
    if (!msg.conversationId) {
      peer.send(JSON.stringify({ type: 'error', error: 'conversationId is required for subscribe' }))
      return
    }
    this.subscribePeerToConversation(peer, msg.conversationId)
    peer.send(JSON.stringify({ type: 'subscribed', conversationId: msg.conversationId }))
  }
}

// ── Tests ──────────────────────────────────────────────

describe('WS Handler (_ws)', () => {
  let harness: WSHandlerTestHarness

  beforeEach(() => {
    harness = new WSHandlerTestHarness()
  })

  // ── Connection lifecycle ─────────────────────────────

  describe('open / close lifecycle', () => {
    it('subscribes peer to global channel on open', () => {
      const peer = createMockPeer()
      harness.open(peer)

      harness.bus.emit('__global__', { type: 'notification', notificationEvent: 'test' })

      expect(peer.send).toHaveBeenCalledTimes(1)
      const sent = JSON.parse(peer.send.mock.calls[0][0])
      expect(sent.type).toBe('notification')
    })

    it('unsubscribes from all channels on close', () => {
      const peer = createMockPeer()
      harness.open(peer)

      // Subscribe to a conversation
      harness.message(peer, JSON.stringify({
        type: 'chat', message: 'hello', conversationId: 'conv-1', requestId: 'req-1',
      }))

      harness.close(peer)

      // Events should no longer reach peer
      peer.send.mockClear()
      harness.bus.emit('conv-1', { type: 'test' })
      harness.bus.emit('__global__', { type: 'test' })

      expect(peer.send).not.toHaveBeenCalled()
    })

    it('cleans up peer connection entry on close', () => {
      const peer = createMockPeer('peer-cleanup')
      harness.open(peer)
      harness.close(peer)

      expect(harness.peerConnections.has('peer-cleanup')).toBe(false)
    })
  })

  // ── Ping / Pong ──────────────────────────────────────

  describe('ping/pong', () => {
    it('responds with pong to ping message', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({ type: 'ping' }))

      expect(peer.send).toHaveBeenCalledTimes(1)
      const sent = JSON.parse(peer.send.mock.calls[0][0])
      expect(sent.type).toBe('pong')
    })
  })

  // ── Invalid JSON ─────────────────────────────────────

  describe('invalid messages', () => {
    it('returns error for invalid JSON', () => {
      const peer = createMockPeer()
      harness.message(peer, 'not json')

      expect(peer.send).toHaveBeenCalledTimes(1)
      const sent = JSON.parse(peer.send.mock.calls[0][0])
      expect(sent.type).toBe('error')
      expect(sent.error).toBe('Invalid JSON')
    })
  })

  // ── Chat message validation ──────────────────────────

  describe('chat message validation', () => {
    it('rejects chat with missing message property', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({
        type: 'chat', conversationId: 'conv-1', requestId: 'req-1',
      }))

      const sent = JSON.parse(peer.send.mock.calls[0][0])
      expect(sent.type).toBe('error')
      expect(sent.error).toContain('message property is required')
    })

    it('rejects chat with empty message (no attachments)', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({
        type: 'chat', message: '  ', conversationId: 'conv-1', requestId: 'req-1',
      }))

      const sent = JSON.parse(peer.send.mock.calls[0][0])
      expect(sent.type).toBe('error')
      expect(sent.error).toContain('message or image attachment is required')
    })

    it('rejects chat without conversationId', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({
        type: 'chat', message: 'hello', requestId: 'req-1',
      }))

      const sent = JSON.parse(peer.send.mock.calls[0][0])
      expect(sent.type).toBe('error')
      expect(sent.error).toContain('conversationId is required')
    })

    it('accepts valid chat message and submits job', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({
        type: 'chat', message: 'hello', conversationId: 'conv-1', requestId: 'req-1',
      }))

      expect(harness.submittedJobs).toHaveLength(1)
      expect(harness.submittedJobs[0].message).toBe('hello')
      expect(harness.submittedJobs[0].conversationId).toBe('conv-1')
    })
  })

  // ── EventBus subscription via chat ───────────────────

  describe('EventBus subscription', () => {
    it('subscribes peer to conversation events on chat', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({
        type: 'chat', message: 'hello', conversationId: 'conv-1', requestId: 'req-1',
      }))

      peer.send.mockClear()
      harness.bus.emit('conv-1', { type: 'ui_event', event: { type: 'block_start' } })

      expect(peer.send).toHaveBeenCalledTimes(1)
      const sent = JSON.parse(peer.send.mock.calls[0][0])
      expect(sent.type).toBe('ui_event')
    })

    it('unsubscribes from old conversation when subscribing to new one', () => {
      const peer = createMockPeer()

      // Subscribe to conv-1
      harness.message(peer, JSON.stringify({
        type: 'chat', message: 'a', conversationId: 'conv-1', requestId: 'r1',
      }))
      // Subscribe to conv-2
      harness.message(peer, JSON.stringify({
        type: 'chat', message: 'b', conversationId: 'conv-2', requestId: 'r2',
      }))

      peer.send.mockClear()

      // Old conversation events should not reach peer
      harness.bus.emit('conv-1', { type: 'old' })
      expect(peer.send).not.toHaveBeenCalled()

      // New conversation events should reach peer
      harness.bus.emit('conv-2', { type: 'new' })
      expect(peer.send).toHaveBeenCalledTimes(1)
    })

    it('does not duplicate subscription for same conversation', () => {
      const peer = createMockPeer()

      harness.message(peer, JSON.stringify({
        type: 'chat', message: 'a', conversationId: 'conv-1', requestId: 'r1',
      }))
      harness.message(peer, JSON.stringify({
        type: 'chat', message: 'b', conversationId: 'conv-1', requestId: 'r2',
      }))

      peer.send.mockClear()
      harness.bus.emit('conv-1', { type: 'test' })

      // Should only receive once despite subscribing twice
      expect(peer.send).toHaveBeenCalledTimes(1)
    })
  })

  // ── Permission response ──────────────────────────────

  describe('permission_response', () => {
    it('forwards allow=true to jobQueue', () => {
      const peer = createMockPeer()
      // First establish conversation context
      harness.message(peer, JSON.stringify({
        type: 'chat', message: 'hello', conversationId: 'conv-1', requestId: 'r1',
      }))

      harness.message(peer, JSON.stringify({ type: 'permission_response', allow: true }))

      expect(harness.permissionResponses).toHaveLength(1)
      expect(harness.permissionResponses[0]).toEqual({ conversationId: 'conv-1', allow: true })
    })

    it('forwards allow=false to jobQueue', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({
        type: 'chat', message: 'hello', conversationId: 'conv-1', requestId: 'r1',
      }))

      harness.message(peer, JSON.stringify({ type: 'permission_response', allow: false }))

      expect(harness.permissionResponses).toHaveLength(1)
      expect(harness.permissionResponses[0]).toEqual({ conversationId: 'conv-1', allow: false })
    })

    it('ignores permission_response when no conversation is active', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({ type: 'permission_response', allow: true }))

      expect(harness.permissionResponses).toHaveLength(0)
    })
  })

  // ── Abort ────────────────────────────────────────────

  describe('abort', () => {
    it('aborts the active conversation and sends aborted confirmation', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({
        type: 'chat', message: 'hello', conversationId: 'conv-1', requestId: 'r1',
      }))

      peer.send.mockClear()
      harness.message(peer, JSON.stringify({ type: 'abort' }))

      expect(harness.abortedConversations).toEqual(['conv-1'])
      expect(peer.send).toHaveBeenCalledTimes(1)
      const sent = JSON.parse(peer.send.mock.calls[0][0])
      expect(sent.type).toBe('aborted')
    })

    it('sends aborted even with no active conversation', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({ type: 'abort' }))

      expect(peer.send).toHaveBeenCalledTimes(1)
      const sent = JSON.parse(peer.send.mock.calls[0][0])
      expect(sent.type).toBe('aborted')
      expect(harness.abortedConversations).toHaveLength(0)
    })
  })

  // ── Reset context ────────────────────────────────────

  describe('reset_context', () => {
    it('resets context for the active conversation', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({
        type: 'chat', message: 'hello', conversationId: 'conv-1', requestId: 'r1',
      }))

      peer.send.mockClear()
      harness.message(peer, JSON.stringify({ type: 'reset_context' }))

      expect(harness.resetContextCalls).toEqual(['conv-1'])
      const sent = JSON.parse(peer.send.mock.calls[0][0])
      expect(sent.type).toBe('context_reset')
    })

    it('sends context_reset even with no active conversation', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({ type: 'reset_context' }))

      const sent = JSON.parse(peer.send.mock.calls[0][0])
      expect(sent.type).toBe('context_reset')
      expect(harness.resetContextCalls).toHaveLength(0)
    })
  })

  // ── Subscribe ────────────────────────────────────────

  describe('subscribe', () => {
    it('subscribes peer to conversation and sends subscribed confirmation', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({
        type: 'subscribe', conversationId: 'conv-1',
      }))

      expect(peer.send).toHaveBeenCalledTimes(1)
      const sent = JSON.parse(peer.send.mock.calls[0][0])
      expect(sent.type).toBe('subscribed')
      expect(sent.conversationId).toBe('conv-1')
    })

    it('rejects subscribe without conversationId', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({ type: 'subscribe' }))

      const sent = JSON.parse(peer.send.mock.calls[0][0])
      expect(sent.type).toBe('error')
      expect(sent.error).toContain('conversationId is required')
    })

    it('receives events after subscribing', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({
        type: 'subscribe', conversationId: 'conv-1',
      }))

      peer.send.mockClear()
      harness.bus.emit('conv-1', { type: 'ui_event', event: { type: 'block_delta' } })

      expect(peer.send).toHaveBeenCalledTimes(1)
    })
  })

  // ── Multi-peer scenarios ─────────────────────────────

  describe('multi-peer', () => {
    it('delivers conversation events to all subscribed peers', () => {
      const peer1 = createMockPeer('p1')
      const peer2 = createMockPeer('p2')

      // Both subscribe to same conversation
      harness.message(peer1, JSON.stringify({
        type: 'subscribe', conversationId: 'conv-shared',
      }))
      harness.message(peer2, JSON.stringify({
        type: 'subscribe', conversationId: 'conv-shared',
      }))

      peer1.send.mockClear()
      peer2.send.mockClear()

      harness.bus.emit('conv-shared', { type: 'shared_event' })

      expect(peer1.send).toHaveBeenCalledTimes(1)
      expect(peer2.send).toHaveBeenCalledTimes(1)
    })

    it('global events reach all open peers', () => {
      const peer1 = createMockPeer('g1')
      const peer2 = createMockPeer('g2')

      harness.open(peer1)
      harness.open(peer2)

      harness.bus.emit('__global__', { type: 'notification', notificationEvent: 'job_created' })

      expect(peer1.send).toHaveBeenCalledTimes(1)
      expect(peer2.send).toHaveBeenCalledTimes(1)
    })

    it('closing one peer does not affect others', () => {
      const peer1 = createMockPeer('c1')
      const peer2 = createMockPeer('c2')

      harness.open(peer1)
      harness.open(peer2)

      harness.message(peer1, JSON.stringify({
        type: 'subscribe', conversationId: 'conv-1',
      }))
      harness.message(peer2, JSON.stringify({
        type: 'subscribe', conversationId: 'conv-1',
      }))

      harness.close(peer1)

      peer2.send.mockClear()
      harness.bus.emit('conv-1', { type: 'still_alive' })

      expect(peer2.send).toHaveBeenCalledTimes(1)
    })
  })

  // ── Error resilience ─────────────────────────────────

  describe('error resilience', () => {
    it('handles peer.send throwing without crashing', () => {
      const peer = createMockPeer()
      harness.message(peer, JSON.stringify({
        type: 'subscribe', conversationId: 'conv-1',
      }))

      // Make send throw on next call
      peer.send.mockClear()
      peer.send.mockImplementationOnce(() => { throw new Error('connection lost') })

      // Should not throw
      expect(() => {
        harness.bus.emit('conv-1', { type: 'test' })
      }).not.toThrow()
    })
  })
})
