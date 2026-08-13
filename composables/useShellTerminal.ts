import type { FitAddon } from '@xterm/addon-fit'
import type { Terminal } from '@xterm/xterm'
import type { ShellSessionInfo, ToastType } from '~/types/app'
import { extractFetchError } from '~/utils/fetch-error'

type PushToast = (type: ToastType, message: string, duration?: number) => void

export function shouldReuseShellConnection(currentId: string, targetId: string, readyState?: number) {
  return currentId === targetId && (readyState === 0 || readyState === 1)
}

export function canFinishShellInitialization<T>(disposed: boolean, currentMount: T | null, initialMount: T) {
  return !disposed && currentMount === initialMount
}

export function useShellTerminal(pushToast: PushToast) {
  const shellTerminalEl = ref<HTMLElement | null>(null)
  const shells = ref<ShellSessionInfo[]>([])
  const loadingShells = ref(false)
  const creatingShell = ref(false)
  const activeShellId = ref('')
  let terminal: Terminal | null = null
  let fitAddon: FitAddon | null = null
  let socket: WebSocket | null = null
  let connectedShellId = ''
  let resizeObserver: ResizeObserver | null = null
  let removeClipboardBridge: (() => void) | null = null
  let fitFrame: number | null = null
  let fitTimer: ReturnType<typeof setTimeout> | null = null
  const settleTimers = new Set<ReturnType<typeof setTimeout>>()
  let lastSentSize = { cols: 0, rows: 0 }
  let observedSize = { width: 0, height: 0 }
  let disposed = false

  async function initialize(options: {
    fontSize: number
    theme: NonNullable<Terminal['options']['theme']>
    attachClipboardBridge: (terminal: Terminal, mount: HTMLElement) => () => void
  }) {
    const mount = shellTerminalEl.value
    if (!mount) return
    const [{ Terminal }, { FitAddon }, { Unicode11Addon }, { WebglAddon }] = await Promise.all([
      import('@xterm/xterm'), import('@xterm/addon-fit'), import('@xterm/addon-unicode11'), import('@xterm/addon-webgl')
    ])
    if (!canFinishShellInitialization(disposed, shellTerminalEl.value, mount)) return
    terminal = new Terminal({
      allowProposedApi: true, cursorBlink: true, convertEol: false,
      fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: options.fontSize, lineHeight: 1.25, theme: options.theme
    })
    fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    const unicode11 = new Unicode11Addon()
    terminal.loadAddon(unicode11)
    terminal.unicode.activeVersion = '11'
    terminal.open(mount)
    removeClipboardBridge = options.attachClipboardBridge(terminal, mount)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      terminal.loadAddon(webgl)
    } catch {}
    terminal.onData((data) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', data }))
    })
    resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width === observedSize.width && height === observedSize.height) return
      observedSize = { width, height }
      scheduleFit()
    })
    resizeObserver.observe(mount)
  }

  async function refreshShells() {
    loadingShells.value = true
    try {
      const response = await $fetch<{ shells: ShellSessionInfo[] }>('/api/shells')
      shells.value = response.shells
      if (activeShellId.value && !shells.value.some((shell) => shell.id === activeShellId.value)) activeShellId.value = ''
    } catch {
      // Keep the current list and selection; an explicit or scheduled refresh can retry.
    } finally {
      loadingShells.value = false
    }
  }

  async function createShell() {
    if (creatingShell.value) return
    creatingShell.value = true
    try {
      const response = await $fetch<{ shell: ShellSessionInfo }>('/api/shells', { method: 'POST' })
      shells.value = [...shells.value, response.shell]
      selectShell(response.shell.id)
    } catch (error) {
      pushToast('error', `Failed to create terminal: ${extractFetchError(error)}`, 6000)
    } finally {
      creatingShell.value = false
    }
  }

  async function killShell(id: string) {
    try {
      const url: string = `/api/shells/${encodeURIComponent(id)}`
      await $fetch(url, { method: 'DELETE' })
    } catch (error) {
      pushToast('error', `Failed to close terminal: ${extractFetchError(error)}`, 6000)
      return
    }
    removeShell(id, false)
  }

  function removeShell(id: string, preferLast: boolean) {
    const remaining = shells.value.filter((shell) => shell.id !== id)
    shells.value = remaining
    if (activeShellId.value !== id) return
    activeShellId.value = ''
    socket?.close()
    socket = null
    connectedShellId = ''
    terminal?.reset()
    const fallback = preferLast ? remaining[remaining.length - 1] : remaining[0]
    if (fallback) selectShell(fallback.id)
  }

  function selectShell(id: string) {
    if (!id) return
    activeShellId.value = id
    connectShell(id)
  }

  function connectShell(id: string) {
    if (!terminal) return
    if (shouldReuseShellConnection(connectedShellId, id, socket?.readyState)) {
      nextTick(settleFit)
      return
    }
    lastSentSize = { cols: 0, rows: 0 }
    socket?.close()
    connectedShellId = id
    terminal.reset()
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const current = new WebSocket(`${protocol}//${window.location.host}/api/shell`)
    socket = current
    current.addEventListener('open', () => {
      if (socket !== current) return
      performFit(false)
      current.send(JSON.stringify({ type: 'attach', shellId: id, cols: terminal?.cols, rows: terminal?.rows }))
      terminal?.focus()
    })
    current.addEventListener('message', (event) => {
      if (socket !== current) return
      const data = String(event.data)
      const control = parseControlMessage(data)
      if (control?.type === 'attached') return settleFit()
      if (control?.type === 'exited') return removeShell(control.shellId, true)
      if (!control) terminal?.write(data)
    })
    current.addEventListener('error', () => {
      if (socket === current) terminal?.writeln('\r\n\r\n[terminal error]')
    })
    current.addEventListener('close', () => {
      if (socket === current) connectedShellId = ''
    })
  }

  function parseControlMessage(data: string) {
    if (!data.startsWith('\x00')) return null
    try {
      const value = JSON.parse(data.slice(1)) as Record<string, unknown>
      if (value.type === 'hello') return { type: 'hello' as const, shellId: '' }
      if ((value.type === 'attached' || value.type === 'exited') && typeof value.shellId === 'string') {
        return { type: value.type, shellId: value.shellId } as const
      }
    } catch {}
    return null
  }

  function performFit(notifyServer = true) {
    const mount = shellTerminalEl.value
    if (!terminal || !fitAddon || !mount || mount.clientWidth < 1 || mount.clientHeight < 1) return
    const dimensions = fitAddon.proposeDimensions()
    if (!dimensions || dimensions.cols < 1 || dimensions.rows < 1) return
    if (dimensions.cols !== terminal.cols || dimensions.rows !== terminal.rows) fitAddon.fit()
    if (terminal.cols < 1 || terminal.rows < 1) return
    if (terminal.cols === lastSentSize.cols && terminal.rows === lastSentSize.rows) return
    if (notifyServer && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }))
      lastSentSize = { cols: terminal.cols, rows: terminal.rows }
    }
  }

  function scheduleFit(delay = 0) {
    if (fitTimer) clearTimeout(fitTimer)
    if (fitFrame !== null) cancelAnimationFrame(fitFrame)
    fitTimer = setTimeout(() => {
      fitFrame = requestAnimationFrame(() => { fitFrame = null; performFit() })
    }, delay)
  }

  function settleFit() {
    for (const timer of settleTimers) clearTimeout(timer)
    settleTimers.clear()
    scheduleFit()
    for (const delay of [50, 150, 350]) {
      const timer = setTimeout(() => {
        settleTimers.delete(timer)
        scheduleFit()
      }, delay)
      settleTimers.add(timer)
    }
  }

  function activate() {
    if (activeShellId.value && shells.value.some((shell) => shell.id === activeShellId.value)) connectShell(activeShellId.value)
    else if (shells.value.length) selectShell(shells.value[0]!.id)
    else activeShellId.value = ''
    nextTick(settleFit)
  }

  function updateAppearance(fontSize: number, theme: NonNullable<Terminal['options']['theme']>) {
    if (!terminal) return
    terminal.options.fontSize = fontSize
    terminal.options.theme = theme
    performFit()
    terminal.refresh(0, terminal.rows - 1)
  }

  function dispose() {
    disposed = true
    resizeObserver?.disconnect()
    removeClipboardBridge?.()
    if (fitFrame !== null) cancelAnimationFrame(fitFrame)
    if (fitTimer) clearTimeout(fitTimer)
    for (const timer of settleTimers) clearTimeout(timer)
    settleTimers.clear()
    socket?.close()
    connectedShellId = ''
    terminal?.dispose()
  }

  return {
    shellTerminalEl, shells, loadingShells, creatingShell, activeShellId,
    initialize, refreshShells, createShell, killShell, selectShell, connectShell,
    scheduleFit, settleFit, activate, updateAppearance, dispose
  }
}
