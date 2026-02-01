/**
 * WebSocket endpoint for Auto Mode real-time status updates
 * Path: /auto-mode-ws
 */

import { autoModeScheduler } from '~/server/utils/autoModeScheduler'

// Track unsubscribe functions per peer
const peerUnsubscribes = new Map<string, () => void>()

export default defineWebSocketHandler({
  open(peer) {
    // Subscribe this peer to scheduler updates
    const unsubscribe = autoModeScheduler.subscribe((message) => {
      try {
        peer.send(JSON.stringify(message))
      } catch {
        // Peer may have disconnected
      }
    })
    peerUnsubscribes.set(peer.id, unsubscribe)

    // Send current status immediately
    peer.send(JSON.stringify({
      type: 'auto_mode_status',
      session: autoModeScheduler.getSession(),
      enabled: autoModeScheduler.isEnabled(),
    }))
  },

  close(peer) {
    const unsub = peerUnsubscribes.get(peer.id)
    if (unsub) {
      unsub()
      peerUnsubscribes.delete(peer.id)
    }
  },

  message(peer, rawMessage) {
    try {
      const msg = JSON.parse(rawMessage.text())
      if (msg.type === 'ping') {
        peer.send(JSON.stringify({ type: 'pong' }))
      }
    } catch {
      // Ignore invalid messages
    }
  },

  error(peer, error) {
    console.error('[AutoMode WS] Error for peer', peer.id, ':', error)
  },
})
