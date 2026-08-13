import { describe, expect, test } from 'bun:test'
import { ref } from 'vue'
import { useAppShortcuts } from '../composables/useAppShortcuts'

function createShortcuts() {
  const activePanel = ref<'conversations' | 'terminal'>('conversations')
  const databaseOpen = ref(false)
  const sidebarCollapsed = ref(false)
  const specPanelCollapsed = ref(false)
  const chatMaximized = ref(false)
  const isMobile = ref(false)
  const shortcuts = useAppShortcuts({
    activePanel, databaseOpen, sidebarCollapsed, specPanelCollapsed, chatMaximized,
    isMobile, newSessionOpen: ref(false), integrationOpen: ref(false),
    closeTopmostModal: () => false, closeDiffPreview: () => {}, hasDiffPreview: () => false,
    submitTopmostModal: () => false,
    createShell: async () => {}, openNewSessionModal: async () => {}
  })
  return { shortcuts, activePanel, databaseOpen, sidebarCollapsed, specPanelCollapsed, isMobile }
}

describe('app shortcut state transitions', () => {
  test('opens each workspace without leaving stale database state', () => {
    const state = createShortcuts()
    state.shortcuts.openDatabasePanel()
    expect(state.databaseOpen.value).toBe(true)
    state.shortcuts.openTerminalPanel()
    expect(state.activePanel.value).toBe('terminal')
    expect(state.databaseOpen.value).toBe(false)
    state.shortcuts.openChatPanel()
    expect(state.activePanel.value).toBe('conversations')
  })

  test('collapses an already selected sidebar and coordinates mobile panels', () => {
    const state = createShortcuts()
    state.shortcuts.selectSidebarPanel('conversations')
    expect(state.sidebarCollapsed.value).toBe(true)
    state.isMobile.value = true
    state.shortcuts.selectSidebarPanel('terminal')
    expect(state.sidebarCollapsed.value).toBe(false)
    expect(state.specPanelCollapsed.value).toBe(true)
  })

  test('routes Escape through modal priority before the diff preview', () => {
    let modalOpen = true
    let diffOpen = true
    let diffCloseCount = 0
    const state = createShortcuts()
    const shortcuts = useAppShortcuts({
      activePanel: state.activePanel,
      databaseOpen: state.databaseOpen,
      sidebarCollapsed: state.sidebarCollapsed,
      specPanelCollapsed: state.specPanelCollapsed,
      chatMaximized: ref(false),
      isMobile: state.isMobile,
      newSessionOpen: ref(false),
      integrationOpen: ref(false),
      closeTopmostModal: () => {
        if (!modalOpen) return false
        modalOpen = false
        return true
      },
      closeDiffPreview: () => { diffOpen = false; diffCloseCount += 1 },
      hasDiffPreview: () => diffOpen,
      submitTopmostModal: () => false,
      createShell: async () => {},
      openNewSessionModal: async () => {}
    })
    const makeEscapeEvent = () => {
      const event = {
        key: 'Escape',
        defaultPrevented: false,
        preventDefault: () => { event.defaultPrevented = true },
        stopPropagation: () => {}
      }
      return event as unknown as KeyboardEvent
    }
    const first = makeEscapeEvent()
    shortcuts.handleGlobalEscape(first)
    expect(first.defaultPrevented).toBe(true)
    expect(diffCloseCount).toBe(0)
    const second = makeEscapeEvent()
    shortcuts.handleGlobalEscape(second)
    expect(diffCloseCount).toBe(1)
  })
})
