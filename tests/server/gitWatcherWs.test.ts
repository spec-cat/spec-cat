/**
 * Tests for the git-watcher-ws WebSocket handler logic.
 *
 * The handler uses a peer state map and delegates to subscribeGitChanges().
 * We test the message routing and peer lifecycle with a test harness that
 * mirrors the handler structure without requiring chokidar/filesystem.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mock Peer ──────────────────────────────────────────

function createMockPeer(id?: string) {
  return {
    id: id ?? `peer-${Math.random().toString(36).slice(2, 8)}`,
    send: vi.fn(),
  }
}

// ── Test harness that mirrors git-watcher-ws.ts logic ──

type ChangeCallback = (workingDirectory: string) => void

class GitWatcherTestHarness {
  peerState = new Map<string, {
    unsubscribe: (() => void) | null
    workingDirectory: string | null
  }>()

  // Track subscriptions for verification
  subscriptions: { workingDirectory: string; callback: ChangeCallback }[] = []
  unsubscribeCalls: string[] = []

  // Mock subscribeGitChanges
  subscribeGitChanges(workingDirectory: string, callback: ChangeCallback): () => void {
    this.subscriptions.push({ workingDirectory, callback })

    return () => {
      this.unsubscribeCalls.push(workingDirectory)
    }
  }

  open(peer: any) {
    this.peerState.set(peer.id, { unsubscribe: null, workingDirectory: null })
  }

  close(peer: any) {
    const state = this.peerState.get(peer.id)
    if (state?.unsubscribe) {
      state.unsubscribe()
    }
    this.peerState.delete(peer.id)
  }

  message(peer: any, rawText: string) {
    try {
      const msg = JSON.parse(rawText)

      if (msg.type === 'ping') {
        peer.send(JSON.stringify({ type: 'pong' }))
        return
      }

      if (msg.type === 'watch' && typeof msg.workingDirectory === 'string') {
        const state = this.peerState.get(peer.id)
        if (!state) return

        // Unsubscribe from previous directory
        if (state.unsubscribe) {
          state.unsubscribe()
        }

        state.workingDirectory = msg.workingDirectory
        state.unsubscribe = this.subscribeGitChanges(msg.workingDirectory, (dir) => {
          try {
            peer.send(JSON.stringify({ type: 'git_changed', workingDirectory: dir }))
          } catch {}
        })
      }
    } catch {
      // Ignore invalid messages
    }
  }

  // Simulate a file change event for a watched directory
  simulateChange(workingDirectory: string) {
    for (const sub of this.subscriptions) {
      if (sub.workingDirectory === workingDirectory) {
        sub.callback(workingDirectory)
      }
    }
  }
}

// ── Tests ──────────────────────────────────────────────

describe('git-watcher-ws handler', () => {
  let harness: GitWatcherTestHarness

  beforeEach(() => {
    harness = new GitWatcherTestHarness()
  })

  // ── Open / Close lifecycle ───────────────────────────

  describe('peer lifecycle', () => {
    it('initializes peer state on open', () => {
      const peer = createMockPeer('p1')
      harness.open(peer)

      expect(harness.peerState.has('p1')).toBe(true)
      expect(harness.peerState.get('p1')!.workingDirectory).toBeNull()
      expect(harness.peerState.get('p1')!.unsubscribe).toBeNull()
    })

    it('cleans up peer state on close', () => {
      const peer = createMockPeer('p1')
      harness.open(peer)
      harness.close(peer)

      expect(harness.peerState.has('p1')).toBe(false)
    })

    it('calls unsubscribe on close if watching', () => {
      const peer = createMockPeer('p1')
      harness.open(peer)
      harness.message(peer, JSON.stringify({ type: 'watch', workingDirectory: '/repo' }))

      harness.close(peer)

      expect(harness.unsubscribeCalls).toContain('/repo')
    })

    it('does not call unsubscribe on close if not watching', () => {
      const peer = createMockPeer('p1')
      harness.open(peer)
      harness.close(peer)

      expect(harness.unsubscribeCalls).toHaveLength(0)
    })
  })

  // ── Ping / Pong ──────────────────────────────────────

  describe('ping/pong', () => {
    it('responds with pong to ping', () => {
      const peer = createMockPeer()
      harness.open(peer)
      harness.message(peer, JSON.stringify({ type: 'ping' }))

      expect(peer.send).toHaveBeenCalledTimes(1)
      const sent = JSON.parse(peer.send.mock.calls[0][0])
      expect(sent.type).toBe('pong')
    })
  })

  // ── Watch command ────────────────────────────────────

  describe('watch', () => {
    it('subscribes to git changes for the specified directory', () => {
      const peer = createMockPeer()
      harness.open(peer)
      harness.message(peer, JSON.stringify({ type: 'watch', workingDirectory: '/my/repo' }))

      expect(harness.subscriptions).toHaveLength(1)
      expect(harness.subscriptions[0]!.workingDirectory).toBe('/my/repo')
    })

    it('stores working directory in peer state', () => {
      const peer = createMockPeer('p1')
      harness.open(peer)
      harness.message(peer, JSON.stringify({ type: 'watch', workingDirectory: '/my/repo' }))

      expect(harness.peerState.get('p1')!.workingDirectory).toBe('/my/repo')
    })

    it('forwards git_changed events to the peer', () => {
      const peer = createMockPeer()
      harness.open(peer)
      harness.message(peer, JSON.stringify({ type: 'watch', workingDirectory: '/my/repo' }))

      peer.send.mockClear()
      harness.simulateChange('/my/repo')

      expect(peer.send).toHaveBeenCalledTimes(1)
      const sent = JSON.parse(peer.send.mock.calls[0][0])
      expect(sent.type).toBe('git_changed')
      expect(sent.workingDirectory).toBe('/my/repo')
    })

    it('unsubscribes from previous directory when watching a new one', () => {
      const peer = createMockPeer()
      harness.open(peer)
      harness.message(peer, JSON.stringify({ type: 'watch', workingDirectory: '/old/repo' }))
      harness.message(peer, JSON.stringify({ type: 'watch', workingDirectory: '/new/repo' }))

      expect(harness.unsubscribeCalls).toContain('/old/repo')
      expect(harness.subscriptions).toHaveLength(2)
      expect(harness.subscriptions[1]!.workingDirectory).toBe('/new/repo')
    })

    it('ignores watch with non-string workingDirectory', () => {
      const peer = createMockPeer()
      harness.open(peer)
      harness.message(peer, JSON.stringify({ type: 'watch', workingDirectory: 123 }))

      expect(harness.subscriptions).toHaveLength(0)
    })

    it('ignores watch with missing workingDirectory', () => {
      const peer = createMockPeer()
      harness.open(peer)
      harness.message(peer, JSON.stringify({ type: 'watch' }))

      expect(harness.subscriptions).toHaveLength(0)
    })

    it('ignores watch when peer state does not exist (no open)', () => {
      const peer = createMockPeer()
      // No harness.open(peer) call
      harness.message(peer, JSON.stringify({ type: 'watch', workingDirectory: '/repo' }))

      expect(harness.subscriptions).toHaveLength(0)
    })
  })

  // ── Invalid messages ─────────────────────────────────

  describe('invalid messages', () => {
    it('silently ignores invalid JSON', () => {
      const peer = createMockPeer()
      harness.open(peer)

      expect(() => {
        harness.message(peer, 'not json')
      }).not.toThrow()

      expect(peer.send).not.toHaveBeenCalled()
    })

    it('silently ignores unknown message types', () => {
      const peer = createMockPeer()
      harness.open(peer)

      expect(() => {
        harness.message(peer, JSON.stringify({ type: 'unknown_type' }))
      }).not.toThrow()

      expect(peer.send).not.toHaveBeenCalled()
    })
  })

  // ── Multi-peer scenarios ─────────────────────────────

  describe('multi-peer', () => {
    it('isolates peer subscriptions', () => {
      const peer1 = createMockPeer('p1')
      const peer2 = createMockPeer('p2')

      harness.open(peer1)
      harness.open(peer2)

      harness.message(peer1, JSON.stringify({ type: 'watch', workingDirectory: '/repo-a' }))
      harness.message(peer2, JSON.stringify({ type: 'watch', workingDirectory: '/repo-b' }))

      peer1.send.mockClear()
      peer2.send.mockClear()

      harness.simulateChange('/repo-a')

      expect(peer1.send).toHaveBeenCalledTimes(1)
      expect(peer2.send).not.toHaveBeenCalled()
    })

    it('both peers watching same directory both receive events', () => {
      const peer1 = createMockPeer('p1')
      const peer2 = createMockPeer('p2')

      harness.open(peer1)
      harness.open(peer2)

      harness.message(peer1, JSON.stringify({ type: 'watch', workingDirectory: '/shared' }))
      harness.message(peer2, JSON.stringify({ type: 'watch', workingDirectory: '/shared' }))

      peer1.send.mockClear()
      peer2.send.mockClear()

      harness.simulateChange('/shared')

      expect(peer1.send).toHaveBeenCalledTimes(1)
      expect(peer2.send).toHaveBeenCalledTimes(1)
    })
  })

  // ── Error resilience ─────────────────────────────────

  describe('error resilience', () => {
    it('handles peer.send throwing without crashing', () => {
      const peer = createMockPeer()
      harness.open(peer)
      harness.message(peer, JSON.stringify({ type: 'watch', workingDirectory: '/repo' }))

      peer.send.mockClear()
      peer.send.mockImplementationOnce(() => { throw new Error('connection lost') })

      expect(() => {
        harness.simulateChange('/repo')
      }).not.toThrow()
    })
  })
})
