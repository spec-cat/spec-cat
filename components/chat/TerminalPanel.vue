<script setup lang="ts">
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { CommandLineIcon } from '@heroicons/vue/24/outline'
import { useChatStore } from '~/stores/chat'
import type { ITheme } from '@xterm/xterm'
import type { ChatMessage } from '~/types/chat'
import { stripTerminalControlSequences, stripTerminalEscapeSequences } from '~/utils/terminalText'

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
  disabled?: boolean
}>()

interface TerminalWsMessage {
  type: 'started' | 'data' | 'replay' | 'exit' | 'error' | 'pong'
  data?: string
  error?: string
  cwd?: string
  hasWorktree?: boolean
  worktreeBranch?: string
  baseBranch?: string
  exitCode?: number
}

const chatStore = useChatStore()
const { isDark } = useTheme()
const terminalEl = ref<HTMLElement | null>(null)
const terminal = shallowRef<Terminal | null>(null)
const fitAddon = shallowRef<FitAddon | null>(null)
const socket = shallowRef<WebSocket | null>(null)
const status = ref<'idle' | 'connecting' | 'connected' | 'closed' | 'error'>('idle')
const statusMessage = ref('')
const terminalCwd = ref('')
const activeAssistantMessageId = ref<string | null>(null)
const activeAssistantConversationId = ref<string | null>(null)
const assistantMessageByConversation = new Map<string, string>()
const renderedServerMessages = new Map<string, number>()
let renderedServerConversationId: string | null = null
let resizeObserver: ResizeObserver | null = null
let reconnectSeq = 0
let userLineBuffer = ''
let lastSubmittedLine = ''
let pendingAssistantOutput = ''
let outputFlushTimer: ReturnType<typeof setTimeout> | null = null
const assistantIdleTimers = new Map<string, ReturnType<typeof setTimeout>>()
const assistantHardStopTimers = new Map<string, ReturnType<typeof setTimeout>>()

const activeConversationKey = computed(() => chatStore.activeConversationId || 'none')
const resolvedCwd = computed(() => {
  const conv = chatStore.activeConversation
  return conv?.worktreePath || conv?.cwd || chatStore.cwd || ''
})

