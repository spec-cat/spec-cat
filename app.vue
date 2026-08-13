<script setup lang="ts">
import '@xterm/xterm/css/xterm.css'
import type { ProviderId, SessionListItem } from '~/server/utils/session-store'
import type {
  ConversationWorkspaceExpose,
  GitWorkspaceExpose,
  ShellSessionInfo,
  SpecWorkspaceExpose,
} from '~/types/app'
import { rainglowThemes } from '~/assets/rainglow/themes'
import type {
  GitDialogField,
  GitDialogState,
} from '~/types/app'
import { getThemeVars, getXtermTheme as createXtermTheme } from '~/utils/rainglow-theme'
import { extractFetchError } from '~/utils/fetch-error'
import { runTopmostModalHandler } from '~/utils/modal-stack'
const GIT_GRAPH_STATE_KEY = 'code-cat-git-graph-state'
const SIDEBAR_PANEL_KEY = 'code-cat-sidebar-panel'
const SIDEBAR_COLLAPSED_KEY = 'code-cat-sidebar-collapsed'
const SPEC_PANEL_COLLAPSED_KEY = 'code-cat-spec-panel-collapsed'
const ACTIVE_SHELL_KEY = 'code-cat-active-shell'

const appReady = ref(false)
const specWorkspaceRef = ref<SpecWorkspaceExpose | null>(null)
const gitWorkspaceRef = ref<GitWorkspaceExpose | null>(null)
const sessions = ref<SessionListItem[]>([])
const loadingSessions = ref(false)
const selectedArchivedSessionId = ref('')
const selectedThemeName = ref('peacock')
const defaultProvider = ref<ProviderId>('claude')
const appVersion = useRuntimeConfig().public.appVersion as string
// Button-only modals focus their primary action on open so Enter triggers it
// natively (there is no text field to carry an implicit form submit).
const integrationError = ref('')
const activeSidebarPanel = ref<'conversations' | 'terminal'>('conversations')
const databaseOpen = ref(false)
const sidebarCollapsed = ref(false)
// The spec browser is a permanent column between the activity bar and the
// conversation list rather than a sidebar tab: spec work drives the
// conversations, so it must stay visible while one is open.
const specPanelCollapsed = ref(false)
// ⌘⌥L / Ctrl+Alt+L toggles the chat column between its default width and a maximized width
// that swallows the spec browser and conversation list tracks. The Git column
// stays visible so the graph keeps its context.
const chatMaximized = ref(false)
// Narrow viewports (phones) can't fit the side-by-side panels, so below this
// width each panel goes full-width and only one shows at a time (see
// appGridColumns and the panels' mobile overlay classes).
const isMobile = ref(false)
// A phone-width terminal fits far fewer columns at the desktop size, so the
// TUI wraps badly; shrink the font on mobile to fit more columns.
const TERMINAL_FONT_SIZE = 14
const TERMINAL_FONT_SIZE_MOBILE = 11
const terminalFontSize = computed(() => (isMobile.value ? TERMINAL_FONT_SIZE_MOBILE : TERMINAL_FONT_SIZE))

// Brick's most useful affordance is that the repository is always the first
// piece of context. Keep the graph mounted as the left-most column.
const gitGraphState = ref<'floating' | 'pinned'>('pinned')
const gitGraphPinned = computed({
  get: () => gitGraphState.value === 'pinned',
  set: (pinned: boolean) => { gitGraphState.value = pinned ? 'pinned' : 'floating' }
})

const gitDialog = ref<GitDialogState | null>(null)

const conversationSearchQuery = ref('')
// Soft cap: each conversation holds a tmux session, a worktree and a branch,
// so warn before the list grows unwieldy.
const MAX_CONVERSATIONS = 30
const conversationLimitWarning = computed(() => {
  const count = sessions.value.length
  if (count >= MAX_CONVERSATIONS) {
    return `Conversation limit reached (${count}/${MAX_CONVERSATIONS}). Archive or finalize old conversations.`
  }
  if (count >= Math.floor(MAX_CONVERSATIONS * 0.8)) {
    return `Approaching the conversation limit (${count}/${MAX_CONVERSATIONS}).`
  }
  return ''
})

