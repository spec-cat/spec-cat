/**
 * WebSocket endpoint for real-time Git file change notifications.
 * Path: /git-watcher-ws
 *
 * Clients send { type: 'watch', workingDirectory: string } to start watching.
 * Server pushes { type: 'git_changed', workingDirectory: string } when changes detected.
 */

import { subscribeGitChanges } from '~/server/utils/gitWatcher'

// Track peer state: unsubscribe function per peer
const peerState = new Map<string, {
  unsubscribe: (() => void) | null
  workingDirectory: string | null
}>()

export default defineWebSocketHandler({
  open(peer) {
    peerState.set(peer.id, { unsubscribe: null, workingDirectory: null })
  },

  close(peer) {
    const state = peerState.get(peer.id)
    if (state?.unsubscribe) {
      state.unsubscribe()
    }
    peerState.delete(peer.id)
  },

  message(peer, rawMessage) {
    try {
      const msg = JSON.parse(rawMessage.text())

      if (msg.type === 'ping') {
        peer.send(JSON.stringify({ type: 'pong' }))
        return
      }

      if (msg.type === 'watch' && typeof msg.workingDirectory === 'string') {
        const state = peerState.get(peer.id)
        if (!state) return

        // Unsubscribe from previous directory if any
        if (state.unsubscribe) {
          state.unsubscribe()
        }

        // Subscribe to new directory
        state.workingDirectory = msg.workingDirectory
        state.unsubscribe = subscribeGitChanges(msg.workingDirectory, (workingDirectory) => {
          try {
            peer.send(JSON.stringify({ type: 'git_changed', workingDirectory }))
          } catch {
            // Peer may have disconnected
          }
        })
      }
    } catch {
      // Ignore invalid messages
    }
  },

  error(peer, error) {
    console.error('[GitWatcher WS] Error for peer', peer.id, ':', error)
  },
})
