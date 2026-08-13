<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { ProviderId, SessionListItem } from '~/server/utils/session-store'
import type { ToastType } from '~/types/app'
import { displayBranch, formatRuntimeState, formatSessionTime } from '~/utils/app-formatters'

const props = defineProps<{
  activeSession?: SessionListItem
  sessionId: string
  activePanel: 'conversations' | 'terminal'
  previewRunning: boolean
  previewError: string
  branchReviewRunning: boolean
  canPreview: boolean
  isPreviewing: boolean
  fontSize: number
  terminalTheme: Record<string, string>
  pushToast: (type: ToastType, message: string, duration?: number) => void
  activeProvider?: ProviderId
  initialShellId: string
}>()

const emit = defineEmits<{
  togglePreview: []
  openIntegration: [mode: 'rebase' | 'finalize' | 'squash']
  reviewBranch: []
  attached: [sessionId: string]
  gitChanged: []
  statusChanged: [status: 'connecting' | 'connected' | 'closed']
  shellStateChanged: [state: { shells: import('~/types/app').ShellSessionInfo[]; loading: boolean; creating: boolean; activeId: string }]
}>()

const { attachTerminalClipboardBridge } = useTerminalClipboard(props.pushToast)
const conversation = useConversationTerminal({
  activeProvider: () => props.activeProvider,
  onAttached: (id) => emit('attached', id),
  onGitChanged: () => emit('gitChanged')
})
const shell = useShellTerminal(props.pushToast)
if (props.initialShellId) shell.activeShellId.value = props.initialShellId
const setTerminalElement = (element: Element | ComponentPublicInstance | null) => {
  conversation.terminalEl.value = element instanceof HTMLElement ? element : null
}
const setShellTerminalElement = (element: Element | ComponentPublicInstance | null) => {
  shell.shellTerminalEl.value = element instanceof HTMLElement ? element : null
}
onMounted(async () => {
  await Promise.all([
    conversation.initialize({ fontSize: props.fontSize, theme: props.terminalTheme, attachClipboardBridge: attachTerminalClipboardBridge }),
    shell.initialize({ fontSize: props.fontSize, theme: props.terminalTheme, attachClipboardBridge: attachTerminalClipboardBridge })
  ])
  await shell.refreshShells()
  if (props.activePanel === 'terminal') shell.activate()
})
watch(() => [props.fontSize, props.terminalTheme] as const, ([fontSize, theme]) => {
  conversation.updateAppearance(fontSize, theme)
  shell.updateAppearance(fontSize, theme)
}, { deep: true })
watch(() => props.activePanel, (panel) => { if (panel === 'terminal') void shell.refreshShells().then(shell.activate) })
watch(() => props.initialShellId, (id) => {
  if (id && !shell.activeShellId.value) shell.activeShellId.value = id
})
watch(conversation.status, (value) => emit('statusChanged', value), { immediate: true })
watch([shell.shells, shell.loadingShells, shell.creatingShell, shell.activeShellId], () => emit('shellStateChanged', {
  shells: shell.shells.value, loading: shell.loadingShells.value, creating: shell.creatingShell.value, activeId: shell.activeShellId.value
}), { deep: true, immediate: true })
onBeforeUnmount(() => {
  conversation.dispose()
  shell.dispose()
})
defineExpose({
  connect: conversation.connect,
  sendCommand: conversation.sendCommand,
  sendText: conversation.sendText,
  isConnected: conversation.isConnected,
  close: conversation.close,
  reset: conversation.reset,
  setCursorBlink: conversation.setCursorBlink,
  write: conversation.write,
  writeln: conversation.writeln,
  setSessionId: conversation.setSessionId,
  clearSessionId: conversation.clearSessionId,
  getInitialSessionId: conversation.getInitialSessionId,
  scheduleConversationFit: conversation.scheduleFit,
  settleConversationFit: conversation.settleFit,
  refreshShells: shell.refreshShells,
  createShell: shell.createShell,
  killShell: shell.killShell,
  selectShell: shell.selectShell,
  scheduleShellFit: shell.scheduleFit,
  settleShellFit: shell.settleFit
})
</script>