const { toasts, pushToast, dismissToast, disposeToasts } = useToastStack()
const { writeClipboard } = useTerminalClipboard(pushToast)
const conversationWorkspaceRef = ref<ConversationWorkspaceExpose | null>(null)
const sessionId = ref('')
const status = ref<'connecting' | 'connected' | 'closed'>('connecting')
const shells = ref<ShellSessionInfo[]>([])
const loadingShells = ref(false)
const creatingShell = ref(false)
const activeShellId = ref('')
const connect: ConversationWorkspaceExpose['connect'] = (...args) => conversationWorkspaceRef.value?.connect(...args)
const sendTerminalCommand = (value: string) => Boolean(conversationWorkspaceRef.value?.sendCommand(value))
const sendTerminalText = (value: string) => Boolean(conversationWorkspaceRef.value?.sendText(value))
const isTerminalConnected = () => Boolean(conversationWorkspaceRef.value?.isConnected())
const closeConversationTerminal = () => conversationWorkspaceRef.value?.close()
const resetConversationTerminal = (cursorBlink = true) => conversationWorkspaceRef.value?.reset(cursorBlink)
const setConversationCursorBlink = (value: boolean) => conversationWorkspaceRef.value?.setCursorBlink(value)
const writeConversationTerminal = (value: string, scroll = false) => conversationWorkspaceRef.value?.write(value, scroll)
const writelnConversationTerminal = (value: string) => conversationWorkspaceRef.value?.writeln(value)
const setSessionId = (value: string) => { sessionId.value = value; conversationWorkspaceRef.value?.setSessionId(value) }
const clearSessionId = () => { sessionId.value = ''; conversationWorkspaceRef.value?.clearSessionId() }
const getInitialSessionId = (fallback?: string) => conversationWorkspaceRef.value?.getInitialSessionId(fallback) || fallback
const scheduleTerminalFit = (delay = 0) => conversationWorkspaceRef.value?.scheduleConversationFit(delay)
const scheduleShellFit = (delay = 0) => conversationWorkspaceRef.value?.scheduleShellFit(delay)
const settleTerminalFit = () => conversationWorkspaceRef.value?.settleConversationFit()
const refreshShells = () => conversationWorkspaceRef.value?.refreshShells() || Promise.resolve()
const createShell = () => conversationWorkspaceRef.value?.createShell() || Promise.resolve()
const killShell = (id: string) => conversationWorkspaceRef.value?.killShell(id) || Promise.resolve()
const selectShell = (id: string) => conversationWorkspaceRef.value?.selectShell(id)
const {
  archivedSessions, loadingArchived, showArchivedSessions, archivingSessionId,
  restoringSessionId, deletingSessionId, editingSessionId, editingSessionTitle,
  savingSessionTitle, sessionDisplayName, startSessionRename, cancelSessionRename,
  saveSessionRename, refreshArchivedSessions, toggleArchivedSessions, archiveSession,
  restoreArchivedSession, deleteArchivedSession, deleteAllArchivedSessions
} = useSessionArchive({
  sessions, sessionId, clearSessionId, selectedArchivedSessionId, refreshSessions, selectSession, connect,
  closeTerminal: closeConversationTerminal, resetTerminal: resetConversationTerminal,
  writelnTerminal: writelnConversationTerminal, openDialog: openGitDialog, pushToast
})
const pendingFeatureAction = computed({
  get: () => specWorkspaceRef.value?.getPendingAction() || null,
  set: (value) => { if (!value) specWorkspaceRef.value?.clearPendingAction() }
})
const pendingFeatureActionLabel = computed(() => specWorkspaceRef.value?.getPendingActionLabel() || '')
const {
  showNewSessionModal, showSettingsModal, sessionOptions, loadingSessionOptions,
  creatingSession, newSessionProvider, newSessionBaseBranch, newSessionBaseBranchRef,
  settingsDoneRef, settingsProviderOptions, loadSessionOptions,
  openNewSessionModal: openNewSessionDialog, openSettingsModal, createNewSession
} = useNewSession({
  defaultProvider, sessionId, clearSessionId, pendingAction: pendingFeatureAction,
  pendingActionLabel: pendingFeatureActionLabel, integrationError, connect,
  waitForAttached: () => specWorkspaceRef.value?.waitForNewSessionAttached() || Promise.resolve(''),
  waitForIdle: (id) => specWorkspaceRef.value?.waitForSessionIdle(id) || Promise.resolve(false),
  dispatchAction: (action) => specWorkspaceRef.value?.dispatchFeatureAction(action), refreshSessions, pushToast
})
const { loadAppSettings, persistAppSettings, disposeAppSettings } = useAppSettings({
  selectedThemeName, gitGraphState, defaultProvider, newSessionProvider, isMobile,
  isKnownTheme: (name) => rainglowThemes.some((theme) => theme.name === name)
})

function openNewSessionModal() {
  return openNewSessionDialog()
}
const sessionRuntimeStates = new Map<string, string>()

