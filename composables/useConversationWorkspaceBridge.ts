import type { Ref } from 'vue'
import type { ConversationWorkspaceExpose } from '~/types/workspace'

/** Null-safe boundary between app orchestration and the mounted terminal workspace. */
export function useConversationWorkspaceBridge(workspace: Ref<ConversationWorkspaceExpose | null>) {
  return {
    connect: ((...args) => workspace.value?.connect(...args)) as ConversationWorkspaceExpose['connect'],
    sendTerminalCommand: (value: string) => Boolean(workspace.value?.sendCommand(value)),
    sendTerminalText: (value: string) => Boolean(workspace.value?.sendText(value)),
    isTerminalConnected: () => Boolean(workspace.value?.isConnected()),
    closeConversationTerminal: () => workspace.value?.close(),
    resetConversationTerminal: (cursorBlink = true) => workspace.value?.reset(cursorBlink),
    setConversationCursorBlink: (value: boolean) => workspace.value?.setCursorBlink(value),
    writeConversationTerminal: (value: string, scroll = false) => workspace.value?.write(value, scroll),
    writelnConversationTerminal: (value: string) => workspace.value?.writeln(value),
    setWorkspaceSessionId: (value: string) => workspace.value?.setSessionId(value),
    clearWorkspaceSessionId: () => workspace.value?.clearSessionId(),
    getInitialSessionId: (fallback?: string) => workspace.value?.getInitialSessionId(fallback) || fallback,
    scheduleTerminalFit: (delay = 0) => workspace.value?.scheduleConversationFit(delay),
    scheduleShellFit: (delay = 0) => workspace.value?.scheduleShellFit(delay),
    settleTerminalFit: () => workspace.value?.settleConversationFit(),
    refreshShells: () => workspace.value?.refreshShells() || Promise.resolve(),
    createShell: () => workspace.value?.createShell() || Promise.resolve(),
    killShell: (id: string) => workspace.value?.killShell(id) || Promise.resolve(),
    selectShell: (id: string) => workspace.value?.selectShell(id)
  }
}
