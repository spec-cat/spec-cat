<script setup lang="ts">
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import type { ITheme } from '@xterm/xterm'

/**
 * Read-only viewer that live-streams an existing server PTY session by id via
 * the terminal-ws `attach` flow. It never sends input or resize, so it can
 * safely watch an ephemeral session (e.g. commit-message generation) without
 * disturbing it.
 */

const DARK_TERMINAL_THEME: ITheme = {
  background: '#050807',
  foreground: '#d8f3dc',
  cursor: '#22d3ee',
  selectionBackground: '#164e63',
  black: '#050807',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#38bdf8',
  magenta: '#d946ef',
  cyan: '#22d3ee',
  white: '#d8f3dc',
  brightBlack: '#475569',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#fde047',
  brightBlue: '#7dd3fc',
  brightMagenta: '#e879f9',
  brightCyan: '#67e8f9',
  brightWhite: '#f8fafc',
}

const LIGHT_TERMINAL_THEME: ITheme = {
  background: '#ffffff',
  foreground: '#1f2328',
  cursor: '#0969da',
  selectionBackground: '#b6e3ff',
  black: '#24292f',
  red: '#cf222e',
  green: '#116329',
  yellow: '#7d4e00',
  blue: '#0969da',
  magenta: '#8250df',
  cyan: '#1b7c83',
  white: '#6e7781',
  brightBlack: '#57606a',
  brightRed: '#a40e26',
  brightGreen: '#1a7f37',
  brightYellow: '#633c01',
  brightBlue: '#218bff',
  brightMagenta: '#a475f9',
  brightCyan: '#3192aa',
  brightWhite: '#8c959f',
}

function terminalThemeFor(dark: boolean): ITheme {
  return dark ? DARK_TERMINAL_THEME : LIGHT_TERMINAL_THEME
}

const props = defineProps<{
  sessionId: string
}>()

interface TerminalWsMessage {
  type: 'started' | 'data' | 'replay' | 'exit' | 'error' | 'pong'
  data?: string
  error?: string
  exitCode?: number
  cols?: number
  rows?: number
}

const { isDark } = useTheme()
const terminalEl = ref<HTMLElement | null>(null)
const terminal = shallowRef<Terminal | null>(null)
const socket = shallowRef<WebSocket | null>(null)

function getTerminalWsUrl(): string {
  if (typeof window === 'undefined') return ''
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/terminal-ws`
}

function closeSocket() {
  const ws = socket.value
  if (ws && ws.readyState !== WebSocket.CLOSING && ws.readyState !== WebSocket.CLOSED) {
    ws.close()
  }
  socket.value = null
}

function connect() {
  const term = terminal.value
  if (!term) return

  const url = getTerminalWsUrl()
  if (!url) return

  closeSocket()
  const ws = new WebSocket(url)
  socket.value = ws

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'attach', sessionId: props.sessionId }))
  }

  ws.onmessage = (event) => {
    let payload: TerminalWsMessage
    try {
      payload = JSON.parse(event.data) as TerminalWsMessage
    } catch {
      return
    }

    if (payload.type === 'started') {
      // Match the source PTY's geometry exactly so its cursor-positioning redraws
      // render correctly here instead of wrapping into garbled output.
      if (term && payload.cols && payload.rows) {
        try {
          term.resize(payload.cols, payload.rows)
        } catch {
          // Ignore resize failures on a detached/hidden terminal.
        }
      }
      return
    }

    if ((payload.type === 'data' || payload.type === 'replay') && payload.data) {
      term.write(payload.data)
      return
    }

    if (payload.type === 'error' && payload.error) {
      term.writeln(`\r\n\x1b[31m${payload.error}\x1b[0m`)
    }
  }
}

onMounted(async () => {
  const host = terminalEl.value as HTMLElement | null
  if (!host) return

  const term = new Terminal({
    cursorBlink: false,
    disableStdin: true,
    // Replay the source PTY exactly; converting line endings corrupts
    // cursor-positioned TUI redraws.
    convertEol: false,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 12,
    lineHeight: 1.2,
    scrollback: 5000,
    theme: terminalThemeFor(isDark.value),
  })

  term.open(host)
  terminal.value = term

  await nextTick()
  connect()
})

watch(isDark, (dark) => {
  if (terminal.value) {
    terminal.value.options.theme = terminalThemeFor(dark)
  }
})

onUnmounted(() => {
  closeSocket()
  terminal.value?.dispose()
  terminal.value = null
})
</script>

<template>
  <!-- Scrollable: the terminal renders at the source PTY's native geometry
       (e.g. 100x30), which is wider/taller than this compact panel. -->
  <div class="live-terminal-host h-full min-h-0 w-full overflow-auto">
    <div ref="terminalEl" class="inline-block" />
  </div>
</template>

<style scoped>
.live-terminal-host :deep(.xterm) {
  padding: 8px;
}

.live-terminal-host :deep(.xterm-viewport) {
  scrollbar-color: rgba(34, 211, 238, 0.35) transparent;
}
</style>