let removeResizeListener: (() => void) | null = null
let removeMobileQueryListener: (() => void) | null = null

let sessionPollTimer: ReturnType<typeof setInterval> | null = null
let gitStatePollTimer: ReturnType<typeof setInterval> | null = null
let sessionsRequestId = 0
let sessionsRequestRunning = false

const statusText = computed(() => {
  if (selectedArchivedSessionId.value) return 'Read-only'
  if (status.value === 'connected') return 'Connected'
  if (status.value === 'connecting') return 'Connecting'
  return 'Closed'
})

const activeSession = computed(() => {
  if (selectedArchivedSessionId.value) {
    return archivedSessions.value.find((session) => session.id === selectedArchivedSessionId.value)
  }
  return sessions.value.find((session) => session.id === sessionId.value)
})

const previewingSession = computed(() => {
  return sessions.value.find((session) => Boolean(session.previewBranch)) || null
})

const isActiveSessionPreviewing = computed(() => {
  return Boolean(activeSession.value?.previewBranch)
})

const canPreviewActiveSession = computed(() => {
  return Boolean(activeSession.value && !activeSession.value.archived && !activeSession.value.finalized && activeSession.value.worktreeBranch && activeSession.value.baseBranch)
})

const appGridColumns = computed(() => {
  // On mobile the sidebar and git graph overlay the main column instead of
  // reserving a track, so the grid is just the activity bar plus one panel.
  if (isMobile.value) return '48px minmax(0,1fr)'
  // Maximized chat drops the spec and conversation tracks entirely; the chat
  // column takes the space they used to occupy.
  if (chatMaximized.value) return 'minmax(0,3fr) minmax(0,7fr)'
  // Match brick's 30 / 20 / 20 / 30 information architecture. The elements
  // are assigned to these tracks with CSS so their implementation can remain
  // exactly where it is in this (intentionally monolithic) component.
  // The tracks carry no pixel floor on purpose: a floor larger than the
  // viewport pushes the chat column past the workspace's overflow-hidden
  // edge, where it is invisible and unclickable on smaller desktop windows.
  return 'minmax(0,3fr) minmax(0,2fr) minmax(0,2fr) minmax(0,3fr)'
})


const {
  showIntegrationModal, integrationMode, integrationBaseBranch, integrationCommitMessage,
  integrationRunning, generatingCommitMessage, commitQueryScreen, conflictReport,
  showConflictReport, previewRunning, previewError, branchReviewRunning,
  integrationBaseBranchRef, conflictCloseRef, openIntegrationModal, generateCommitMessage,
  runSessionIntegration, injectBranchReviewPrompt, toggleSessionPreview
} = useSessionIntegration({
  activeSession, previewingSession, canPreviewActiveSession, sessions, sessionId, clearSessionId,
  sessionOptions, integrationError, loadSessionOptions, refreshSessions,
  refreshArchivedSessions, refreshGitGraph: async () => { await gitWorkspaceRef.value?.refresh() },
  waitForSessionIdle: (id, timeout) => specWorkspaceRef.value?.waitForSessionIdle(id, timeout) || Promise.resolve(false), isTerminalConnected,
  sendTerminalCommand, sendTerminalText, closeTerminal: closeConversationTerminal,
  resetTerminal: resetConversationTerminal, writelnTerminal: writelnConversationTerminal,
  connect, pushToast
})

const {
  handleGlobalEscape, handleGlobalEnter, handleChatMaximizeShortcut,
  handleWorkspacePanelShortcut, handleToggleSidebarShortcut, handleNewConversationShortcut,
  openChatPanel, openTerminalPanel, openDatabasePanel, toggleSidebar, selectSidebarPanel, openSpecPanel
} = useAppShortcuts({
  activePanel: activeSidebarPanel, databaseOpen, sidebarCollapsed, specPanelCollapsed,
  chatMaximized, isMobile, newSessionOpen: showNewSessionModal,
  integrationOpen: showIntegrationModal, closeTopmostModal,
  closeDiffPreview: () => gitWorkspaceRef.value?.closeDiffPreview(),
  hasDiffPreview: () => Boolean(gitWorkspaceRef.value?.hasDiffPreview()),
  submitTopmostModal, createShell, openNewSessionModal
})

const filteredSessions = computed(() => {
  const query = conversationSearchQuery.value.trim().toLowerCase()
  if (!query) return sessions.value
  return sessions.value.filter((session) => {
    return session.id.toLowerCase().includes(query)
      || (session.title || '').toLowerCase().includes(query)
      || session.provider.toLowerCase().includes(query)
      || (session.worktreeBranch || '').toLowerCase().includes(query)
      || (session.baseBranch || '').toLowerCase().includes(query)
  })
})

