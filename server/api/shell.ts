import type { IPty } from 'node-pty'
import { spawn } from 'node-pty'
import type { Peer } from 'crossws'
import {
  ensureShellSession,
  normalizeShellId,
  shellRootDirectory,
  shellTmuxName
} from '../utils/shell-terminals'

type ShellMessage = {
  type?: string
  shellId?: string
  data?: string
  cols?: number
  rows?: number
}

type ShellClient = {
  shellId: string
  tmuxName: string
  pty: IPty
  cols: number
  rows: number
}

const DEFAULT_COLS = 100
const DEFAULT_ROWS = 30
const TMUX_BIN = process.env.TMUX_BIN || 'tmux'

// Plain shells are stateless passthroughs: one tmux client per websocket peer.
// The tmux session keeps running detached after every peer leaves, so a reload
// reattaches to the same shell state.
const clients = new WeakMap<Peer, ShellClient>()

export default defineWebSocketHandler({
  open(peer) {
    sendControl(peer, { type: 'hello' })
  },

  async message(peer, message) {
    const text = message.text()
    const parsed = parseMessage(text)

    if (parsed?.type === 'attach') {
      try {
        const client = await attachShell(peer, parsed.shellId, parsed.cols, parsed.rows)
        sendControl(peer, { type: 'attached', shellId: client.shellId })
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        peer.send(`\r\n[failed to attach shell: ${detail}]\r\n`)
        peer.close()
      }
      return
    }

    const client = clients.get(peer)
    if (!client) {
      peer.send('\r\n[shell is not attached]\r\n')
      return
    }

    if (parsed?.type === 'resize') {
      const cols = clampDimension(parsed.cols, client.cols)
      const rows = clampDimension(parsed.rows, client.rows)
      if (cols === client.cols && rows === client.rows) return
      client.cols = cols
      client.rows = rows
      client.pty.resize(cols, rows)
      return
    }

    const input = parsed?.type === 'input' && typeof parsed.data === 'string' ? parsed.data : text
    if (input) client.pty.write(input)
  },

  close(peer) {
    detachPeer(peer)
  }
})

async function attachShell(
  peer: Peer,
  requestedShellId?: string,
  requestedCols?: number,
  requestedRows?: number
): Promise<ShellClient> {
  const shellId = normalizeShellId(requestedShellId)
  if (!shellId) throw new Error('Invalid shell id')

  const tmuxName = shellTmuxName(shellId)
  // Revive the tmux session if it died while the client kept the id cached.
  await ensureShellSession(tmuxName)

  detachPeer(peer)

  const cols = clampDimension(requestedCols, DEFAULT_COLS)
  const rows = clampDimension(requestedRows, DEFAULT_ROWS)
  const pty = spawn(TMUX_BIN, ['attach-session', '-t', tmuxName], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: shellRootDirectory(),
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    }
  })

  const client: ShellClient = { shellId, tmuxName, pty, cols, rows }
  clients.set(peer, client)

  pty.onData((data) => {
    if (clients.get(peer) !== client) return
    peer.send(data)
  })

  pty.onExit(() => {
    // Reaching here with the client still registered means the shell process
    // ended (the user ran `exit`) or the tmux session died — the terminal is
    // gone, so tell the client to remove it instead of leaving a dead tab.
    if (clients.get(peer) !== client) return
    clients.delete(peer)
    sendControl(peer, { type: 'exited', shellId: client.shellId })
    peer.close()
  })

  return client
}

function detachPeer(peer: Peer) {
  const client = clients.get(peer)
  if (!client) return
  clients.delete(peer)
  try { client.pty.kill() } catch {}
}

function parseMessage(text: string): ShellMessage | null {
  if (!text.startsWith('{')) return null
  try {
    return JSON.parse(text) as ShellMessage
  } catch {
    return null
  }
}

function sendControl(
  peer: Peer,
  message: { type: 'hello' } | { type: 'attached'; shellId: string } | { type: 'exited'; shellId: string }
) {
  peer.send(`\x00${JSON.stringify(message)}`)
}

function clampDimension(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(8, Math.min(240, Math.floor(value)))
}
