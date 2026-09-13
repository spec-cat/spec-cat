import type { Ref } from 'vue'

type KeyHandler = (event: KeyboardEvent) => void

/** Owns global browser listeners and their paired cleanup for the application shell. */
export function useAppBrowserLifecycle(options: {
  appReady: Ref<boolean>
  isMobile: Ref<boolean>
  gitGraphState: Ref<'floating' | 'pinned'>
  specPanelCollapsed: Ref<boolean>
  sidebarCollapsed: Ref<boolean>
  activeSidebarPanel: Ref<'conversations' | 'terminal'>
  scheduleTerminalFit: (delay?: number) => void
  scheduleShellFit: (delay?: number) => void
  settleTerminalFit: () => void
  initialize: () => Promise<void>
  startPolling: () => void
  stopPolling: () => void
  disposeAppSettings: () => void
  disposeToasts: () => void
  handleChatMaximizeShortcut: KeyHandler
  handleWorkspacePanelShortcut: KeyHandler
  handleNewConversationShortcut: KeyHandler
  handleGlobalEscape: KeyHandler
  handleGlobalEnter: KeyHandler
  handleToggleSidebarShortcut: KeyHandler
}) {
  let removeResizeListener: (() => void) | null = null
  let removeMobileQueryListener: (() => void) | null = null

  onMounted(async () => {
    const mobileQuery = window.matchMedia('(max-width: 768px)')
    const applyMobile = () => {
      options.isMobile.value = mobileQuery.matches
      if (!mobileQuery.matches) {
        options.gitGraphState.value = 'pinned'
        options.specPanelCollapsed.value = false
        options.sidebarCollapsed.value = false
      }
    }
    applyMobile()
    mobileQuery.addEventListener('change', applyMobile)
    removeMobileQueryListener = () => mobileQuery.removeEventListener('change', applyMobile)

    const desiredPanel = options.activeSidebarPanel.value
    const resize = () => {
      options.scheduleTerminalFit(80)
      options.scheduleShellFit(80)
    }
    window.addEventListener('resize', resize)
    removeResizeListener = () => window.removeEventListener('resize', resize)

    window.addEventListener('keydown', options.handleChatMaximizeShortcut, { capture: true })
    window.addEventListener('keydown', options.handleWorkspacePanelShortcut, { capture: true })
    window.addEventListener('keydown', options.handleNewConversationShortcut)
    window.addEventListener('keydown', options.handleGlobalEscape)
    window.addEventListener('keydown', options.handleGlobalEnter)
    window.addEventListener('keydown', options.handleToggleSidebarShortcut)
    document.fonts?.ready.then(() => options.settleTerminalFit())

    await options.initialize()
    options.startPolling()
    options.activeSidebarPanel.value = desiredPanel
    options.settleTerminalFit()
    options.appReady.value = true
  })

  onBeforeUnmount(() => {
    removeResizeListener?.()
    removeMobileQueryListener?.()
    window.removeEventListener('keydown', options.handleChatMaximizeShortcut, { capture: true })
    window.removeEventListener('keydown', options.handleWorkspacePanelShortcut, { capture: true })
    window.removeEventListener('keydown', options.handleNewConversationShortcut)
    window.removeEventListener('keydown', options.handleGlobalEscape)
    window.removeEventListener('keydown', options.handleGlobalEnter)
    window.removeEventListener('keydown', options.handleToggleSidebarShortcut)
    options.stopPolling()
    options.disposeAppSettings()
    options.disposeToasts()
  })
}