const filteredArchivedSessions = computed(() => {
  const query = conversationSearchQuery.value.trim().toLowerCase()
  if (!query) return archivedSessions.value
  return archivedSessions.value.filter((session) => {
    return session.id.toLowerCase().includes(query)
      || (session.title || '').toLowerCase().includes(query)
      || session.provider.toLowerCase().includes(query)
  })
})

/**
 * True when a conversation's worktree branch IS this feature's branch. A
 * speckit step checks out `042-some-feature` inside the worktree and the server
 * makes the conversation follow it (server/utils/branch-follow.ts), so the
 * branch is the authoritative feature↔conversation link. Branch layouts that
 * namespace the feature (`feature/042-some-feature`) match on the last segment.
 */
const selectedTheme = computed(() => {
  return rainglowThemes.find((theme) => theme.name === selectedThemeName.value) || rainglowThemes[0]!
})

const themeColors = computed(() => selectedTheme.value.colors)

const themeVars = computed(() => getThemeVars(themeColors.value))

onMounted(async () => {
  // Resolved before the terminals are created so they open at the mobile font
  // size straight away; the change listener keeps it live across resizes.
  const mobileQuery = window.matchMedia('(max-width: 768px)')
  const applyMobile = () => {
    isMobile.value = mobileQuery.matches
    if (!mobileQuery.matches) {
      // Desktop uses brick's four persistent columns. Ignore collapse state
      // left behind by the previous activity-bar layout.
      gitGraphState.value = 'pinned'
      specPanelCollapsed.value = false
      sidebarCollapsed.value = false
    }
  }
  applyMobile()
  mobileQuery.addEventListener('change', applyMobile)
  removeMobileQueryListener = () => mobileQuery.removeEventListener('change', applyMobile)

  // Captured before connect()/selectSession() can flip the panel (and the
  // persistence watch overwrite the stored value); re-applied at the end.
  const desiredPanel = activeSidebarPanel.value
  const resize = () => {
    scheduleTerminalFit(80)
    scheduleShellFit(80)
  }

  window.addEventListener('resize', resize)
  window.addEventListener('keydown', handleChatMaximizeShortcut, { capture: true })
  window.addEventListener('keydown', handleWorkspacePanelShortcut, { capture: true })
  window.addEventListener('keydown', handleNewConversationShortcut)
  window.addEventListener('keydown', handleGlobalEscape)
  window.addEventListener('keydown', handleGlobalEnter)
  window.addEventListener('keydown', handleToggleSidebarShortcut)
  removeResizeListener = () => window.removeEventListener('resize', resize)
  document.fonts?.ready.then(() => settleTerminalFit())

  await Promise.allSettled([loadAppSettings(), refreshSessions(), refreshArchivedSessions(), refreshShells()])
  // Poll at 1s so idle/working badges track the runtime state within the
  // 1-2 second detection budget (server quiet window + one poll tick).
  sessionPollTimer = setInterval(() => {
    void refreshSessions()
  }, 1000)
  // Cheap repository fingerprint poll keeps an open git graph fresh without
  // re-running the full graph query unless something actually changed.
  gitStatePollTimer = setInterval(() => {
    void gitWorkspaceRef.value?.poll()
  }, 3000)
  const initialSessionId = getInitialSessionId(sessions.value[0]?.id)
  if (initialSessionId && sessions.value.find((session) => session.id === initialSessionId)?.finalized) {
    selectSession(initialSessionId)
  } else if (initialSessionId) {
    connect(initialSessionId)
  }
  // Re-apply the restored panel last: connect()/selectSession() above may flip
  // it back to 'conversations' (e.g. when the fallback session is finalized),
  // which would otherwise clobber the last-viewed panel on reload.
  activeSidebarPanel.value = desiredPanel
  settleTerminalFit()
  appReady.value = true
})

watch(selectedThemeName, () => {
  window.localStorage.setItem('claude-web-rainglow-theme', selectedThemeName.value)
  persistAppSettings()
})


watch([gitGraphPinned, chatMaximized], () => scheduleTerminalFit(120), { flush: 'post' })

watch(gitGraphState, (state) => {
  window.localStorage.setItem(GIT_GRAPH_STATE_KEY, state)
  persistAppSettings()
})

watch(defaultProvider, () => {
  persistAppSettings()
})