function getTerminalWsUrl(): string {
  if (typeof window === 'undefined') return ''
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/terminal-ws`
}

function fitAndResize() {
  const term = terminal.value
  const fit = fitAddon.value
  const ws = socket.value
  if (!term || !fit) return

  try {
    fit.fit()
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'resize',
        cols: term.cols,
        rows: term.rows,
      }))
    }
  } catch {
    // Xterm can throw while the container is hidden or has no dimensions.
  }
}

function focusTerminal() {
  nextTick(() => {
    terminal.value?.focus()
  })
}

defineExpose({
  focusTerminal,
})

function getActiveConversationId(): string | null {
  return chatStore.activeConversationId || null
}

function writeSystemLine(message: string) {
  terminal.value?.writeln(`\x1b[33m${message}\x1b[0m`)
}

function normalizeTranscriptText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function writeTranscriptChunk(message: ChatMessage, chunk: string, isFirstChunk: boolean) {
  const term = terminal.value
  if (!term || !chunk) return

  const text = normalizeTranscriptText(chunk)
  if (message.role === 'user') {
    if (isFirstChunk) {
      term.write(`\r\n\x1b[36m> ${text}\x1b[0m\r\n`)
    }
    return
  }

  if (isFirstChunk) {
    term.write('\r\n')
  }
  term.write(text)
}

function renderServerConversationTranscript(force = false) {
  const term = terminal.value
  const conv = chatStore.activeConversation
  if (!term || !conv) return
  // Server-sourced (scheduler/cascade) conversations always render their stored
  // transcript. Regular user conversations are live terminals, except once
  // finalized — then their worktree is gone, so we show the saved transcript too.
  if (conv.source === 'user' && conv.finalized !== true) return

  if (force || renderedServerConversationId !== conv.id) {
    renderedServerMessages.clear()
    renderedServerConversationId = conv.id
  }

  for (const message of conv.messages) {
    const content = message.content || ''
    const previousLength = renderedServerMessages.get(message.id) ?? 0
    if (content.length <= previousLength) continue

    const chunk = content.slice(previousLength)
    writeTranscriptChunk(message, chunk, previousLength === 0)
    renderedServerMessages.set(message.id, content.length)
  }
}

function normalizeTerminalOutput(data: string): string {
  let text = stripTerminalControlSequences(data)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u0007/g, '')

  while (text.includes('\b')) {
    text = text.replace(/[^\n]?\b/g, '')
  }

  if (lastSubmittedLine) {
    const escaped = lastSubmittedLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    text = text
      .replace(new RegExp(`^\\s*>?\\s*${escaped}\\s*\\n?`), '')
      .replace(new RegExp(`\\n\\s*>?\\s*${escaped}\\s*\\n?`), '\n')
  }

  return text
}

function hasVisibleText(value: string): boolean {
  return value
    .split('\n')
    .some(line => line.trim().length > 0 && line.trim() !== '>')
}

function clearAssistantTimers(conversationId: string) {
  const idleTimer = assistantIdleTimers.get(conversationId)
  if (idleTimer) clearTimeout(idleTimer)
  assistantIdleTimers.delete(conversationId)

  const hardStopTimer = assistantHardStopTimers.get(conversationId)
  if (hardStopTimer) clearTimeout(hardStopTimer)
  assistantHardStopTimers.delete(conversationId)
}

function setActiveAssistant(conversationId: string | null) {
  activeAssistantConversationId.value = conversationId
  activeAssistantMessageId.value = conversationId
    ? assistantMessageByConversation.get(conversationId) || null
    : null
}

function clearPersistedStreamingMessages(conversationId: string) {
  const conv = chatStore.conversations.find(c => c.id === conversationId)
  if (!conv) return

  let changed = false
  for (const message of conv.messages) {
    if (message.role === 'assistant' && message.status === 'streaming') {
      chatStore.updateMessage(message.id, { status: 'complete' }, conversationId)
      changed = true
    }
  }

  if (changed) {
    chatStore.saveConversation(conversationId, true)
  }
}

function completeAssistantFor(conversationId: string | null) {
  if (!conversationId) return
  const messageId = assistantMessageByConversation.get(conversationId)
  if (!conversationId || !messageId) {
    if (activeAssistantConversationId.value === conversationId) {
      setActiveAssistant(null)
    }
    return
  }

  clearAssistantTimers(conversationId)

  chatStore.completeMessageWithSave(messageId, conversationId)
  // The global conversation streaming flag is owned by the job lifecycle
  // (ChatInput start → useChatStream `done` / useGlobalNotifications
  // `job_persisted` end). Terminal transcript handling must NOT clear it here —
  // ensureAssistantMessage runs on every output flush, so clearing it here kept
  // the conversation card's streaming badge from ever showing mid-turn.
  autoCommitAndSyncPreview(conversationId)
  assistantMessageByConversation.delete(conversationId)
  if (activeAssistantConversationId.value === conversationId) {
    setActiveAssistant(null)
  }
}

function completeActiveAssistant() {
  completeAssistantFor(activeAssistantConversationId.value || chatStore.activeConversationId)
}

function scheduleAssistantIdleComplete(conversationId: string) {
  const existingTimer = assistantIdleTimers.get(conversationId)
  if (existingTimer) clearTimeout(existingTimer)
  const timer = setTimeout(() => {
    completeAssistantFor(conversationId)
  }, 2500)
  assistantIdleTimers.set(conversationId, timer)
}

function ensureAssistantMessage(conversationId: string): string {
  const existingMessageId = assistantMessageByConversation.get(conversationId)
  if (existingMessageId) {
    chatStore.updateMessage(existingMessageId, { status: 'complete' }, conversationId)
    setActiveAssistant(conversationId)
    return existingMessageId
  }

  const message = chatStore.addAssistantMessage(conversationId)
  chatStore.updateMessage(message.id, { status: 'complete' }, conversationId)
  assistantMessageByConversation.set(conversationId, message.id)
  setActiveAssistant(conversationId)
  chatStore.saveConversation(conversationId)

  const existingHardStopTimer = assistantHardStopTimers.get(conversationId)
  if (existingHardStopTimer) clearTimeout(existingHardStopTimer)
  const hardStopTimer = setTimeout(() => {
    flushAssistantOutput()
    completeAssistantFor(conversationId)
  }, 5 * 60 * 1000)
  assistantHardStopTimers.set(conversationId, hardStopTimer)
  return message.id
}

function autoCommitAndSyncPreview(conversationId: string) {
  const conv = chatStore.conversations.find(c => c.id === conversationId)
  if (!conv?.hasWorktree || !conv.worktreePath) return

  $fetch('/api/chat/worktree-commit', {
    method: 'POST',
    body: {
      worktreePath: conv.worktreePath,
      conversationId,
      previousBranch: conv.worktreeBranch,
    },
  }).then((result: any) => {
    if (!result?.success) return result

    if (conv.previewBranch && conv.worktreePath) {
      return $fetch<{ success: boolean; error?: string }>('/api/chat/preview-sync', {
        method: 'POST',
        body: { previewBranch: conv.previewBranch, worktreePath: conv.worktreePath },
      }).then((syncResult) => {
        if (!syncResult.success) {
          throw new Error(syncResult.error || 'Unknown preview sync failure')
        }
        return result
      })
    }

    return result
  }).then(async (result: any) => {
    if (!result?.success) return

    if (result.currentBranch && result.currentBranch !== conv.worktreeBranch) {
      chatStore.updateWorktreeBranch(conversationId, result.currentBranch)
      await chatStore.syncConversationFeatureFromBranch(conversationId)
    } else if (conv.worktreeBranch) {
      chatStore.updateWorktreeBranch(conversationId, conv.worktreeBranch)
    }

    chatStore.saveConversation(conversationId, false)
  }).catch((error: unknown) => {
    console.warn('[TerminalPanel] Auto-commit/preview-sync failed:', error)
  })
}

function flushAssistantOutput() {
  if (outputFlushTimer) {
    clearTimeout(outputFlushTimer)
    outputFlushTimer = null
  }

  const chunk = pendingAssistantOutput
  pendingAssistantOutput = ''
  if (!chunk || !hasVisibleText(chunk)) return

  const conversationId = activeAssistantConversationId.value || chatStore.activeConversationId
  if (!conversationId) return

  const messageId = ensureAssistantMessage(conversationId)
  chatStore.appendToMessageWithSave(messageId, chunk, conversationId)
  scheduleAssistantIdleComplete(conversationId)
}

function appendAssistantOutput(data: string) {
  if (!activeAssistantMessageId.value) return

  const text = normalizeTerminalOutput(data)
  if (!text) return

  pendingAssistantOutput += text
  if (outputFlushTimer) clearTimeout(outputFlushTimer)
  outputFlushTimer = setTimeout(flushAssistantOutput, 120)
}

function submitTerminalLine(line: string) {
  const content = line.trim()
  userLineBuffer = ''
  if (!content) return

  completeActiveAssistant()
  lastSubmittedLine = content

  const conversationId = chatStore.activeConversationId
  if (!conversationId) return

  chatStore.addUserMessage(content, conversationId)
  chatStore.saveConversation(conversationId, true)
  ensureAssistantMessage(conversationId)
}

function recordTerminalInput(data: string) {
  // xterm emits the terminal's own replies to app queries (cursor position,
  // fg/bg color, device attributes, focus in/out) through onData. Their ESC
  // byte is dropped by the loop below, but the rest of each sequence is
  // printable and would otherwise be appended into the user message. Strip the
  // full sequences up front while keeping control bytes the loop relies on
  // (\r, \n, \b, DEL, Ctrl-C).
  const cleaned = stripTerminalEscapeSequences(data)
  for (const char of cleaned) {
    if (char === '\u0003') {
      userLineBuffer = ''
      completeActiveAssistant()
      continue
    }

    if (char === '\r' || char === '\n') {
      submitTerminalLine(userLineBuffer)
      continue
    }

    if (char === '\b' || char === '\u007f') {
      userLineBuffer = userLineBuffer.slice(0, -1)
      continue
    }

    if (char >= ' ' && char !== '\u001b') {
      userLineBuffer += char
    }
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForPendingWorktree(conversationId: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 10_000) {
    const conv = chatStore.activeConversation
    if (!conv || conv.id !== conversationId) return
    if (conv.worktreePath || conv.hasWorktree) return

    const createdAt = new Date(conv.createdAt).getTime()
    if (Number.isFinite(createdAt) && Date.now() - createdAt > 15_000) return

    await sleep(150)
  }
}

function closeSocket() {
  const ws = socket.value
  if (ws && ws.readyState !== WebSocket.CLOSING && ws.readyState !== WebSocket.CLOSED) {
    ws.close()
  }
  socket.value = null
}

async function connect() {
  const seq = ++reconnectSeq
  const term = terminal.value
  if (!term) return

  flushAssistantOutput()
  closeSocket()
  status.value = 'connecting'
  statusMessage.value = 'Connecting terminal...'

  const conversationId = getActiveConversationId()
  if (!conversationId || seq !== reconnectSeq) {
    setActiveAssistant(null)
    status.value = 'idle'
    statusMessage.value = 'Create or select a conversation to start Claude.'
    return
  }

  // Finalized conversations have no worktree or live PTY anymore. Render the
  // stored transcript read-only instead of trying to attach a terminal session.
  if (chatStore.activeConversation?.finalized === true) {
    setActiveAssistant(null)
    term.clear()
    renderServerConversationTranscript(true)
    status.value = 'closed'
    statusMessage.value = 'Finalized conversation — read-only transcript.'
    return
  }

  clearPersistedStreamingMessages(conversationId)
  setActiveAssistant(conversationId)
  await waitForPendingWorktree(conversationId)
  if (seq !== reconnectSeq) return

  const url = getTerminalWsUrl()
  if (!url) return

  term.clear()
  renderServerConversationTranscript(true)
  const ws = new WebSocket(url)
  socket.value = ws

  ws.onopen = () => {
    if (seq !== reconnectSeq) return
    fitAndResize()
    const conv = chatStore.activeConversation
    ws.send(JSON.stringify({
      type: 'start',
      conversationId,
      cwd: resolvedCwd.value,
      featureId: conv?.featureId,
      baseBranch: conv?.baseBranch,
      providerId: conv?.providerId,
      providerModelKey: conv?.providerModelKey,
      cols: term.cols,
      rows: term.rows,
    }))
  }

  ws.onmessage = (event) => {
    const payload = JSON.parse(event.data) as TerminalWsMessage

    if (payload.type === 'started') {
      status.value = 'connected'
      terminalCwd.value = payload.cwd || ''
      statusMessage.value = payload.cwd ? `Terminal attached: ${payload.cwd}` : 'Terminal attached'
      if (payload.hasWorktree) {
        chatStore.updateConversationWorktree(conversationId, {
          worktreePath: payload.cwd,
          worktreeBranch: payload.worktreeBranch,
          baseBranch: payload.baseBranch,
        })
      }
      return
    }

    if (payload.type === 'data' || payload.type === 'replay') {
      if (payload.data) term.write(payload.data)
      if (payload.type === 'data' && payload.data) appendAssistantOutput(payload.data)
      return
    }

    if (payload.type === 'exit') {
      status.value = 'closed'
      statusMessage.value = `Terminal exited with code ${payload.exitCode ?? 0}`
      flushAssistantOutput()
      completeAssistantFor(conversationId)
      writeSystemLine(statusMessage.value)
      return
    }

    if (payload.type === 'error') {
      status.value = 'error'
      statusMessage.value = payload.error || 'Terminal error'
      writeSystemLine(statusMessage.value)
    }
  }

  ws.onerror = () => {
    if (seq !== reconnectSeq) return
    status.value = 'error'
    statusMessage.value = 'Terminal connection error'
  }

  ws.onclose = () => {
    if (seq !== reconnectSeq) return
    if (status.value === 'connecting' || status.value === 'connected') {
      status.value = 'closed'
      statusMessage.value = 'Terminal connection closed'
    }
  }
}

onMounted(async () => {
  if (!terminalEl.value) return

  const term = new Terminal({
    cursorBlink: true,
    convertEol: true,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 13,
    lineHeight: 1.25,
    scrollback: 5000,
    theme: terminalThemeFor(isDark.value),
  })

  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(terminalEl.value)

  term.onData((data) => {
    if (props.disabled) return
    recordTerminalInput(data)
    const ws = socket.value
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }))
    }
  })

  terminal.value = term
  fitAddon.value = fit

  resizeObserver = new ResizeObserver(() => fitAndResize())
  resizeObserver.observe(terminalEl.value)

  await nextTick()
  fitAndResize()
  await connect()
})

watch(isDark, (dark) => {
  if (terminal.value) {
    terminal.value.options.theme = terminalThemeFor(dark)
  }
})

watch(activeConversationKey, () => {
  if (!terminal.value) return
  if (!chatStore.activeConversationId) {
    reconnectSeq++
    flushAssistantOutput()
    setActiveAssistant(null)
    closeSocket()
    terminal.value.clear()
    terminalCwd.value = ''
    status.value = 'idle'
    statusMessage.value = 'Create or select a conversation to start Claude.'
    return
  }
  connect()
})

watch(
  () => {
    const conv = chatStore.activeConversation
    if (!conv) return ''
    if (conv.source === 'user' && conv.finalized !== true) return ''
    return conv.messages
      .map(message => `${message.id}:${message.content.length}:${message.status ?? ''}`)
      .join('|')
  },
  () => {
    renderServerConversationTranscript()
  },
)

onUnmounted(() => {
  reconnectSeq++
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  closeSocket()
  flushAssistantOutput()
  for (const timer of assistantIdleTimers.values()) clearTimeout(timer)
  assistantIdleTimers.clear()
  for (const timer of assistantHardStopTimers.values()) clearTimeout(timer)
  assistantHardStopTimers.clear()
  terminal.value?.dispose()
  terminal.value = null
  fitAddon.value = null
})
</script>

<template>
  <div class="h-full min-h-0 flex flex-col bg-retro-black">
    <div class="flex-shrink-0 h-9 flex items-center justify-between gap-3 px-3 border-b border-retro-border bg-retro-dark">
      <div class="min-w-0 flex items-center gap-2 text-[11px] font-mono">
        <CommandLineIcon class="w-4 h-4 text-retro-cyan flex-shrink-0" />
        <span
          class="w-2 h-2 rounded-full flex-shrink-0"
          :class="{
            'bg-retro-green': status === 'connected',
            'bg-retro-yellow animate-pulse': status === 'connecting',
            'bg-retro-red': status === 'error',
            'bg-retro-muted': status === 'idle' || status === 'closed',
          }"
        />
        <span class="truncate text-retro-muted">
          {{ terminalCwd || statusMessage || 'Terminal' }}
        </span>
      </div>
    </div>

    <div ref="terminalEl" class="terminal-host flex-1 min-h-0 w-full overflow-hidden" />
  </div>
</template>

<style scoped>
.terminal-host :deep(.xterm) {
  height: 100%;
  padding: 10px;
}

.terminal-host :deep(.xterm-viewport) {
  scrollbar-color: rgba(34, 211, 238, 0.35) transparent;
}
</style>
