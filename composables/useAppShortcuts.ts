import type { Ref } from 'vue'

export function useAppShortcuts(options: {
  activePanel: Ref<'conversations' | 'terminal'>
  databaseOpen: Ref<boolean>
  sidebarCollapsed: Ref<boolean>
  specPanelCollapsed: Ref<boolean>
  chatMaximized: Ref<boolean>
  isMobile: Ref<boolean>
  newSessionOpen: Ref<boolean>
  integrationOpen: Ref<boolean>
  closeTopmostModal: () => boolean
  closeDiffPreview: () => void
  hasDiffPreview: () => boolean
  submitTopmostModal: () => boolean
  createShell: () => Promise<void>
  openNewSessionModal: () => Promise<void>
}) {
  const isWorkspaceChord = (event: KeyboardEvent) => (event.metaKey && event.altKey) || (event.ctrlKey && event.altKey && !event.metaKey)
  const consume = (event: KeyboardEvent) => { event.preventDefault(); event.stopPropagation() }
  function handleGlobalEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    if (options.closeTopmostModal()) return consume(event)
    if (options.hasDiffPreview()) { event.preventDefault(); options.closeDiffPreview() }
  }
  function handleGlobalEnter(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.defaultPrevented || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, button, a, [contenteditable]')) return
    if (options.submitTopmostModal()) event.preventDefault()
  }
  function handleChatMaximizeShortcut(event: KeyboardEvent) {
    if (event.repeat || !(event.key.toLowerCase() === 'l' || event.code === 'KeyL') || !isWorkspaceChord(event)) return
    consume(event); options.chatMaximized.value = !options.chatMaximized.value
  }
  function openChatPanel() { options.activePanel.value = 'conversations'; options.databaseOpen.value = false; options.sidebarCollapsed.value = false }
  function openTerminalPanel() { options.activePanel.value = 'terminal'; options.databaseOpen.value = false; options.sidebarCollapsed.value = false }
  function openDatabasePanel() { options.databaseOpen.value = true }
  function handleWorkspacePanelShortcut(event: KeyboardEvent) {
    if (event.repeat || !isWorkspaceChord(event)) return
    const key = event.key.toLowerCase(); const code = event.code
    if (key === '1' || code === 'Digit1') { consume(event); openChatPanel() }
    else if (key === '2' || code === 'Digit2' || key === 't' || code === 'KeyT') { consume(event); openTerminalPanel() }
    else if (key === '3' || code === 'Digit3' || key === 'd' || code === 'KeyD') { consume(event); openDatabasePanel() }
  }
  function toggleSidebar() { options.sidebarCollapsed.value = !options.sidebarCollapsed.value }
  function handleToggleSidebarShortcut(event: KeyboardEvent) {
    if (event.repeat || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'b') return
    event.preventDefault(); toggleSidebar()
  }
  function selectSidebarPanel(panel: 'conversations' | 'terminal') {
    if (!options.sidebarCollapsed.value && options.activePanel.value === panel) options.sidebarCollapsed.value = true
    else { options.activePanel.value = panel; options.sidebarCollapsed.value = false; if (options.isMobile.value) options.specPanelCollapsed.value = true }
  }
  function openSpecPanel() { options.specPanelCollapsed.value = false; if (options.isMobile.value) options.sidebarCollapsed.value = true }
  function isEditable(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false
    return target.isContentEditable || ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase()) || Boolean(target.closest('.terminal'))
  }
  function handleNewConversationShortcut(event: KeyboardEvent) {
    if (event.repeat || event.key.toLowerCase() !== 'n' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || options.newSessionOpen.value || options.integrationOpen.value || isEditable(event.target)) return
    event.preventDefault()
    if (options.activePanel.value === 'terminal') void options.createShell()
    else void options.openNewSessionModal()
  }
  return { handleGlobalEscape, handleGlobalEnter, handleChatMaximizeShortcut,
    handleWorkspacePanelShortcut, handleToggleSidebarShortcut, handleNewConversationShortcut,
    openChatPanel, openTerminalPanel, openDatabasePanel, toggleSidebar, selectSidebarPanel, openSpecPanel }
}