// Crossing the mobile breakpoint (rotate/resize) restyles the live terminals
// and re-fits them so the pty is resized to the new column count. The explicit
// refresh forces the WebGL renderer to repaint at the new glyph size instead of
// reusing its cached atlas.
watch(terminalFontSize, async () => { await nextTick(); scheduleTerminalFit() })

onBeforeUnmount(() => {
  removeResizeListener?.()
  removeMobileQueryListener?.()
  window.removeEventListener('keydown', handleChatMaximizeShortcut, { capture: true })
  window.removeEventListener('keydown', handleWorkspacePanelShortcut, { capture: true })
  window.removeEventListener('keydown', handleNewConversationShortcut)
  window.removeEventListener('keydown', handleGlobalEscape)
  window.removeEventListener('keydown', handleGlobalEnter)
  window.removeEventListener('keydown', handleToggleSidebarShortcut)
  if (sessionPollTimer) clearInterval(sessionPollTimer)
  if (gitStatePollTimer) clearInterval(gitStatePollTimer)
  disposeAppSettings()
  disposeToasts()
})

onBeforeMount(() => {
  const stored = window.localStorage.getItem('claude-web-rainglow-theme')
  if (stored && rainglowThemes.some((theme) => theme.name === stored)) {
    selectedThemeName.value = stored
  }

  // Restore the last-viewed sidebar panel and shell so a reload returns to
  // whatever the user was looking at (conversation or terminal).
  const storedPanel = window.localStorage.getItem(SIDEBAR_PANEL_KEY)
  if (storedPanel === 'conversations' || storedPanel === 'terminal') {
    activeSidebarPanel.value = storedPanel
  }
  const storedShellId = window.localStorage.getItem(ACTIVE_SHELL_KEY)
  if (storedShellId) activeShellId.value = storedShellId
  if (window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1') {
    sidebarCollapsed.value = true
  }
  if (window.localStorage.getItem(SPEC_PANEL_COLLAPSED_KEY) === '1') {
    specPanelCollapsed.value = true
  }
})

watch(activeSidebarPanel, (panel) => {
  window.localStorage.setItem(SIDEBAR_PANEL_KEY, panel)
})

watch(sidebarCollapsed, (collapsed) => {
  window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
})

watch(specPanelCollapsed, (collapsed) => {
  window.localStorage.setItem(SPEC_PANEL_COLLAPSED_KEY, collapsed ? '1' : '0')
})

// Below the mobile breakpoint the spec browser and the sidebar are both
// full-width overlays stacked at the same depth, so only one may be up.
watch(isMobile, (mobile) => {
  if (mobile && !sidebarCollapsed.value) specPanelCollapsed.value = true
})

watch(activeShellId, (id) => {
  if (id) window.localStorage.setItem(ACTIVE_SHELL_KEY, id)
  else window.localStorage.removeItem(ACTIVE_SHELL_KEY)
})

async function refreshSessions() {
  if (sessionsRequestRunning) return
  sessionsRequestRunning = true
  const requestId = ++sessionsRequestId
  loadingSessions.value = true

  try {
    const response = await $fetch<{ sessions: SessionListItem[] }>('/api/sessions')
    if (requestId === sessionsRequestId) {
      sessions.value = response.sessions
      trackSessionRuntimeStates(response.sessions)
    }
  } catch (error) {
    console.warn('Failed to refresh conversations', error)
  } finally {
    if (requestId === sessionsRequestId) loadingSessions.value = false
    sessionsRequestRunning = false
  }
}

function trackSessionRuntimeStates(list: SessionListItem[]) {
  for (const session of list) {
    const state = session.runtime?.state || 'unknown'
    const previous = sessionRuntimeStates.get(session.id)
    sessionRuntimeStates.set(session.id, state)
    specWorkspaceRef.value?.trackSessionState(session, state)
    if (previous === 'working' && (state === 'idle' || state === 'waiting_input')) {
      void notifyTurnComplete(session, state)
    }
  }
  const knownIds = new Set(list.map((session) => session.id))
  for (const id of sessionRuntimeStates.keys()) {
    if (!knownIds.has(id)) sessionRuntimeStates.delete(id)
  }
}

async function notifyTurnComplete(session: SessionListItem, state: string) {
  const label = sessionDisplayName(session)
  const body = state === 'waiting_input'
    ? `${session.provider} · ${label} is waiting for input.`
    : `${session.provider} · ${label} finished responding.`

  if (document.hasFocus()) {
    // The active conversation's completion is already visible in the terminal.
    if (session.id !== sessionId.value) pushToast('info', body)
    return
  }

  if (typeof Notification === 'undefined') return
  const show = () => {
    new Notification('Code Cat', { body, tag: `turn-complete-${session.id}` })
  }
  if (Notification.permission === 'granted') {
    show()
  } else if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission)
    if (permission === 'granted') show()
  }
}

