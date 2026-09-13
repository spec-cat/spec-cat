import type { Ref } from 'vue'
import type { SessionListItem } from '~/types/session'
import { extractFetchError } from '~/utils/fetch-error'

export function useConversationSelection(options: {
  sessions: Ref<SessionListItem[]>
  sessionId: Ref<string>
  selectedArchivedSessionId: Ref<string>
  isMobile: Ref<boolean>
  sidebarCollapsed: Ref<boolean>
  specPanelCollapsed: Ref<boolean>
  activeSidebarPanel: Ref<'conversations' | 'terminal'>
  status: Ref<'connecting' | 'connected' | 'closed'>
  connect: (id?: string) => void
  closeTerminal: () => void
  resetTerminal: (cursorBlink?: boolean) => void
  setCursorBlink: (value: boolean) => void
  setSessionId: (id: string) => void
  writeTerminal: (value: string, scrollToBottom?: boolean) => void
  writelnTerminal: (value: string) => void
}) {
  function selectSession(id: string) {
    const selected = options.sessions.value.find((session) => session.id === id)
    options.selectedArchivedSessionId.value = ''
    options.setCursorBlink(true)
    if (options.isMobile.value) {
      options.sidebarCollapsed.value = true
      options.specPanelCollapsed.value = true
    }
    if (selected?.finalized) {
      options.activeSidebarPanel.value = 'conversations'
      options.closeTerminal()
      options.setSessionId(id)
      options.status.value = 'closed'
      options.resetTerminal()
      options.writelnTerminal(`[finalized into ${selected.baseBranch || 'base'} at ${selected.finalCommit?.slice(0, 8) || 'unknown'}]`)
      return
    }
    if (id === options.sessionId.value && options.status.value === 'connected') return
    options.activeSidebarPanel.value = 'conversations'
    options.connect(id)
  }

  async function selectArchivedSession(session: SessionListItem) {
    if (options.isMobile.value) options.sidebarCollapsed.value = true
    options.activeSidebarPanel.value = 'conversations'
    options.selectedArchivedSessionId.value = session.id
    options.closeTerminal()
    options.status.value = 'closed'
    options.resetTerminal(false)
    try {
      const response = await $fetch<{ log: string }>(
        `/api/sessions/archives/${encodeURIComponent(session.id)}/log`
      )
      if (options.selectedArchivedSessionId.value !== session.id) return
      if (response.log) options.writeTerminal(response.log, true)
      else options.writelnTerminal('[No persisted terminal history]')
    } catch (error) {
      if (options.selectedArchivedSessionId.value !== session.id) return
      options.writelnTerminal(`[Failed to load archived conversation: ${extractFetchError(error)}]`)
    }
  }

  return { selectSession, selectArchivedSession }
}