<template>
        <section class="brick-chat relative grid min-h-0 min-w-0 overflow-hidden grid-rows-[35px_minmax(0,1fr)_128px] bg-[var(--rg-editor)]">
          <div class="flex min-w-0 items-center justify-between border-b border-black/40 bg-[var(--rg-editor-group)]">
            <div class="flex min-w-0 items-center">
              <div
                class="flex h-[35px] min-w-0 items-center gap-2 border-r border-black/40 bg-[var(--rg-editor)] px-3 text-[12px] text-[var(--rg-foreground)]"
                :title="activeSession?.tmuxName || 'new-session'"
              >
                <span class="text-[var(--rg-accent)]">●</span>
                <span class="font-mono">{{ activeSession?.provider || 'provider' }}</span>
              </div>
            </div>
            <div class="flex h-[35px] shrink-0 items-center gap-1.5 px-2 font-mono text-[10px]">
              <span
                v-if="previewError"
                class="max-w-[220px] truncate px-1 text-[#f03e5f]"
                :title="previewError"
              >
                {{ previewError }}
              </span>
              <template v-if="activeSession && !activeSession.archived && !activeSession.finalized">
                <button
                  v-if="canPreview"
                  type="button"
                  class="grid h-6 w-7 place-items-center border border-[var(--rg-border)] bg-[var(--rg-input)] text-[13px] text-[var(--rg-foreground)] hover:border-[var(--rg-accent)] hover:text-[var(--rg-accent)] disabled:cursor-wait disabled:opacity-50"
                  :class="isPreviewing ? 'border-[var(--rg-accent)] text-[var(--rg-accent)]' : ''"
                  :disabled="previewRunning"
                  :title="isPreviewing ? 'End preview and switch back to the base branch' : 'Preview worktree changes in the main worktree'"
                  @click="emit('togglePreview')"
                >
                  {{ isPreviewing ? '◉' : '◎' }}
                </button>
                <button
                  type="button"
                  class="h-6 border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 text-[var(--rg-foreground)] hover:border-[var(--rg-accent)] hover:text-[var(--rg-accent)]"
                  title="Rebase the conversation worktree onto a selected base branch"
                  @click="emit('openIntegration', 'rebase')"
                >
                  Rebase
                </button>
                <button
                  type="button"
                  class="h-6 border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 text-[var(--rg-foreground)] hover:border-[var(--rg-accent)] hover:text-[var(--rg-accent)]"
                  title="Squash this conversation branch into one temporary commit without asking AI for a message"
                  @click="emit('openIntegration', 'squash')"
                >
                  Squash
                </button>
                <button
                  type="button"
                  class="h-6 border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 text-[var(--rg-foreground)] hover:border-[var(--rg-accent)] hover:text-[var(--rg-accent)] disabled:cursor-wait disabled:opacity-50"
                  :disabled="branchReviewRunning"
                  title="Send /new, then ask the provider to check this branch's specs and implementation"
                  @click="emit('reviewBranch')"
                >
                  {{ branchReviewRunning ? 'Reviewing...' : 'Review' }}
                </button>
                <button
                  type="button"
                  class="h-6 bg-[var(--rg-button)] px-2 font-bold text-white hover:brightness-110"
                  title="Squash, merge to a selected base branch, and close the conversation"
                  @click="emit('openIntegration', 'finalize')"
                >
                  Finalize
                </button>
              </template>
              <span v-else-if="activeSession?.finalized" class="px-2 text-[var(--rg-accent)]">
                finalized · {{ activeSession.finalCommit?.slice(0, 8) }}
              </span>
              <span v-else-if="activeSession?.archived" class="px-2 text-[var(--rg-accent)]">
                archived · read-only
              </span>
            </div>
          </div>

          <!-- z-10 keeps the shell overlay below the diff preview (z-20), so a
               diff opened from the git graph stays visible on the Terminal
               panel; the floating git graph (z-20 in the parent) also paints
               above it. -->
          <section
            v-show="activePanel === 'terminal'"
            class="absolute inset-0 z-10 grid min-h-0 grid-rows-[36px_minmax(0,1fr)] bg-[var(--rg-terminal)] shadow-2xl"
          >
            <div class="flex min-w-0 items-stretch border-b border-black/40 bg-[var(--rg-editor-group)] font-mono text-[11px]">
              <div class="flex min-w-0 flex-1 items-stretch overflow-x-auto">
                <button
                  v-for="item in shell.shells.value"
                  :key="item.id"
                  type="button"
                  class="group flex shrink-0 items-center gap-2 border-r border-black/30 px-3"
                  :class="shell.activeShellId.value === item.id ? 'bg-[var(--rg-terminal)] text-[var(--rg-foreground)]' : 'text-[#88857c] hover:text-[#ede0ce]'"
                  @click="shell.selectShell(item.id)"
                >
                  <span class="text-[var(--rg-accent)]">&gt;_</span>
                  <span class="max-w-[140px] truncate">{{ item.id }}</span>
                  <span
                    class="grid h-4 w-4 place-items-center text-[13px] text-[#88857c] hover:text-[#f03e5f]"
                    role="button"
                    title="Close terminal"
                    @click.stop="shell.killShell(item.id)"
                  >
                    ×
                  </span>
                </button>
              </div>
              <button
                type="button"
                class="grid w-9 shrink-0 place-items-center border-l border-black/40 text-[16px] text-[var(--rg-foreground)] hover:text-[var(--rg-accent)] disabled:opacity-60"
                :disabled="shell.creatingShell.value"
                title="New Terminal (N)"
                @click="shell.createShell"
              >
                +
              </button>
            </div>
            <div class="relative min-h-0 min-w-0 overflow-hidden p-3">
              <div :ref="setShellTerminalElement" class="terminal h-full min-h-0 w-full min-w-0" />
              <div
                v-if="!shell.activeShellId.value"
                class="absolute inset-0 grid place-items-center bg-[var(--rg-terminal)] text-center text-[12px] text-[#88857c]"
              >
                <div class="grid gap-2">
                  <p>No terminal open.</p>
                  <button
                    type="button"
                    class="mx-auto h-7 bg-[var(--rg-button)] px-3 text-xs font-bold text-white hover:brightness-110 disabled:opacity-60"
                    :disabled="shell.creatingShell.value"
                    @click="shell.createShell"
                  >
                    + New Terminal <span class="ml-1 opacity-70">N</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div class="terminal-frame min-h-0 min-w-0 overflow-hidden bg-[var(--rg-terminal)] p-3">
            <div :ref="setTerminalElement" class="terminal h-full min-h-0 w-full min-w-0" />
          </div>

          <section class="grid min-h-0 min-w-0 overflow-hidden grid-rows-[35px_minmax(0,1fr)] border-t border-[var(--rg-border)] bg-[var(--rg-panel)]">
            <div class="flex items-center gap-5 border-b border-[var(--rg-border)] px-3 text-[11px] font-bold uppercase tracking-wide text-[var(--rg-muted)]">
              <span class="border-b-2 border-[var(--rg-accent)] py-[10px] text-[var(--rg-foreground)]">Details</span>
              <span>Problems</span>
              <span>Output</span>
              <span>Debug Console</span>
            </div>
            <div class="min-h-0 overflow-auto p-3 font-mono text-[12px] leading-5 text-[#ede0ce]">
              <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-1">
                <span class="text-[#a0988e]">sessionId</span>
                <span class="break-all">{{ activeSession?.id || sessionId || '-' }}</span>
                <span class="text-[#a0988e]">tmux</span>
                <span class="break-all text-[var(--rg-accent)]">{{ activeSession?.tmuxName || '-' }}</span>
                <span class="text-[#a0988e]">provider</span>
                <span class="uppercase">{{ activeSession?.provider || '-' }}</span>
                <span class="text-[#a0988e]">branch</span>
                <span class="truncate" :title="activeSession?.worktreeBranch">{{ displayBranch(activeSession?.worktreeBranch) }}</span>
                <span class="text-[#a0988e]">base</span>
                <span class="break-all">{{ activeSession?.baseBranch || '-' }}</span>
                <span class="text-[#a0988e]">preview</span>
                <span class="break-all">{{ activeSession?.previewBranch || '-' }}</span>
                <span class="text-[#a0988e]">cwd</span>
                <span class="break-all">{{ activeSession?.cwd || '-' }}</span>
                <span class="text-[#a0988e]">updated</span>
                <span>{{ activeSession ? formatSessionTime(activeSession.updatedAt) : '-' }}</span>
                <span class="text-[#a0988e]">state</span>
                <span>{{ activeSession ? `${formatRuntimeState(activeSession)} · ${activeSession.runtime?.reason || '-'}` : '-' }}</span>
              </div>
            </div>
          </section>
        </section>
</template>