// Close the frontmost open modal, ordered by stacking priority (higher
// z-index first). Returns true when something was closed. Centralizing this
// makes Escape work regardless of where focus sits — the per-modal handlers
// only fired when focus happened to be inside the modal.
function closeTopmostModal(): boolean {
  return runTopmostModalHandler({
    gitDialog: () => { if (!gitDialog.value) return false; cancelGitDialog(); return true },
    worktrees: () => Boolean(gitWorkspaceRef.value?.closeHighPriorityModal()),
    spec: () => Boolean(specWorkspaceRef.value?.closeTopmost()),
    remotes: () => Boolean(gitWorkspaceRef.value?.closeModal()),
    integration: () => { if (!showIntegrationModal.value) return false; showIntegrationModal.value = false; return true },
    conflictReport: () => { if (!showConflictReport.value) return false; showConflictReport.value = false; return true },
    newSession: () => { if (!showNewSessionModal.value) return false; showNewSessionModal.value = false; return true },
    settings: () => { if (!showSettingsModal.value) return false; showSettingsModal.value = false; return true }
  })
}

function submitTopmostModal(): boolean {
  return runTopmostModalHandler({
    gitDialog: () => { if (!gitDialog.value) return false; confirmGitDialog(); return true },
    worktrees: () => Boolean(gitWorkspaceRef.value?.submitHighPriorityModal()),
    spec: () => Boolean(specWorkspaceRef.value?.submitTopmost()),
    remotes: () => Boolean(gitWorkspaceRef.value?.submitModal()),
    integration: () => { if (!showIntegrationModal.value) return false; void runSessionIntegration(); return true },
    conflictReport: () => { if (!showConflictReport.value) return false; showConflictReport.value = false; return true },
    newSession: () => { if (!showNewSessionModal.value) return false; void createNewSession(); return true },
    settings: () => { if (!showSettingsModal.value) return false; showSettingsModal.value = false; return true }
  })
}

function openGitDialog(options: {
  title: string
  message?: string
  danger?: boolean
  confirmLabel?: string
  fields?: GitDialogField[]
}) {
  gitDialog.value?.resolve(null)
  return new Promise<Record<string, string | boolean> | null>((resolve) => {
    gitDialog.value = {
      title: options.title,
      message: options.message || '',
      danger: Boolean(options.danger),
      confirmLabel: options.confirmLabel || 'OK',
      fields: options.fields || [],
      resolve
    }
  })
}

function confirmGitDialog() {
  const dialog = gitDialog.value
  if (!dialog) return
  const result: Record<string, string | boolean> = {}
  for (const field of dialog.fields) {
    result[field.key] = field.kind === 'checkbox' ? field.value : field.value.trim()
  }
  gitDialog.value = null
  dialog.resolve(result)
}

function cancelGitDialog() {
  const dialog = gitDialog.value
  if (!dialog) return
  gitDialog.value = null
  dialog.resolve(null)
}

async function copyText(value: string) {
  if (await writeClipboard(value)) {
    pushToast('success', 'Copied to clipboard.', 2000)
  } else {
    pushToast('error', 'Could not copy to clipboard.', 4000)
  }
}

function closeFloatingMenus() {
  gitWorkspaceRef.value?.closeFloatingMenus()
}

function selectSession(id: string) {
  const selected = sessions.value.find((session) => session.id === id)
  selectedArchivedSessionId.value = ''
  setConversationCursorBlink(true)
  // On mobile the sidebar and spec browser overlay the conversation; collapse
  // them so opening a conversation reveals the main panel underneath.
  if (isMobile.value) {
    sidebarCollapsed.value = true
    specPanelCollapsed.value = true
  }
  if (selected?.finalized) {
    activeSidebarPanel.value = 'conversations'
    closeConversationTerminal()
    setSessionId(id)
    status.value = 'closed'
    resetConversationTerminal()
    writelnConversationTerminal(`[finalized into ${selected.baseBranch || 'base'} at ${selected.finalCommit?.slice(0, 8) || 'unknown'}]`)
    return
  }
  if (id === sessionId.value && status.value === 'connected') return
  activeSidebarPanel.value = 'conversations'
  connect(id)
}

async function selectArchivedSession(session: SessionListItem) {
  if (isMobile.value) sidebarCollapsed.value = true
  activeSidebarPanel.value = 'conversations'
  selectedArchivedSessionId.value = session.id
  closeConversationTerminal()
  status.value = 'closed'
  resetConversationTerminal(false)

  try {
    const response = await $fetch<{ log: string }>(
      `/api/sessions/archives/${encodeURIComponent(session.id)}/log`
    )
    if (selectedArchivedSessionId.value !== session.id) return
    if (response.log) {
      writeConversationTerminal(response.log, true)
    } else {
      writelnConversationTerminal('[No persisted terminal history]')
    }
  } catch (error) {
    if (selectedArchivedSessionId.value !== session.id) return
    writelnConversationTerminal(`[Failed to load archived conversation: ${extractFetchError(error)}]`)
  }
}

function reconnectActiveSession() {
  connect(sessionId.value || getInitialSessionId(sessions.value[0]?.id))
}

function getXtermTheme() {
  return createXtermTheme(themeColors.value)
}
</script>

<template>
  <main
    class="app-shell h-screen h-dvh w-screen max-w-full overflow-hidden bg-[var(--rg-editor)] text-[var(--rg-foreground)]"
    :style="themeVars"
    @click="closeFloatingMenus"
  >
    <section class="grid h-full min-h-0 grid-rows-[30px_minmax(0,1fr)_22px] overflow-hidden">
      <AppTopBar
        :active-session="activeSession"
        :active-sidebar-panel="activeSidebarPanel"
        :database-open="databaseOpen"
        :chat-maximized="chatMaximized"
        :mobile="isMobile"
        @open-chat="openChatPanel"
        @open-terminal="openTerminalPanel"
        @open-database="openDatabasePanel"
        @toggle-chat-maximized="chatMaximized = !chatMaximized"
        @refresh="activeSidebarPanel === 'terminal' ? refreshShells() : refreshSessions()"
        @open-settings="openSettingsModal"
      />

      <section
        class="brick-workspace relative grid min-h-0 min-w-0 overflow-hidden"
        :class="chatMaximized ? 'brick-chat-max' : ''"
        :style="{ gridTemplateColumns: appGridColumns }"
      >
        <AppActivityBar
          :sidebar-collapsed="sidebarCollapsed"
          :spec-panel-collapsed="specPanelCollapsed"
          :active-sidebar-panel="activeSidebarPanel"
          :database-open="databaseOpen"
          @select-sidebar-panel="selectSidebarPanel"
          @open-spec-panel="openSpecPanel"
          @toggle-database="databaseOpen = !databaseOpen"
          @refresh="activeSidebarPanel === 'terminal' ? refreshShells() : refreshSessions()"
          @open-settings="openSettingsModal"
        />
        <DatabaseWorkspace v-if="databaseOpen" @close="databaseOpen = false" />
        <SpecWorkspace
          ref="specWorkspaceRef"
          :collapsed="specPanelCollapsed"
          :mobile="isMobile"
          :sessions="sessions"
          :session-id="sessionId"
          :status="status"
          :theme-vars="themeVars"
          :push-toast="pushToast"
          :select-session="selectSession"
          :open-new-session="openNewSessionModal"
          :send-command="sendTerminalCommand"
          :send-text="sendTerminalText"
        />
        <AppSidebarPanel v-model:conversation-search-query="conversationSearchQuery"
          v-model:editing-session-title="editingSessionTitle" :collapsed="sidebarCollapsed" :mobile="isMobile"
          :active-sidebar-panel="activeSidebarPanel" :conversation-limit-warning="conversationLimitWarning"
          :sessions="sessions" :filtered-sessions="filteredSessions" :loading-sessions="loadingSessions"
          :session-id="sessionId" :editing-session-id="editingSessionId" :archiving-session-id="archivingSessionId"
          :show-archived-sessions="showArchivedSessions" :archived-sessions="archivedSessions"
          :filtered-archived-sessions="filteredArchivedSessions" :loading-archived="loadingArchived"
          :selected-archived-session-id="selectedArchivedSessionId" :restoring-session-id="restoringSessionId"
          :deleting-session-id="deletingSessionId" :shells="shells" :loading-shells="loadingShells"
          :creating-shell="creatingShell" :active-shell-id="activeShellId" :status-text="statusText"
          :active-session="activeSession" :session-display-name="sessionDisplayName"
          @open-new-session-modal="openNewSessionModal" @refresh-sessions="refreshSessions" @refresh-shells="refreshShells"
          @select-session="selectSession" @save-session-rename="saveSessionRename" @cancel-session-rename="cancelSessionRename"
          @start-session-rename="startSessionRename" @archive-session="archiveSession" @copy-text="copyText"
          @toggle-archived-sessions="toggleArchivedSessions" @delete-all-archived-sessions="deleteAllArchivedSessions"
          @select-archived-session="selectArchivedSession" @restore-archived-session="restoreArchivedSession"
          @delete-archived-session="deleteArchivedSession" @create-shell="createShell" @select-shell="selectShell" @kill-shell="killShell" />
        <ConversationWorkspace ref="conversationWorkspaceRef" :active-session="activeSession" :session-id="sessionId"
          :initial-shell-id="activeShellId"
          :active-panel="activeSidebarPanel" :preview-running="previewRunning" :preview-error="previewError"
          :branch-review-running="branchReviewRunning" :can-preview="canPreviewActiveSession"
          :is-previewing="isActiveSessionPreviewing" :font-size="terminalFontSize" :terminal-theme="getXtermTheme()"
          :push-toast="pushToast" :active-provider="activeSession?.provider" @toggle-preview="toggleSessionPreview"
          @open-integration="openIntegrationModal" @review-branch="injectBranchReviewPrompt"
          @attached="(id) => { sessionId = id; refreshSessions() }"
          @git-changed="() => { gitWorkspaceRef?.invalidate(); refreshSessions(); gitWorkspaceRef?.refresh() }"
          @status-changed="status = $event"
          @shell-state-changed="({ shells: nextShells, loading, creating, activeId }) => { shells = nextShells; loadingShells = loading; creatingShell = creating; activeShellId = activeId }" />
        <GitWorkspace ref="gitWorkspaceRef" v-model:pinned="gitGraphPinned" :active-session="activeSession"
          :previewing-session="previewingSession" :mobile="isMobile" :theme-vars="themeVars"
          :open-dialog="openGitDialog" :push-toast="pushToast" :write-clipboard="writeClipboard" />
      </section>
      <AppStatusBar v-model:selected-theme-name="selectedThemeName" :themes="rainglowThemes" :mobile="isMobile"
        :session-id="sessionId" :active-session="activeSession" :session-count="sessions.length" :status-text="statusText" />
    </section>
    <Transition name="splash"><div v-if="!appReady" class="fixed inset-0 z-[500] grid place-items-center bg-[var(--rg-terminal)]">
      <div class="grid justify-items-center gap-3 font-mono"><span class="text-2xl font-bold tracking-[0.4em]">SPECCAT</span><span>starting terminal...</span></div>
    </div></Transition>
    <Teleport to="body">
      <AppToastStack :toasts="toasts" :theme-vars="themeVars" @dismiss="dismissToast" />
      <NewSessionModal ref="newSessionBaseBranchRef" v-model:base-branch="newSessionBaseBranch" v-model:provider="newSessionProvider"
        :open="showNewSessionModal" :pending-action="pendingFeatureAction" :pending-action-label="pendingFeatureActionLabel"
        :session-options="sessionOptions" :loading="loadingSessionOptions" :creating="creatingSession"
        :error="integrationError" :theme-vars="themeVars" @create="createNewSession" @close="showNewSessionModal = false" />
      <SettingsModal ref="settingsDoneRef" v-model:provider="defaultProvider" :open="showSettingsModal"
        :provider-options="settingsProviderOptions" :app-version="appVersion" :theme-vars="themeVars" @close="showSettingsModal = false" />
      <GitDialogModal :dialog="gitDialog" :theme-vars="themeVars" @confirm="confirmGitDialog" @cancel="cancelGitDialog" />
      <IntegrationModal ref="integrationBaseBranchRef" v-model:base-branch="integrationBaseBranch"
        v-model:commit-message="integrationCommitMessage" :open="showIntegrationModal" :mode="integrationMode"
        :active-session="activeSession" :session-options="sessionOptions" :running="integrationRunning"
        :error="integrationError" :preview-error="previewError" :generating-commit-message="generatingCommitMessage"
        :commit-query-screen="commitQueryScreen" :theme-vars="themeVars" @close="showIntegrationModal = false"
        @run="runSessionIntegration" @generate-commit-message="generateCommitMessage" />
      <ConflictReportModal ref="conflictCloseRef" :open="showConflictReport" :report="conflictReport"
        :theme-vars="themeVars" @close="showConflictReport = false" />
    </Teleport>
  </main>
</template>
<style scoped>
.splash-leave-active { transition: opacity 0.25s ease; }
.splash-leave-to { opacity: 0; }
</style>
