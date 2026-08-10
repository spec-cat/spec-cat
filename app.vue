<script setup lang="ts">
import '@xterm/xterm/css/xterm.css'

import type { FitAddon } from '@xterm/addon-fit'
import type { Terminal } from '@xterm/xterm'
import type { ProviderId, SessionListItem } from '~/server/utils/session-store'
import { rainglowThemes } from '~/assets/rainglow/themes'

type SpecFile = {
  filename: string
  label: string
}

type SpecFeature = {
  id: string
  name: string
  files: SpecFile[]
  hasSpec: boolean
  hasPlan: boolean
  hasTasks: boolean
  completedTasks: number
  totalTasks: number
}

type GitCommit = {
  hash: string
  shortHash: string
  subject: string
  author: {
    name: string
    email: string
  }
  date: string
  parents: string[]
  refs: string[]
  branches: string[]
  tags: string[]
  lane: number
  color: string
}

type GitBranch = {
  name: string
  hash: string
  current: boolean
  remote: boolean
  color: string
}

type GitStash = {
  index: number
  hash: string
  message: string
  branch: string
  date: string
}

type GitStatusFile = {
  path: string
  status: string
  oldPath?: string
}

type GitCommitFile = {
  path: string
  status: string
  oldPath?: string
}

type GitFileDiff = {
  path: string
  oldPath?: string
  hash: string
  binary: boolean
  truncated: boolean
  bytes: number
  diff: string
}

type GitDiffLine = {
  key: string
  oldLine: number | null
  newLine: number | null
  content: string
  kind: 'header' | 'hunk' | 'add' | 'remove' | 'context'
}

type GitGraphResponse = {
  root: string
  head: string
  headHash?: string
  commits: GitCommit[]
  branches: GitBranch[]
  stashes?: GitStash[]
  mergeBases?: string[]
  status: {
    clean: boolean
    changed: number
    staged: number
    unstaged: number
    untracked: number
    stagedFiles: GitStatusFile[]
    unstagedFiles: GitStatusFile[]
  }
  generatedAt: string
}

type GraphSegment = {
  type: 'vertical' | 'vertical-top' | 'vertical-bottom' | 'branch-out' | 'branch-in' | 'merge-out' | 'merge-in'
  fromLane: number
  toLane: number
  color: string
  style: 'rounded' | 'angular'
}

type GraphRowData = {
  commitHash: string
  lane: number
  color: string
  nodeType: 'regular' | 'merge' | 'head' | 'stash' | 'uncommitted'
  isMainline: boolean
  connections: GraphSegment[]
}

type GitContextMenu =
  | { type: 'commit'; x: number; y: number; commit: GitCommit }
  | { type: 'branch'; x: number; y: number; branch: string; commit: GitCommit }
  | { type: 'tag'; x: number; y: number; tag: string; commit: GitCommit }
  | { type: 'stash'; x: number; y: number; stash: GitStash }
  | { type: 'workingTree'; x: number; y: number }

type GitCompareFile = {
  path: string
  status: string
  oldPath?: string
  additions: number
  deletions: number
}

type GitCompareResponse = {
  from: string
  to: string
  files: GitCompareFile[]
  stats: { filesChanged: number; additions: number; deletions: number }
}

type GitRemoteDetail = {
  name: string
  fetchUrl: string
  pushUrl: string
}

type SessionProviderOption = {
  id: ProviderId
  name: string
}

type SessionOptions = {
  branches: string[]
  providers: SessionProviderOption[]
}

const GRAPH_COLUMN_WIDTH = 20
const GRAPH_ROW_HEIGHT = 32
const GRAPH_NODE_RADIUS = 4
const GRAPH_PADDING = 10
const GIT_GRAPH_STATE_KEY = 'code-cat-git-graph-state'
const SIDEBAR_PANEL_KEY = 'code-cat-sidebar-panel'
const SIDEBAR_COLLAPSED_KEY = 'code-cat-sidebar-collapsed'
const SPEC_PANEL_COLLAPSED_KEY = 'code-cat-spec-panel-collapsed'
const ACTIVE_SHELL_KEY = 'code-cat-active-shell'
const GRAPH_COLORS = [
  '#3B82F6',
  '#EF4444',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#06B6D4',
  '#84CC16',
  '#F43F5E',
  '#A855F7'
]

const terminalEl = ref<HTMLElement | null>(null)
const appReady = ref(false)
const status = ref<'connecting' | 'connected' | 'closed'>('connecting')
const sessionId = ref('')
const sessions = ref<SessionListItem[]>([])
const loadingSessions = ref(false)
const deletingSessionId = ref('')
const archivedSessions = ref<SessionListItem[]>([])
const selectedArchivedSessionId = ref('')
const loadingArchived = ref(false)
const showArchivedSessions = ref(false)
const archivingSessionId = ref('')
const restoringSessionId = ref('')
const editingSessionId = ref('')
const editingSessionTitle = ref('')
const savingSessionTitle = ref(false)
const selectedThemeName = ref('peacock')
const showNewSessionModal = ref(false)
const showSettingsModal = ref(false)
const sessionOptions = ref<SessionOptions>({ branches: [], providers: [] })
const loadingSessionOptions = ref(false)
const creatingSession = ref(false)
const newSessionProvider = ref<ProviderId>('claude')
const defaultProvider = ref<ProviderId>('claude')
const appVersion = useRuntimeConfig().public.appVersion as string
const newSessionBaseBranch = ref('')
const newSessionBaseBranchRef = ref<HTMLSelectElement | null>(null)
const integrationBaseBranchRef = ref<HTMLSelectElement | null>(null)
// Button-only modals focus their primary action on open so Enter triggers it
// natively (there is no text field to carry an implicit form submit).
const settingsDoneRef = ref<HTMLButtonElement | null>(null)
const worktreesCreateRef = ref<HTMLButtonElement | null>(null)
const remotesAddRef = ref<HTMLButtonElement | null>(null)
const conflictCloseRef = ref<HTMLButtonElement | null>(null)
const showIntegrationModal = ref(false)
const integrationMode = ref<'rebase' | 'finalize'>('rebase')
const integrationBaseBranch = ref('')
const integrationCommitMessage = ref('')
const integrationRunning = ref(false)
const integrationError = ref('')
const generatingCommitMessage = ref(false)
const commitQueryScreen = ref('')
const conflictReport = ref('')
const showConflictReport = ref(false)
const previewRunning = ref(false)
const previewError = ref('')
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

const features = ref<SpecFeature[]>([])
const loadingFeatures = ref(false)
const specSearchQuery = ref('')
// The card that opened the spec viewer modal. The browser column only lists
// cards; every file lives behind this modal.
const specViewerFeatureId = ref('')
const selectedSpecFile = ref<{ featureId: string; filename: string; label: string } | null>(null)
const selectedSpecContent = ref('')
const loadingSpecContent = ref(false)
const renderedSpecHtml = ref('')
let specRenderRequestId = 0
const showSpecEditModal = ref(false)
const specEditContent = ref('')
const savingSpec = ref(false)

type ShellSessionInfo = { id: string; tmuxName: string; createdAt: number }
const shells = ref<ShellSessionInfo[]>([])
const loadingShells = ref(false)
const creatingShell = ref(false)
const activeShellId = ref('')

type CascadeState = {
  sessionId: string
  featureId: string
  steps: string[]
  index: number
  phase: 'waiting-start' | 'waiting-idle'
}
const cascade = ref<CascadeState | null>(null)

/**
 * A spec-browser action waiting for the conversation it needs. When no
 * conversation owns the feature's branch the New Conversation modal opens and
 * the action is replayed against the conversation it creates.
 */
type PendingFeatureAction =
  | { kind: 'speckit'; featureId: string; step: string }
  | { kind: 'skill'; featureId: string; skillId: string }
  | { kind: 'cascade'; featureId: string }
const pendingFeatureAction = ref<PendingFeatureAction | null>(null)

const pendingFeatureActionLabel = computed(() => {
  const action = pendingFeatureAction.value
  if (!action) return ''
  if (action.kind === 'speckit') return `/speckit.${action.step} ${action.featureId}`
  if (action.kind === 'skill') return `skill ${action.skillId}`
  return 'the auto cascade'
})

// Mirrors the speckit command order. `clarify` sits between specify and plan:
// it interrogates an existing spec, so it is never part of the auto cascade
// (which only fills in missing artifacts and must not stop for questions).
const SPECKIT_STEPS = ['specify', 'clarify', 'plan', 'tasks', 'implement']

type SkillInfo = { id: string; name: string; description: string; path: string | null }
const skills = ref<SkillInfo[]>([])

type TraceabilityInfo = {
  featureId: string
  counts: { total: number; coveredInPlan: number; coveredInTasks: number; uncovered: number }
  alerts: string[]
  risk: 'none' | 'low' | 'medium' | 'high'
}
const traceability = ref<Map<string, TraceabilityInfo>>(new Map())
// Brick's most useful affordance is that the repository is always the first
// piece of context. Keep the graph mounted as the left-most column.
const gitGraphState = ref<'floating' | 'pinned'>('pinned')
const gitGraphPinned = computed(() => gitGraphState.value === 'pinned')
const gitGraph = ref<GitGraphResponse | null>(null)
const loadingGitGraph = ref(false)
const gitGraphError = ref('')
const gitGraphSearch = ref('')
const graphFindIndex = ref(-1)
const graphLimit = ref(120)
const graphBranchFilter = ref<string[]>([])
const showGraphBranchDropdown = ref(false)
const showGraphSettingsDropdown = ref(false)
const graphSettings = ref<{
  style: 'rounded' | 'angular'
  muteNonHead: boolean
  showAuthor: boolean
  showDate: boolean
}>({ style: 'rounded', muteNonHead: false, showAuthor: true, showDate: true })
const GRAPH_SETTINGS_KEY = 'code-cat-git-graph-settings'
const selectedCommitHash = ref('')
const selectedUncommittedChanges = ref(false)
const selectedCommitFiles = ref<GitCommitFile[]>([])
const loadingCommitFiles = ref(false)
const commitFilesError = ref('')
const selectedCommitFilePath = ref('')
const diffPreview = ref<GitFileDiff | null>(null)
const loadingDiffPreview = ref(false)
const diffPreviewError = ref('')
const gitCommitMessage = ref('')
type GitDialogField =
  | { kind: 'text'; key: string; label: string; value: string; placeholder?: string }
  | { kind: 'select'; key: string; label: string; value: string; options: string[] }
  | { kind: 'checkbox'; key: string; label: string; value: boolean }

type GitDialogState = {
  title: string
  message: string
  danger: boolean
  confirmLabel: string
  fields: GitDialogField[]
  resolve: (result: Record<string, string | boolean> | null) => void
}

const gitDialog = ref<GitDialogState | null>(null)

const gitContextMenu = ref<GitContextMenu | null>(null)
const gitContextMenuEl = ref<HTMLElement | null>(null)
const gitActionRunning = ref(false)
const gitActionMessage = ref('')
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
const commitFileViewMode = ref<'flat' | 'tree'>('flat')
const expandedFileFolders = ref<Set<string>>(new Set())
const compareView = ref<GitCompareResponse | null>(null)
const loadingCompare = ref(false)
const showRemotesModal = ref(false)
const remotes = ref<GitRemoteDetail[]>([])
const loadingRemotes = ref(false)

type WorktreeItem = {
  path: string
  head: string
  branch: string | null
  detached: boolean
  locked: boolean
  prunable: boolean
  isMain: boolean
  managed: boolean
}
const showWorktreesModal = ref(false)
const worktrees = ref<WorktreeItem[]>([])
const loadingWorktrees = ref(false)
const worktreeActionRunning = ref(false)

type ToastType = 'success' | 'error' | 'info' | 'warning'
type ToastItem = { id: number; type: ToastType; message: string }
const toasts = ref<ToastItem[]>([])
let toastIdCounter = 0
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>()
const sessionRuntimeStates = new Map<string, string>()

let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let socket: WebSocket | null = null
let removeResizeListener: (() => void) | null = null
let removeMobileQueryListener: (() => void) | null = null
let terminalResizeObserver: ResizeObserver | null = null
let removeTerminalClipboardBridge: (() => void) | null = null

const shellTerminalEl = ref<HTMLElement | null>(null)
let shellTerminal: Terminal | null = null
let shellFitAddon: FitAddon | null = null
let shellSocket: WebSocket | null = null
let shellResizeObserver: ResizeObserver | null = null
let removeShellClipboardBridge: (() => void) | null = null
let shellFitFrame: number | null = null
let shellFitTimer: ReturnType<typeof setTimeout> | null = null
let lastSentShellSize = { cols: 0, rows: 0 }
let observedShellSize = { width: 0, height: 0 }
let fitFrame: number | null = null
let fitTimer: ReturnType<typeof setTimeout> | null = null
const fitSettleTimers = new Set<ReturnType<typeof setTimeout>>()
let sessionPollTimer: ReturnType<typeof setInterval> | null = null
let gitStatePollTimer: ReturnType<typeof setInterval> | null = null
let gitStatePollRunning = false
let lastGitStateFingerprint = ''
let sessionsRequestId = 0
let sessionsRequestRunning = false
let gitGraphRequestId = 0
let specContentRequestId = 0
let lastSentTerminalSize = { cols: 0, rows: 0 }
let observedTerminalSize = { width: 0, height: 0 }
let settingsLoaded = false
let settingsSaveTimer: ReturnType<typeof setTimeout> | null = null

type AppSettingsPayload = {
  theme?: string
  gitGraphState?: 'floating' | 'pinned' | 'none'
  defaultProvider?: ProviderId
}

async function loadAppSettings() {
  try {
    const response = await $fetch<{ settings: AppSettingsPayload }>('/api/settings')
    const settings = response.settings || {}
    if (settings.theme && rainglowThemes.some((theme) => theme.name === settings.theme)) {
      selectedThemeName.value = settings.theme
    }
    // Ignore the legacy "none" value: the Git Graph is now a permanent panel.
    if ((settings.gitGraphState === 'floating' || settings.gitGraphState === 'pinned') && isMobile.value) {
      gitGraphState.value = settings.gitGraphState
    }
    if (settings.defaultProvider === 'claude' || settings.defaultProvider === 'codex') {
      defaultProvider.value = settings.defaultProvider
      newSessionProvider.value = settings.defaultProvider
    }
  } catch (error) {
    console.warn('Failed to load settings', error)
  } finally {
    settingsLoaded = true
  }
}

function persistAppSettings() {
  // Debounced write-behind; the server merges partial payloads.
  if (!settingsLoaded) return
  if (settingsSaveTimer) clearTimeout(settingsSaveTimer)
  settingsSaveTimer = setTimeout(() => {
    settingsSaveTimer = null
    void $fetch('/api/settings', {
      method: 'POST',
      body: {
        theme: selectedThemeName.value,
        gitGraphState: gitGraphState.value,
        defaultProvider: defaultProvider.value
      }
    }).catch((error) => console.warn('Failed to save settings', error))
  }, 400)
}

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

const graphWorkingDirectory = computed(() => {
  return activeSession.value?.projectDir || ''
})

const selectedCommit = computed(() => {
  return gitGraph.value?.commits.find((commit) => commit.hash === selectedCommitHash.value) || null
})

const diffPreviewLines = computed(() => {
  return diffPreview.value ? parseUnifiedDiff(diffPreview.value.diff) : []
})

const currentBranches = computed(() => {
  return gitGraph.value?.branches.filter((branch) => branch.current) || []
})

const graphRows = computed(() => {
  return computeGraphRows(gitGraph.value?.commits || [], gitGraph.value?.headHash || '', graphSettings.value.style)
})

const headAncestorHashes = computed(() => {
  const ancestors = new Set<string>()
  if (!graphSettings.value.muteNonHead || !gitGraph.value) return ancestors
  const commitMap = new Map(gitGraph.value.commits.map((commit) => [commit.hash, commit]))
  const queue = [gitGraph.value.headHash || '']
  while (queue.length) {
    const hash = queue.pop()!
    if (!hash || ancestors.has(hash)) continue
    ancestors.add(hash)
    const commit = commitMap.get(hash)
    if (commit) queue.push(...commit.parents)
  }
  return ancestors
})

function isMutedCommit(hash: string) {
  if (!graphSettings.value.muteNonHead) return false
  return !headAncestorHashes.value.has(hash)
}

const localGraphBranches = computed(() => {
  return (gitGraph.value?.branches || []).filter((branch) => !branch.remote)
})

const remoteGraphBranchGroups = computed(() => {
  const groups = new Map<string, GitBranch[]>()
  for (const branch of gitGraph.value?.branches || []) {
    if (!branch.remote) continue
    const remote = branch.name.split('/')[0] || 'remote'
    const list = groups.get(remote) || []
    list.push(branch)
    groups.set(remote, list)
  }
  return [...groups.entries()].map(([remote, branches]) => ({ remote, branches }))
})

const gitGraphMaxLane = computed(() => {
  let maxLane = 0
  for (const row of graphRows.value.values()) {
    maxLane = Math.max(maxLane, row.lane)
    for (const segment of row.connections) {
      maxLane = Math.max(maxLane, segment.fromLane, segment.toLane)
    }
  }
  return maxLane
})

const gitGraphColumnWidth = computed(() => {
  return GRAPH_PADDING * 2 + (gitGraphMaxLane.value + 1) * GRAPH_COLUMN_WIDTH
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

const mergeBaseSet = computed(() => {
  return new Set(gitGraph.value?.mergeBases || [])
})

// Highlight the commits unique to a managed branch (conversation worktree or
// preview) by walking its first-parent chain down to where it forks from its
// base branch. HEAD-independent, so it stays correct while previewing swaps the
// main checkout to `sc/preview`.
function branchLineHashes(branchName?: string, baseName?: string): Set<string> {
  const result = new Set<string>()
  if (!branchName || !gitGraph.value) return result
  const commits = gitGraph.value.commits
  const commitMap = new Map(commits.map((commit) => [commit.hash, commit]))
  const tip = commits.find((commit) => commit.branches.includes(branchName))
  if (!tip) return result

  const baseTip = baseName ? commits.find((commit) => commit.branches.includes(baseName)) : undefined
  const stops = baseTip ? ancestorHashes(baseTip.hash, commitMap) : mergeBaseSet.value
  // Without a known fork point every ancestor would be highlighted, so bail out.
  if (!stops.size) return result

  let cur: GitCommit | undefined = tip
  while (cur && !stops.has(cur.hash)) {
    result.add(cur.hash)
    cur = cur.parents[0] ? commitMap.get(cur.parents[0]) : undefined
  }
  return result
}

function ancestorHashes(startHash: string, commitMap: Map<string, GitCommit>): Set<string> {
  const set = new Set<string>()
  const queue = [startHash]
  while (queue.length) {
    const hash = queue.pop()!
    if (!hash || set.has(hash)) continue
    set.add(hash)
    const commit = commitMap.get(hash)
    if (commit) queue.push(...commit.parents)
  }
  return set
}

const previewLineSet = computed(() => {
  const session = previewingSession.value
  return branchLineHashes(session?.previewBranch || undefined, session?.baseBranch || undefined)
})

const featureLineSet = computed(() => {
  const session = activeSession.value
  return branchLineHashes(session?.worktreeBranch || undefined, session?.baseBranch || undefined)
})

// Preview tint wins over the feature tint, so only advertise the conversation
// colour when some of its commits are actually rendered in cyan.
const showFeatureLegend = computed(() => {
  for (const hash of featureLineSet.value) {
    if (!previewLineSet.value.has(hash)) return true
  }
  return false
})

const localBranchNames = computed(() => {
  const names = new Set<string>()
  for (const branch of gitGraph.value?.branches || []) {
    if (!branch.remote) names.add(branch.name)
  }
  return names
})

type GroupedBranch = {
  displayName: string
  originalBranches: string[]
  isLocal: boolean
}

// Combine a local branch with same-named remotes on the same commit into a
// single badge (e.g. `main` + `pk/main` -> `main/pk`), mirroring the brick UI.
function groupedBranchesFor(commit: GitCommit): GroupedBranch[] {
  const branches = commit.branches || []
  if (!branches.length) return []

  const knownLocal = localBranchNames.value
  const localBranches: string[] = []
  const remoteBranches: string[] = []
  for (const branch of branches) {
    if (knownLocal.has(branch)) localBranches.push(branch)
    else remoteBranches.push(branch)
  }

  const localBranchSet = new Set(localBranches)
  const remoteLookup = new Map<string, string[]>()
  const unmatchedRemotes: string[] = []
  for (const rb of remoteBranches) {
    const slashIndex = rb.indexOf('/')
    if (slashIndex > 0) {
      const branchPart = rb.slice(slashIndex + 1)
      const remote = rb.slice(0, slashIndex)
      if (localBranchSet.has(branchPart)) {
        if (!remoteLookup.has(branchPart)) remoteLookup.set(branchPart, [])
        remoteLookup.get(branchPart)!.push(remote)
        continue
      }
    }
    unmatchedRemotes.push(rb)
  }

  const result: GroupedBranch[] = []
  for (const localName of localBranches) {
    const remotes = remoteLookup.get(localName) || []
    result.push(remotes.length
      ? { displayName: `${localName}/${remotes.join(',')}`, originalBranches: [localName, ...remotes.map((r) => `${r}/${localName}`)], isLocal: true }
      : { displayName: localName, originalBranches: [localName], isLocal: true })
  }
  for (const rb of unmatchedRemotes) {
    result.push({ displayName: rb, originalBranches: [rb], isLocal: false })
  }
  return result
}

const graphFindMatches = computed(() => {
  const query = gitGraphSearch.value.trim().toLowerCase()
  if (!query || !gitGraph.value) return []
  return gitGraph.value.commits.filter((commit) => {
    return commit.subject.toLowerCase().includes(query)
      || commit.hash.startsWith(query)
      || commit.shortHash.startsWith(query)
      || commit.author.name.toLowerCase().includes(query)
      || commit.refs.some((ref) => ref.toLowerCase().includes(query))
  })
})

const graphFindMatchSet = computed(() => {
  return new Set(graphFindMatches.value.map((commit) => commit.hash))
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
function branchOwnsFeature(branch: string | undefined, featureId: string) {
  if (!branch) return false
  return branch === featureId || branch.split('/').pop() === featureId
}

/**
 * The live conversation working on a feature — the only place a spec-browser
 * action may run. Two explicit links count, matching brick's
 * `findConversationByFeature`: the conversation's worktree branch IS the
 * feature branch, or it was created for the feature (`featureId`, which covers
 * the window before a speckit step checks the branch out). A conversation that
 * merely mentioned the id in its terminal output is NOT a match — that fuzzy
 * link is what made actions land in unrelated conversations. Ties break on the
 * most recently updated one; archived/finalized conversations can no longer be
 * driven, so they never match.
 */
function findSessionForFeature(featureId: string): SessionListItem | null {
  const id = featureId.trim()
  if (!id) return null

  const owners = sessions.value.filter((session) => (
    !session.archived
    && !session.finalized
    && (branchOwnsFeature(session.worktreeBranch, id) || session.featureId === id)
  ))

  return [...owners].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0] || null
}

/** Feature id → the conversation that owns it, for the spec browser badges. */
const featureSessionMap = computed(() => {
  const map = new Map<string, SessionListItem>()
  for (const feature of features.value) {
    const session = findSessionForFeature(feature.id)
    if (session) map.set(feature.id, session)
  }
  return map
})

const filteredFeatures = computed(() => {
  const query = specSearchQuery.value.trim().toLowerCase()
  if (!query) return features.value
  return features.value.filter((feature) => {
    return feature.id.toLowerCase().includes(query) || feature.name.toLowerCase().includes(query)
  })
})

/** The feature behind the open spec viewer modal, refreshed in place. */
const specViewerFeature = computed(() => {
  if (!specViewerFeatureId.value) return null
  return features.value.find((feature) => feature.id === specViewerFeatureId.value) || null
})

type CommitFileTreeRow =
  | { kind: 'folder'; path: string; name: string; depth: number; expanded: boolean }
  | { kind: 'file'; file: GitCommitFile; name: string; depth: number }

const commitFileTreeRows = computed<CommitFileTreeRow[]>(() => {
  if (commitFileViewMode.value !== 'tree') return []

  type TreeFolder = { name: string; path: string; folders: Map<string, TreeFolder>; files: GitCommitFile[] }
  const root: TreeFolder = { name: '', path: '', folders: new Map(), files: [] }

  for (const file of selectedCommitFiles.value) {
    const parts = file.path.split('/')
    let node = root
    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index]!
      const path = node.path ? `${node.path}/${name}` : name
      let child = node.folders.get(name)
      if (!child) {
        child = { name, path, folders: new Map(), files: [] }
        node.folders.set(name, child)
      }
      node = child
    }
    node.files.push(file)
  }

  const rows: CommitFileTreeRow[] = []
  const visit = (folder: TreeFolder, depth: number) => {
    const subfolders = [...folder.folders.values()].sort((a, b) => a.name.localeCompare(b.name))
    for (const subfolder of subfolders) {
      const expanded = expandedFileFolders.value.has(subfolder.path)
      rows.push({ kind: 'folder', path: subfolder.path, name: subfolder.name, depth, expanded })
      if (expanded) visit(subfolder, depth + 1)
    }
    const files = [...folder.files].sort((a, b) => a.path.localeCompare(b.path))
    for (const file of files) {
      rows.push({ kind: 'file', file, name: file.path.split('/').pop() || file.path, depth })
    }
  }
  visit(root, 0)
  return rows
})

function toggleCommitFileViewMode() {
  if (commitFileViewMode.value === 'flat') {
    commitFileViewMode.value = 'tree'
    // Switching to tree starts fully expanded so nothing disappears.
    const folders = new Set<string>()
    for (const file of selectedCommitFiles.value) {
      const parts = file.path.split('/')
      let path = ''
      for (let index = 0; index < parts.length - 1; index += 1) {
        path = path ? `${path}/${parts[index]}` : parts[index]!
        folders.add(path)
      }
    }
    expandedFileFolders.value = folders
  } else {
    commitFileViewMode.value = 'flat'
  }
}

function toggleFileFolder(path: string) {
  const folders = new Set(expandedFileFolders.value)
  if (folders.has(path)) folders.delete(path)
  else folders.add(path)
  expandedFileFolders.value = folders
}

const selectedTheme = computed(() => {
  return rainglowThemes.find((theme) => theme.name === selectedThemeName.value) || rainglowThemes[0]!
})

const themeColors = computed(() => selectedTheme.value.colors)

const themeVars = computed(() => ({
  '--rg-title': themeColors.value['titleBar.activeBackground'] || '#20201d',
  '--rg-activity': themeColors.value['activityBar.background'] || '#302f2c',
  '--rg-sidebar': themeColors.value['sideBar.background'] || '#383733',
  '--rg-sidebar-header': themeColors.value['sideBarSectionHeader.background'] || '#403f3a',
  '--rg-editor': themeColors.value['editor.background'] || '#2b2a27',
  '--rg-editor-group': themeColors.value['editorGroupHeader.tabsBackground'] || '#33322e',
  '--rg-terminal': themeColors.value['terminal.background'] || '#1e1d1b',
  '--rg-panel': themeColors.value['panel.background'] || '#46443f',
  '--rg-input': themeColors.value['input.background'] || '#1e1d1b',
  '--rg-border': themeColors.value['panel.border'] || '#605e57',
  '--rg-foreground': themeColors.value.foreground || themeColors.value['editor.foreground'] || '#ede0ce',
  '--rg-muted': themeColors.value['panelTitle.inactiveForeground'] || '#88857c',
  '--rg-accent': themeColors.value['activityBarBadge.background'] || '#26a6a6',
  '--rg-button': themeColors.value['button.background'] || '#ff5d38',
  '--rg-status': themeColors.value['statusBar.background'] || '#26a6a6',
  '--rg-selection': themeColors.value['list.activeSelectionBackground'] || '#ff5d38'
}))

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
  const [{ Terminal }, { FitAddon }, { Unicode11Addon }, { WebglAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
    import('@xterm/addon-unicode11'),
    import('@xterm/addon-webgl')
  ])

  terminal = new Terminal({
    allowProposedApi: true,
    cursorBlink: true,
    // convertEol must stay off for a pty-backed terminal: it rewrites every
    // bare LF into CRLF, but tmux scroll-region output relies on LF keeping
    // the current column, so converted output lands at column 0 and shows up
    // as stray characters in the leftmost column during wheel scrolling.
    convertEol: false,
    fontFamily:
      '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: terminalFontSize.value,
    lineHeight: 1.25,
    theme: getXtermTheme()
  })

  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  // Unicode 11 width tables keep box-drawing/emoji in the Claude/Codex TUI
  // aligned; must be active before open().
  const unicode11 = new Unicode11Addon()
  terminal.loadAddon(unicode11)
  terminal.unicode.activeVersion = '11'
  terminal.open(terminalEl.value!)
  removeTerminalClipboardBridge = attachTerminalClipboardBridge(terminal, terminalEl.value!)

  // WebGL renderer avoids DOM-renderer flicker under rapid full-screen TUI
  // repaints; fall back silently to the DOM renderer if unavailable.
  try {
    const webgl = new WebglAddon()
    webgl.onContextLoss(() => webgl.dispose())
    terminal.loadAddon(webgl)
  } catch {
    // WebGL unavailable — DOM renderer remains.
  }

  const resize = () => {
    scheduleTerminalFit(80)
    scheduleShellFit(80)
  }

  terminal.onData((data) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'input', data }))
    }
  })

  // The shell terminal is a second, independent xterm bound to the plain-shell
  // websocket. It stays mounted (v-show) so its buffer survives panel switches.
  if (shellTerminalEl.value) {
    shellTerminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      // Same as the conversation terminal: raw pty output, no LF rewriting.
      convertEol: false,
      fontFamily:
        '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: terminalFontSize.value,
      lineHeight: 1.25,
      theme: getXtermTheme()
    })
    shellFitAddon = new FitAddon()
    shellTerminal.loadAddon(shellFitAddon)
    const shellUnicode11 = new Unicode11Addon()
    shellTerminal.loadAddon(shellUnicode11)
    shellTerminal.unicode.activeVersion = '11'
    shellTerminal.open(shellTerminalEl.value)
    removeShellClipboardBridge = attachTerminalClipboardBridge(shellTerminal, shellTerminalEl.value)
    try {
      const shellWebgl = new WebglAddon()
      shellWebgl.onContextLoss(() => shellWebgl.dispose())
      shellTerminal.loadAddon(shellWebgl)
    } catch {
      // WebGL unavailable — DOM renderer remains.
    }
    shellTerminal.onData((data) => {
      if (shellSocket?.readyState === WebSocket.OPEN) {
        shellSocket.send(JSON.stringify({ type: 'input', data }))
      }
    })
    shellResizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width === observedShellSize.width && height === observedShellSize.height) return
      observedShellSize = { width, height }
      scheduleShellFit()
    })
    shellResizeObserver.observe(shellTerminalEl.value)
  }

  window.addEventListener('resize', resize)
  window.addEventListener('keydown', handleChatMaximizeShortcut, { capture: true })
  window.addEventListener('keydown', handleWorkspacePanelShortcut, { capture: true })
  window.addEventListener('keydown', handleNewConversationShortcut)
  window.addEventListener('keydown', handleGlobalEscape)
  window.addEventListener('keydown', handleGlobalEnter)
  window.addEventListener('keydown', handleToggleSidebarShortcut)
  removeResizeListener = () => window.removeEventListener('resize', resize)
  terminalResizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return
    const { width, height } = entry.contentRect
    if (width === observedTerminalSize.width && height === observedTerminalSize.height) return
    observedTerminalSize = { width, height }
    scheduleTerminalFit()
  })
  terminalResizeObserver.observe(terminalEl.value!)

  document.fonts?.ready.then(() => settleTerminalFit())

  await Promise.allSettled([loadAppSettings(), refreshSessions(), refreshFeatures(), refreshArchivedSessions(), refreshSkills(), refreshShells()])
  // Poll at 1s so idle/working badges track the runtime state within the
  // 1-2 second detection budget (server quiet window + one poll tick).
  sessionPollTimer = setInterval(() => {
    void refreshSessions()
  }, 1000)
  // Cheap repository fingerprint poll keeps an open git graph fresh without
  // re-running the full graph query unless something actually changed.
  gitStatePollTimer = setInterval(() => {
    void pollGitState()
  }, 3000)
  const initialSessionId = getInitialSessionId()
  if (initialSessionId && sessions.value.find((session) => session.id === initialSessionId)?.finalized) {
    selectSession(initialSessionId)
  } else if (initialSessionId) {
    connect(initialSessionId)
  }
  // Re-apply the restored panel last: connect()/selectSession() above may flip
  // it back to 'conversations' (e.g. when the fallback session is finalized),
  // which would otherwise clobber the last-viewed panel on reload.
  activeSidebarPanel.value = desiredPanel
  // Shells were loaded above; if the reload landed on the Terminal panel,
  // reconnect the last-viewed shell now that the overlay is mounted.
  if (activeSidebarPanel.value === 'terminal') activateShellPanel()
  settleTerminalFit()
  appReady.value = true
})

watch(selectedThemeName, () => {
  window.localStorage.setItem('claude-web-rainglow-theme', selectedThemeName.value)
  if (terminal) {
    terminal.options.theme = getXtermTheme()
  }
  if (shellTerminal) {
    shellTerminal.options.theme = getXtermTheme()
  }
  persistAppSettings()
})

// Fit and (re)connect the shell terminal when the Terminal panel is shown;
// hidden xterms report zero size, so the fit is deferred until it is visible.
function activateShellPanel() {
  const hasActive = activeShellId.value && shells.value.some((shell) => shell.id === activeShellId.value)
  if (hasActive) {
    if (shellSocket?.readyState !== WebSocket.OPEN) connectShell(activeShellId.value)
  } else if (shells.value.length) {
    selectShell(shells.value[0]!.id)
  } else {
    activeShellId.value = ''
  }
  nextTick(() => settleShellFit())
}

watch(activeSidebarPanel, (panel) => {
  if (panel !== 'terminal') return
  void refreshShells().then(activateShellPanel)
})

watch(graphWorkingDirectory, () => {
  lastGitStateFingerprint = ''
  refreshGitGraph()
}, { immediate: true })

watch(selectedCommitHash, () => {
  void refreshSelectedCommitFiles()
})

watch(gitGraphSearch, () => {
  graphFindIndex.value = -1
})

watch(graphSettings, persistGraphSettings, { deep: true })

watch([selectedSpecContent, selectedSpecFile], async () => {
  const requestId = ++specRenderRequestId
  const content = selectedSpecContent.value
  if (!content || !selectedSpecFile.value?.filename.endsWith('.md')) {
    renderedSpecHtml.value = ''
    return
  }

  try {
    const [{ marked }, { default: DOMPurify }] = await Promise.all([
      import('marked'),
      import('dompurify')
    ])
    const html = await marked.parse(content, { gfm: true })
    if (requestId !== specRenderRequestId) return
    renderedSpecHtml.value = DOMPurify.sanitize(html)
  } catch {
    if (requestId === specRenderRequestId) renderedSpecHtml.value = ''
  }
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
watch(terminalFontSize, async (size) => {
  if (terminal) terminal.options.fontSize = size
  if (shellTerminal) shellTerminal.options.fontSize = size
  await nextTick()
  performTerminalFit()
  performShellFit()
  terminal?.refresh(0, terminal.rows - 1)
  shellTerminal?.refresh(0, shellTerminal.rows - 1)
})

onBeforeUnmount(() => {
  removeResizeListener?.()
  removeMobileQueryListener?.()
  window.removeEventListener('keydown', handleChatMaximizeShortcut, { capture: true })
  window.removeEventListener('keydown', handleWorkspacePanelShortcut, { capture: true })
  window.removeEventListener('keydown', handleNewConversationShortcut)
  window.removeEventListener('keydown', handleGlobalEscape)
  window.removeEventListener('keydown', handleGlobalEnter)
  window.removeEventListener('keydown', handleToggleSidebarShortcut)
  terminalResizeObserver?.disconnect()
  removeTerminalClipboardBridge?.()
  if (fitFrame !== null) cancelAnimationFrame(fitFrame)
  if (fitTimer) clearTimeout(fitTimer)
  for (const timer of fitSettleTimers) clearTimeout(timer)
  fitSettleTimers.clear()
  if (sessionPollTimer) clearInterval(sessionPollTimer)
  if (gitStatePollTimer) clearInterval(gitStatePollTimer)
  if (settingsSaveTimer) clearTimeout(settingsSaveTimer)
  for (const timer of toastTimers.values()) clearTimeout(timer)
  toastTimers.clear()
  socket?.close()
  terminal?.dispose()
  shellResizeObserver?.disconnect()
  removeShellClipboardBridge?.()
  if (shellFitFrame !== null) cancelAnimationFrame(shellFitFrame)
  if (shellFitTimer) clearTimeout(shellFitTimer)
  shellSocket?.close()
  shellTerminal?.dispose()
})

onBeforeMount(() => {
  const stored = window.localStorage.getItem('claude-web-rainglow-theme')
  if (stored && rainglowThemes.some((theme) => theme.name === stored)) {
    selectedThemeName.value = stored
  }

  try {
    const storedGraphSettings = JSON.parse(window.localStorage.getItem(GRAPH_SETTINGS_KEY) || '{}')
    graphSettings.value = {
      style: storedGraphSettings.style === 'angular' ? 'angular' : 'rounded',
      muteNonHead: Boolean(storedGraphSettings.muteNonHead),
      showAuthor: storedGraphSettings.showAuthor !== false,
      showDate: storedGraphSettings.showDate !== false
    }
  } catch {
    // Corrupt stored settings fall back to defaults.
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

function pushToast(type: ToastType, message: string, duration = 3500) {
  const id = ++toastIdCounter
  toasts.value = [...toasts.value, { id, type, message }]
  const timer = setTimeout(() => dismissToast(id), duration)
  toastTimers.set(id, timer)
}

function dismissToast(id: number) {
  const timer = toastTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    toastTimers.delete(id)
  }
  toasts.value = toasts.value.filter((toast) => toast.id !== id)
}

function toastClass(type: ToastType) {
  if (type === 'success') return 'border-[#26a6a6] text-[#59d9d9]'
  if (type === 'error') return 'border-[#e61f44] text-[#ffb4c4]'
  if (type === 'warning') return 'border-[#f7b83d] text-[#f7b83d]'
  return 'border-[var(--rg-border)] text-[var(--rg-foreground)]'
}

function trackSessionRuntimeStates(list: SessionListItem[]) {
  for (const session of list) {
    const state = session.runtime?.state || 'unknown'
    const previous = sessionRuntimeStates.get(session.id)
    sessionRuntimeStates.set(session.id, state)
    trackCascadeState(session, state)
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

async function refreshFeatures() {
  loadingFeatures.value = true

  try {
    const response = await $fetch<{ features: SpecFeature[] }>('/api/specs/features')
    features.value = response.features
    void refreshTraceability()
  } finally {
    loadingFeatures.value = false
  }
}

async function refreshTraceability() {
  try {
    const response = await $fetch<{ features: TraceabilityInfo[] }>('/api/specs/traceability')
    traceability.value = new Map(response.features.map((feature) => [feature.featureId, feature]))
  } catch (error) {
    console.warn('Failed to load FR traceability', error)
  }
}

async function refreshSkills() {
  try {
    const response = await $fetch<{ skills: SkillInfo[] }>('/api/skills')
    skills.value = response.skills
  } catch (error) {
    console.warn('Failed to load skills', error)
  }
}

function featureRiskClass(risk: TraceabilityInfo['risk']) {
  if (risk === 'high') return 'border-[#f03e5f] text-[#f03e5f]'
  if (risk === 'medium') return 'border-[#f7b83d] text-[#f7b83d]'
  return 'border-[#bcd42a] text-[#bcd42a]'
}

async function refreshGitGraph() {
  const requestId = ++gitGraphRequestId
  const requestedCwd = graphWorkingDirectory.value
  loadingGitGraph.value = true
  gitGraphError.value = ''

  try {
    const response = await $fetch<GitGraphResponse>('/api/git/graph', {
      query: {
        cwd: requestedCwd || undefined,
        limit: graphLimit.value !== 120 ? graphLimit.value : undefined,
        branches: graphBranchFilter.value.length ? graphBranchFilter.value.join(',') : undefined
      }
    })
    if (requestId !== gitGraphRequestId) return
    gitGraph.value = response
    if (!selectedCommitHash.value || !response.commits.some((commit) => commit.hash === selectedCommitHash.value)) {
      selectedCommitHash.value = response.commits[0]?.hash || ''
    } else {
      void refreshSelectedCommitFiles()
    }
  } catch (error) {
    if (requestId !== gitGraphRequestId) return
    const message = error instanceof Error ? error.message : 'Failed to load git graph'
    gitGraphError.value = message
    gitGraph.value = null
    selectedCommitHash.value = ''
    selectedCommitFiles.value = []
    closeDiffPreview()
  } finally {
    if (requestId === gitGraphRequestId) loadingGitGraph.value = false
  }
}

async function pollGitState() {
  if (gitStatePollRunning || loadingGitGraph.value || gitActionRunning.value) return
  gitStatePollRunning = true

  try {
    const state = await $fetch<{
      headCommit: string
      branchListHash: string
      uncommittedFileCount: number
      workingTreeHash: string
      stashListHash: string
    }>('/api/git/state', {
      query: { cwd: graphWorkingDirectory.value || undefined }
    })
    const fingerprint = [state.headCommit, state.branchListHash, state.workingTreeHash, state.stashListHash].join(':')
    if (lastGitStateFingerprint && fingerprint !== lastGitStateFingerprint) {
      lastGitStateFingerprint = fingerprint
      await refreshGitGraph()
    } else {
      lastGitStateFingerprint = fingerprint
    }
  } catch {
    // Polling is best-effort; the manual refresh button still works.
  } finally {
    gitStatePollRunning = false
  }
}

function handleGraphListScroll(event: Event) {
  const el = event.target
  if (!(el instanceof HTMLElement)) return
  if (loadingGitGraph.value || !gitGraph.value) return
  // Load more when the loaded page is full and the user nears the bottom.
  if (gitGraph.value.commits.length < graphLimit.value) return
  if (graphLimit.value >= 1000) return
  if (el.scrollTop + el.clientHeight < el.scrollHeight - 200) return
  graphLimit.value = Math.min(1000, graphLimit.value + 120)
  void refreshGitGraph()
}

function toggleGraphBranchFilter(name: string) {
  const filter = new Set(graphBranchFilter.value)
  if (filter.has(name)) filter.delete(name)
  else filter.add(name)
  graphBranchFilter.value = [...filter]
  void refreshGitGraph()
}

function clearGraphBranchFilter() {
  if (!graphBranchFilter.value.length) return
  graphBranchFilter.value = []
  void refreshGitGraph()
}

function persistGraphSettings() {
  window.localStorage.setItem(GRAPH_SETTINGS_KEY, JSON.stringify(graphSettings.value))
}

function goToGraphFindMatch(direction: 1 | -1) {
  const matches = graphFindMatches.value
  if (!matches.length) return
  if (graphFindIndex.value === -1) {
    graphFindIndex.value = direction === 1 ? 0 : matches.length - 1
  } else {
    graphFindIndex.value = (graphFindIndex.value + direction + matches.length) % matches.length
  }
  const match = matches[graphFindIndex.value]
  if (!match) return
  selectCommit(match.hash)
  requestAnimationFrame(() => {
    document.querySelector(`[data-commit-hash="${match.hash}"]`)?.scrollIntoView({ block: 'nearest' })
  })
}

function selectCommit(hash: string) {
  selectedCommitHash.value = hash
  selectedUncommittedChanges.value = false
  compareView.value = null
  closeDiffPreview()
}

async function compareWithSelected(hash: string) {
  const from = selectedCommitHash.value
  closeGitContextMenu()
  if (!from || from === hash) return
  loadingCompare.value = true

  try {
    compareView.value = await $fetch<GitCompareResponse>('/api/git/compare', {
      query: {
        cwd: graphWorkingDirectory.value || undefined,
        from,
        to: hash
      }
    })
  } catch (error) {
    pushToast('error', `Failed to compare commits: ${extractFetchError(error)}`, 6000)
  } finally {
    loadingCompare.value = false
  }
}

function closeCompareView() {
  compareView.value = null
}

async function refreshWorktrees() {
  loadingWorktrees.value = true
  try {
    const response = await $fetch<{ worktrees: WorktreeItem[] }>('/api/worktrees', {
      query: { cwd: graphWorkingDirectory.value || undefined }
    })
    worktrees.value = response.worktrees
  } catch (error) {
    pushToast('error', `Failed to load worktrees: ${extractFetchError(error)}`, 6000)
  } finally {
    loadingWorktrees.value = false
  }
}

async function openWorktreesModal() {
  showWorktreesModal.value = true
  await nextTick()
  worktreesCreateRef.value?.focus()
  await refreshWorktrees()
}

async function createWorktree() {
  const result = await openGitDialog({
    title: 'Create Worktree',
    message: 'The worktree is created under the managed spec-cat tmp directory.',
    confirmLabel: 'Create',
    fields: [
      { kind: 'text', key: 'branch', label: 'Branch (created if missing)', value: '', placeholder: 'sc/experiment' },
      { kind: 'text', key: 'baseRef', label: 'Base ref (for a new branch)', value: 'HEAD' }
    ]
  })
  if (!result || !result.branch || worktreeActionRunning.value) return
  worktreeActionRunning.value = true

  try {
    await $fetch('/api/worktrees', {
      method: 'POST',
      body: {
        cwd: graphWorkingDirectory.value || undefined,
        branch: result.branch,
        baseRef: result.baseRef || undefined
      }
    })
    pushToast('success', `Worktree for ${result.branch} created.`)
    await refreshWorktrees()
  } catch (error) {
    pushToast('error', `Failed to create worktree: ${extractFetchError(error)}`, 6000)
  } finally {
    worktreeActionRunning.value = false
  }
}

async function removeWorktree(worktree: WorktreeItem) {
  if (worktreeActionRunning.value) return
  const name = worktree.path.split('/').pop() || ''
  const result = await openGitDialog({
    title: 'Remove Worktree',
    message: `Remove worktree ${name} (${worktree.branch || 'detached'})?`,
    danger: true,
    confirmLabel: 'Remove',
    fields: [{ kind: 'checkbox', key: 'deleteBranch', label: 'Also delete the branch', value: false }]
  })
  if (!result) return
  worktreeActionRunning.value = true

  try {
    await $fetch(`/api/worktrees/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      query: {
        cwd: graphWorkingDirectory.value || undefined,
        deleteBranch: result.deleteBranch ? 'true' : undefined
      }
    })
    pushToast('success', `Worktree ${name} removed.`)
    await refreshWorktrees()
  } catch (error) {
    pushToast('error', `Failed to remove worktree: ${extractFetchError(error)}`, 6000)
  } finally {
    worktreeActionRunning.value = false
  }
}

async function refreshRemotes() {
  loadingRemotes.value = true
  try {
    const response = await $fetch<{ remotes: GitRemoteDetail[] }>('/api/git/remotes', {
      query: { cwd: graphWorkingDirectory.value || undefined }
    })
    remotes.value = response.remotes
  } catch (error) {
    pushToast('error', `Failed to load remotes: ${extractFetchError(error)}`, 6000)
  } finally {
    loadingRemotes.value = false
  }
}

async function openRemotesModal() {
  showRemotesModal.value = true
  await nextTick()
  remotesAddRef.value?.focus()
  await refreshRemotes()
}

async function addRemote() {
  const result = await openGitDialog({
    title: 'Add Remote',
    confirmLabel: 'Add',
    fields: [
      { kind: 'text', key: 'remote', label: 'Remote name', value: '', placeholder: 'origin' },
      { kind: 'text', key: 'url', label: 'URL', value: '', placeholder: 'git@github.com:user/repo.git' }
    ]
  })
  if (!result || !result.remote || !result.url) return
  if (await runGitAction('addRemote', { remote: result.remote, url: result.url })) {
    await refreshRemotes()
  }
}

async function editRemote(remote: GitRemoteDetail) {
  const result = await openGitDialog({
    title: 'Edit Remote',
    message: `Change the URL of ${remote.name}.`,
    confirmLabel: 'Save',
    fields: [{ kind: 'text', key: 'url', label: 'URL', value: remote.fetchUrl }]
  })
  if (!result || !result.url || result.url === remote.fetchUrl) return
  if (await runGitAction('editRemote', { remote: remote.name, url: result.url })) {
    await refreshRemotes()
  }
}

async function removeRemote(remote: GitRemoteDetail) {
  const result = await openGitDialog({
    title: 'Delete Remote',
    message: `Delete remote ${remote.name} (${remote.fetchUrl})?`,
    danger: true,
    confirmLabel: 'Delete'
  })
  if (!result) return
  if (await runGitAction('deleteRemote', { remote: remote.name })) {
    await refreshRemotes()
  }
}

function selectUncommittedChanges() {
  selectedUncommittedChanges.value = true
  selectedCommitHash.value = ''
  selectedCommitFiles.value = []
  compareView.value = null
  closeDiffPreview()
}

async function refreshSelectedCommitFiles() {
  const commit = selectedCommit.value
  if (!commit || selectedUncommittedChanges.value) {
    selectedCommitFiles.value = []
    commitFilesError.value = ''
    return
  }

  loadingCommitFiles.value = true
  commitFilesError.value = ''
  const requestedHash = commit.hash

  try {
    const response = await $fetch<{ files: GitCommitFile[] }>('/api/git/commit-files', {
      query: {
        cwd: graphWorkingDirectory.value || undefined,
        hash: requestedHash
      }
    })
    if (selectedCommitHash.value !== requestedHash) return
    selectedCommitFiles.value = response.files
    if (selectedCommitFilePath.value && !response.files.some((file) => file.path === selectedCommitFilePath.value)) {
      closeDiffPreview()
    }
  } catch (error) {
    if (selectedCommitHash.value !== requestedHash) return
    commitFilesError.value = extractFetchError(error)
    selectedCommitFiles.value = []
  } finally {
    if (selectedCommitHash.value === requestedHash) loadingCommitFiles.value = false
  }
}

async function openDiffPreview(file: GitCommitFile) {
  const commit = selectedCommit.value
  if (!commit) return

  // Clicking the file that is already previewed toggles the preview closed;
  // a failed load stays open so the click retries instead.
  if (selectedCommitFilePath.value === file.path && !diffPreviewError.value) {
    closeDiffPreview()
    return
  }

  selectedCommitFilePath.value = file.path
  loadingDiffPreview.value = true
  diffPreviewError.value = ''

  try {
    diffPreview.value = await $fetch<GitFileDiff>('/api/git/file-diff', {
      query: {
        cwd: graphWorkingDirectory.value || undefined,
        hash: commit.hash,
        path: file.path,
        oldPath: file.oldPath || undefined
      }
    })
  } catch (error) {
    diffPreviewError.value = extractFetchError(error)
    diffPreview.value = null
  } finally {
    loadingDiffPreview.value = false
  }
}

function closeDiffPreview() {
  selectedCommitFilePath.value = ''
  diffPreview.value = null
  diffPreviewError.value = ''
  loadingDiffPreview.value = false
}

function closeSpecPreview() {
  selectedSpecFile.value = null
  selectedSpecContent.value = ''
  renderedSpecHtml.value = ''
  loadingSpecContent.value = false
}

// Close the frontmost open modal, ordered by stacking priority (higher
// z-index first). Returns true when something was closed. Centralizing this
// makes Escape work regardless of where focus sits — the per-modal handlers
// only fired when focus happened to be inside the modal.
function closeTopmostModal(): boolean {
  if (gitDialog.value) { cancelGitDialog(); return true }
  if (showWorktreesModal.value) { showWorktreesModal.value = false; return true }
  if (showSpecEditModal.value) { showSpecEditModal.value = false; return true }
  if (specViewerFeatureId.value) { closeSpecViewer(); return true }
  if (showRemotesModal.value) { showRemotesModal.value = false; return true }
  if (showIntegrationModal.value) { showIntegrationModal.value = false; return true }
  if (showConflictReport.value) { showConflictReport.value = false; return true }
  if (showNewSessionModal.value) { showNewSessionModal.value = false; return true }
  if (showSettingsModal.value) { showSettingsModal.value = false; return true }
  return false
}

function handleGlobalEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  // Modals sit above everything, so Escape dismisses the frontmost one first.
  if (closeTopmostModal()) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  if (diffPreview.value || diffPreviewError.value) {
    event.preventDefault()
    closeDiffPreview()
  }
}

// Submit the frontmost open modal, matching closeTopmostModal's priority.
// Returns true when a modal handled it. Text fields, textareas and buttons are
// excluded by the caller so they keep their native Enter behavior.
function submitTopmostModal(): boolean {
  if (gitDialog.value) { confirmGitDialog(); return true }
  if (showWorktreesModal.value) { void createWorktree(); return true }
  if (showSpecEditModal.value) { void saveSpecEdit(); return true }
  if (showRemotesModal.value) { void addRemote(); return true }
  if (showIntegrationModal.value) { void runSessionIntegration(); return true }
  if (showConflictReport.value) { showConflictReport.value = false; return true }
  if (showNewSessionModal.value) { void createNewSession(); return true }
  if (showSettingsModal.value) { showSettingsModal.value = false; return true }
  return false
}

function handleGlobalEnter(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.defaultPrevented) return
  // Plain Enter only: Shift/Ctrl/Cmd/Alt+Enter (newlines, the spec editor's
  // save chord) and IME composition must pass through untouched.
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
  // Only act on the modal chrome. Anything a user types into (inputs, the
  // finalize textarea, xterm's hidden textarea) or a focused button/link keeps
  // its native Enter — including a form's own implicit submit.
  const target = event.target
  if (target instanceof HTMLElement && target.closest('input, textarea, button, a, [contenteditable]')) return
  if (submitTopmostModal()) event.preventDefault()
}

// ⌘⌥L flips the chat between its default width and the maximized width.
function handleChatMaximizeShortcut(event: KeyboardEvent) {
  const isL = event.key.toLowerCase() === 'l' || event.code === 'KeyL'
  if (event.repeat || !isL || !isWorkspaceShortcutChord(event)) return
  event.preventDefault()
  event.stopPropagation()
  chatMaximized.value = !chatMaximized.value
}

function isWorkspaceShortcutChord(event: KeyboardEvent) {
  return (event.metaKey && event.altKey) || (event.ctrlKey && event.altKey && !event.metaKey)
}

function consumeWorkspaceShortcut(event: KeyboardEvent) {
  event.preventDefault()
  event.stopPropagation()
}

function openChatPanel() {
  activeSidebarPanel.value = 'conversations'
  databaseOpen.value = false
  sidebarCollapsed.value = false
}

function openTerminalPanel() {
  activeSidebarPanel.value = 'terminal'
  databaseOpen.value = false
  sidebarCollapsed.value = false
  activateShellPanel()
}

function openDatabasePanel() {
  databaseOpen.value = true
}

function handleWorkspacePanelShortcut(event: KeyboardEvent) {
  if (event.repeat || !isWorkspaceShortcutChord(event)) return
  const key = event.key.toLowerCase()
  const code = event.code

  if (key === '1' || code === 'Digit1') {
    consumeWorkspaceShortcut(event)
    openChatPanel()
    return
  }
  if (key === '2' || code === 'Digit2' || key === 't' || code === 'KeyT') {
    consumeWorkspaceShortcut(event)
    openTerminalPanel()
    return
  }
  if (key === '3' || code === 'Digit3' || key === 'd' || code === 'KeyD') {
    consumeWorkspaceShortcut(event)
    openDatabasePanel()
  }
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

// Ctrl/Cmd + B toggles the explorer sidebar, matching the VS Code shortcut.
function handleToggleSidebarShortcut(event: KeyboardEvent) {
  if (event.repeat || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'b') return
  event.preventDefault()
  toggleSidebar()
}

// Reveal the sidebar and switch panels; clicking the active panel while it is
// open collapses the sidebar, mirroring the activity-bar toggle behaviour.
function selectSidebarPanel(panel: 'conversations' | 'terminal') {
  if (!sidebarCollapsed.value && activeSidebarPanel.value === panel) {
    sidebarCollapsed.value = true
    return
  }
  activeSidebarPanel.value = panel
  sidebarCollapsed.value = false
  // Both panels overlay the conversation on mobile, so only one can be up.
  if (isMobile.value) specPanelCollapsed.value = true
}

function openSpecPanel() {
  specPanelCollapsed.value = false
  if (isMobile.value) sidebarCollapsed.value = true
}

function handleNewConversationShortcut(event: KeyboardEvent) {
  if (
    event.repeat
    || event.key.toLowerCase() !== 'n'
    || event.ctrlKey
    || event.metaKey
    || event.altKey
    || event.shiftKey
    || showNewSessionModal.value
    || showIntegrationModal.value
    || isEditableShortcutTarget(event.target)
  ) return

  event.preventDefault()
  // On the Terminal panel N creates a shell; elsewhere it starts a conversation.
  if (activeSidebarPanel.value === 'terminal') {
    void createShell()
    return
  }
  void openNewSessionModal()
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return target.isContentEditable
    || tag === 'input'
    || tag === 'textarea'
    || tag === 'select'
    || Boolean(target.closest('.terminal'))
}

function toggleGitGraphPinned() {
  gitGraphState.value = gitGraphState.value === 'pinned' ? 'floating' : 'pinned'
}

function contextMenuPosition(event: MouseEvent | KeyboardEvent) {
  if (event instanceof MouseEvent) return { x: event.clientX, y: event.clientY }
  const rect = event.currentTarget instanceof HTMLElement
    ? event.currentTarget.getBoundingClientRect()
    : { left: 0, bottom: 0 }
  return { x: rect.left, y: rect.bottom }
}

function focusGitContextMenu() {
  requestAnimationFrame(() => gitContextMenuEl.value?.focus())
}

function isContextMenuKey(event: KeyboardEvent) {
  return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')
}

function openCommitContextMenu(event: MouseEvent | KeyboardEvent, commit: GitCommit) {
  if (event instanceof KeyboardEvent && !isContextMenuKey(event)) return
  event.preventDefault()
  const { x, y } = contextMenuPosition(event)
  gitContextMenu.value = { type: 'commit', x, y, commit }
  focusGitContextMenu()
}

function openBranchContextMenu(event: MouseEvent, commit: GitCommit, branch: string) {
  event.preventDefault()
  event.stopPropagation()
  gitContextMenu.value = { type: 'branch', x: event.clientX, y: event.clientY, branch, commit }
}

function openTagContextMenu(event: MouseEvent, commit: GitCommit, tag: string) {
  event.preventDefault()
  event.stopPropagation()
  gitContextMenu.value = { type: 'tag', x: event.clientX, y: event.clientY, tag, commit }
}

function openWorkingTreeContextMenu(event: MouseEvent | KeyboardEvent) {
  if (event instanceof KeyboardEvent && !isContextMenuKey(event)) return
  event.preventDefault()
  const { x, y } = contextMenuPosition(event)
  gitContextMenu.value = { type: 'workingTree', x, y }
  focusGitContextMenu()
}

function openStashContextMenu(event: MouseEvent | KeyboardEvent, stash: GitStash) {
  if (event instanceof KeyboardEvent && !isContextMenuKey(event)) return
  event.preventDefault()
  const { x, y } = contextMenuPosition(event)
  gitContextMenu.value = { type: 'stash', x, y, stash }
  focusGitContextMenu()
}

function closeGitContextMenu() {
  gitContextMenu.value = null
}

function closeFloatingMenus() {
  closeGitContextMenu()
  showGraphBranchDropdown.value = false
  showGraphSettingsDropdown.value = false
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

async function runGitAction(action: string, payload: Record<string, unknown> = {}) {
  if (gitActionRunning.value) return false
  gitActionRunning.value = true
  gitActionMessage.value = ''
  closeGitContextMenu()

  try {
    await $fetch('/api/git/action', {
      method: 'POST',
      body: {
        cwd: graphWorkingDirectory.value || undefined,
        action,
        ...payload
      }
    })
    await refreshGitGraph()
    return true
  } catch (error) {
    const message = extractFetchError(error)
    gitActionMessage.value = message
    pushToast('error', message, 6000)
    return false
  } finally {
    gitActionRunning.value = false
  }
}

async function copyText(value: string) {
  closeGitContextMenu()
  if (await writeClipboard(value)) {
    gitActionMessage.value = 'Copied.'
    pushToast('success', 'Copied to clipboard.', 2000)
  } else {
    pushToast('error', 'Could not copy to clipboard.', 4000)
  }
}

function handleTerminalCopyKey(event: KeyboardEvent, getTerminal: () => Terminal | null) {
  if (event.type !== 'keydown' || event.key.toLowerCase() !== 'c' || !(event.metaKey || event.ctrlKey)) return true
  const selected = getTerminal()?.getSelection()
  if (!selected) return true
  event.preventDefault()
  event.stopPropagation()
  void writeTerminalSelection(selected, true)
  return false
}

function attachTerminalClipboardBridge(term: Terminal, mount: HTMLElement) {
  let lastCopiedSelection = ''
  let pointerStartedInTerminal = false
  let selectionChanged = false

  const selectionDisposable = term.onSelectionChange(() => {
    selectionChanged = true
    if (!term.getSelection()) lastCopiedSelection = ''
  })

  const handlePointerDown = () => {
    pointerStartedInTerminal = true
    selectionChanged = false
  }

  const handlePointerUp = () => {
    if (!pointerStartedInTerminal) return
    pointerStartedInTerminal = false
    const selected = term.getSelection()
    if (!selectionChanged || !selected || selected === lastCopiedSelection) return
    lastCopiedSelection = selected
    void writeTerminalSelection(selected, false)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    handleTerminalCopyKey(event, () => term)
  }

  mount.addEventListener('pointerdown', handlePointerDown)
  mount.addEventListener('keydown', handleKeyDown, { capture: true })
  window.addEventListener('pointerup', handlePointerUp)

  return () => {
    selectionDisposable.dispose()
    mount.removeEventListener('pointerdown', handlePointerDown)
    mount.removeEventListener('keydown', handleKeyDown, { capture: true })
    window.removeEventListener('pointerup', handlePointerUp)
  }
}

async function writeTerminalSelection(value: string, notifySuccess: boolean) {
  if (await writeClipboard(value)) {
    if (notifySuccess) pushToast('success', 'Selection copied to clipboard.', 1200)
  } else {
    pushToast('error', 'Could not copy terminal selection.', 4000)
  }
}

// navigator.clipboard only exists in secure contexts (https/localhost), so the
// LAN-IP http case falls back to the legacy execCommand copy.
async function writeClipboard(value: string): Promise<boolean> {
  try {
    if (window.navigator.clipboard?.writeText) {
      await window.navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // Permission denied or blocked context — fall through to the legacy path.
  }
  return legacyCopy(value)
}

function legacyCopy(value: string): boolean {
  try {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

function remoteParts(branch: string) {
  const [remote, ...rest] = branch.split('/')
  return { remote, branch: rest.join('/') || branch }
}

async function checkoutRef(value: string) {
  await runGitAction('checkout', { branch: value })
}

async function createBranchFrom(hash: string) {
  const result = await openGitDialog({
    title: 'Create Branch',
    message: `From commit ${hash.slice(0, 8)}`,
    confirmLabel: 'Create',
    fields: [{ kind: 'text', key: 'newName', label: 'Branch name', value: '', placeholder: 'feature/my-branch' }]
  })
  if (!result || !result.newName) return
  await runGitAction('createBranch', { hash, newName: result.newName })
}

async function renameBranch(branch: string) {
  const result = await openGitDialog({
    title: 'Rename Branch',
    confirmLabel: 'Rename',
    fields: [{ kind: 'text', key: 'newName', label: 'New branch name', value: branch }]
  })
  if (!result || !result.newName || result.newName === branch) return
  await runGitAction('renameBranch', { branch, newName: result.newName })
}

async function deleteBranch(branch: string, isRemote: boolean) {
  if (isRemote) {
    const result = await openGitDialog({
      title: 'Delete Remote Branch',
      message: `Delete branch ${branch} from its remote?`,
      danger: true,
      confirmLabel: 'Delete'
    })
    if (!result) return
    const parts = remoteParts(branch)
    await runGitAction('deleteRemoteBranch', { remote: parts.remote, branch: parts.branch })
    return
  }
  const result = await openGitDialog({
    title: 'Delete Branch',
    message: `Delete branch ${branch}?`,
    danger: true,
    confirmLabel: 'Delete',
    fields: [{ kind: 'checkbox', key: 'force', label: 'Force delete even if not fully merged', value: false }]
  })
  if (!result) return
  await runGitAction('deleteBranch', { branch, force: result.force })
}

async function mergeRef(value: string) {
  const result = await openGitDialog({
    title: 'Merge into Current Branch',
    message: `Merge ${value} into the current branch.`,
    confirmLabel: 'Merge',
    fields: [
      { kind: 'checkbox', key: 'noCommit', label: 'No commit (--no-commit)', value: false },
      { kind: 'checkbox', key: 'noFastForward', label: 'Create a merge commit (--no-ff)', value: false },
      { kind: 'checkbox', key: 'squash', label: 'Squash commits (--squash)', value: false }
    ]
  })
  if (!result) return
  await runGitAction('merge', {
    branch: value,
    noCommit: result.noCommit,
    noFastForward: result.noFastForward,
    squash: result.squash
  })
}

async function rebaseOnto(value: string) {
  const result = await openGitDialog({
    title: 'Rebase',
    message: `Rebase the current branch onto ${value}?`,
    confirmLabel: 'Rebase'
  })
  if (!result) return
  await runGitAction('rebase', { branch: value })
}

async function stageFiles(files: string[] = []) {
  await runGitAction('stage', { files })
}

async function unstageFiles(files: string[] = []) {
  await runGitAction('unstage', { files })
}

async function commitStagedChanges() {
  const message = gitCommitMessage.value.trim()
  if (!message) return
  if (await runGitAction('commit', { message })) {
    gitCommitMessage.value = ''
    selectedUncommittedChanges.value = false
  }
}

async function pushBranch(branch: string) {
  const result = await openGitDialog({
    title: 'Push Branch',
    message: `Push ${branch} to a remote.`,
    confirmLabel: 'Push',
    fields: [
      { kind: 'text', key: 'remote', label: 'Remote', value: 'origin' },
      { kind: 'checkbox', key: 'forceWithLease', label: 'Force push (--force-with-lease)', value: false }
    ]
  })
  if (!result) return
  await runGitAction('push', { remote: result.remote || 'origin', branch, forceWithLease: result.forceWithLease })
}

async function pullBranch(branch: string) {
  const result = await openGitDialog({
    title: 'Pull Branch',
    message: `Pull ${branch} from a remote.`,
    confirmLabel: 'Pull',
    fields: [{ kind: 'text', key: 'remote', label: 'Remote', value: 'origin' }]
  })
  if (!result) return
  await runGitAction('pull', { remote: result.remote || 'origin', branch })
}

async function fetchBranch(branch?: string) {
  await runGitAction('fetch', branch ? { branch } : {})
}

async function addTag(hash: string) {
  const result = await openGitDialog({
    title: 'Add Tag',
    message: `Tag commit ${hash.slice(0, 8)}.`,
    confirmLabel: 'Add Tag',
    fields: [
      { kind: 'text', key: 'tag', label: 'Tag name', value: '', placeholder: 'v1.0.0' },
      { kind: 'text', key: 'message', label: 'Annotated tag message (empty for lightweight)', value: '' }
    ]
  })
  if (!result || !result.tag) return
  await runGitAction('addTag', { hash, tag: result.tag, message: result.message })
}

async function deleteTag(tag: string) {
  const result = await openGitDialog({
    title: 'Delete Tag',
    message: `Delete tag ${tag}?`,
    danger: true,
    confirmLabel: 'Delete',
    fields: [
      { kind: 'checkbox', key: 'deleteRemote', label: 'Also delete from remote', value: false },
      { kind: 'text', key: 'remote', label: 'Remote', value: 'origin' }
    ]
  })
  if (!result) return
  await runGitAction('deleteTag', {
    tag,
    deleteRemote: result.deleteRemote,
    remote: result.deleteRemote ? result.remote || 'origin' : undefined
  })
}

async function pushTag(tag: string) {
  const result = await openGitDialog({
    title: 'Push Tag',
    message: `Push tag ${tag} to a remote.`,
    confirmLabel: 'Push',
    fields: [{ kind: 'text', key: 'remote', label: 'Remote', value: 'origin' }]
  })
  if (!result) return
  await runGitAction('pushTag', { tag, remote: result.remote || 'origin' })
}

async function cherryPickCommit(hash: string) {
  const result = await openGitDialog({
    title: 'Cherry Pick',
    message: `Cherry pick commit ${hash.slice(0, 8)} onto the current branch.`,
    confirmLabel: 'Cherry Pick',
    fields: [{ kind: 'checkbox', key: 'noCommit', label: 'No commit (--no-commit)', value: false }]
  })
  if (!result) return
  await runGitAction('cherryPick', { hash, noCommit: result.noCommit })
}

async function revertCommit(hash: string) {
  const result = await openGitDialog({
    title: 'Revert Commit',
    message: `Revert commit ${hash.slice(0, 8)}?`,
    danger: true,
    confirmLabel: 'Revert'
  })
  if (!result) return
  await runGitAction('revert', { hash })
}

async function resetToCommit(hash: string) {
  const result = await openGitDialog({
    title: 'Reset Current Branch',
    message: `Reset the current branch to ${hash.slice(0, 8)}. Hard reset discards local changes.`,
    danger: true,
    confirmLabel: 'Reset',
    fields: [{ kind: 'select', key: 'mode', label: 'Reset mode', value: 'mixed', options: ['soft', 'mixed', 'hard'] }]
  })
  if (!result) return
  const mode = result.mode
  if (mode !== 'soft' && mode !== 'mixed' && mode !== 'hard') return
  await runGitAction('reset', { hash, mode })
}

async function stashWorkingTree() {
  const result = await openGitDialog({
    title: 'Stash Changes',
    confirmLabel: 'Stash',
    fields: [
      { kind: 'text', key: 'message', label: 'Stash message (optional)', value: '' },
      { kind: 'checkbox', key: 'includeUntracked', label: 'Include untracked files', value: false }
    ]
  })
  if (!result) return
  await runGitAction('stash', { message: result.message, includeUntracked: result.includeUntracked })
}

async function resetWorkingTree() {
  const result = await openGitDialog({
    title: 'Reset Working Tree',
    message: 'Hard reset discards local changes.',
    danger: true,
    confirmLabel: 'Reset',
    fields: [{ kind: 'select', key: 'mode', label: 'Reset mode', value: 'mixed', options: ['mixed', 'hard'] }]
  })
  if (!result) return
  const mode = result.mode
  if (mode !== 'mixed' && mode !== 'hard') return
  await runGitAction('resetWorking', { mode })
}

async function cleanUntracked() {
  const result = await openGitDialog({
    title: 'Clean Untracked Files',
    message: 'Delete untracked files and directories? This cannot be undone.',
    danger: true,
    confirmLabel: 'Delete'
  })
  if (!result) return
  await runGitAction('cleanUntracked')
}

async function applyStash(index: number) {
  await runGitAction('applyStash', { stash: index })
}

async function popStash(index: number) {
  await runGitAction('popStash', { stash: index })
}

async function dropStash(index: number) {
  const result = await openGitDialog({
    title: 'Drop Stash',
    message: `Drop ${stashName(index)}? This cannot be undone.`,
    danger: true,
    confirmLabel: 'Drop'
  })
  if (!result) return
  await runGitAction('dropStash', { stash: index })
}

async function createBranchFromStash(index: number) {
  const result = await openGitDialog({
    title: 'Create Branch from Stash',
    message: `Create a branch from ${stashName(index)}.`,
    confirmLabel: 'Create',
    fields: [{ kind: 'text', key: 'newName', label: 'Branch name', value: '' }]
  })
  if (!result || !result.newName) return
  await runGitAction('stashBranch', { stash: index, newName: result.newName })
}

function connect(
  targetSessionId?: string,
  provider?: ProviderId,
  creationOptions?: { baseBranch?: string; featureId?: string }
) {
  if (!terminal) return

  lastSentTerminalSize = { cols: 0, rows: 0 }

  socket?.close()
  status.value = 'connecting'
  terminal.reset()
  const providerLabel = provider || activeSession.value?.provider || 'claude'
  terminal.writeln(`Connecting to ${providerLabel} CLI...\r\n`)

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const currentSocket = new WebSocket(`${protocol}//${window.location.host}/api/terminal`)
  socket = currentSocket

  currentSocket.addEventListener('open', () => {
    if (socket !== currentSocket) return
    status.value = 'connected'
    performTerminalFit(false)
    currentSocket.send(
      JSON.stringify({
        type: 'attach',
        sessionId: targetSessionId,
        provider,
        baseBranch: creationOptions?.baseBranch,
        featureId: creationOptions?.featureId,
        cols: terminal?.cols,
        rows: terminal?.rows
      })
    )
    terminal?.focus()
  })

  currentSocket.addEventListener('message', (event) => {
    if (socket !== currentSocket) return
    const data = String(event.data)
    const control = parseControlMessage(data)

    if (control?.type === 'attached' && typeof control.sessionId === 'string') {
      setSessionId(control.sessionId)
      settleTerminalFit()
      void refreshSessions()
      return
    }

    if (control?.type === 'hello') {
      return
    }

    if (control?.type === 'git-changed') {
      // The worktree HEAD moved (commit synced sc/preview server-side). Refresh
      // the graph and the session list now instead of waiting for the periodic
      // fingerprint poll, so the preview branch and its badge follow the commit.
      // Refresh unconditionally: the fingerprint poll only runs while the graph
      // is open, so gating here would let an auto-commit's preview advance go
      // unshown until the next manual action (toggle/rebase).
      lastGitStateFingerprint = ''
      void refreshSessions()
      void refreshGitGraph()
      return
    }

    terminal?.write(data)
  })

  currentSocket.addEventListener('close', () => {
    if (socket !== currentSocket) return
    status.value = 'closed'
    terminal?.writeln('\r\n\r\n[connection closed]')
  })

  currentSocket.addEventListener('error', () => {
    if (socket !== currentSocket) return
    terminal?.writeln('\r\n\r\n[websocket error]')
  })
}

async function refreshShells() {
  loadingShells.value = true
  try {
    const response = await $fetch<{ shells: ShellSessionInfo[] }>('/api/shells')
    shells.value = response.shells
    if (activeShellId.value && !shells.value.some((shell) => shell.id === activeShellId.value)) {
      activeShellId.value = ''
    }
  } catch {
    // A failed refresh keeps the current list; the Refresh button retries.
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
    await $fetch(`/api/shells/${encodeURIComponent(id)}`, { method: 'DELETE' })
  } catch (error) {
    pushToast('error', `Failed to close terminal: ${extractFetchError(error)}`, 6000)
    return
  }

  const remaining = shells.value.filter((shell) => shell.id !== id)
  shells.value = remaining
  if (activeShellId.value === id) {
    activeShellId.value = ''
    shellSocket?.close()
    shellSocket = null
    shellTerminal?.reset()
    if (remaining.length) selectShell(remaining[0]!.id)
  }
}

function selectShell(id: string) {
  if (!id) return
  activeShellId.value = id
  connectShell(id)
}

function connectShell(id: string) {
  if (!shellTerminal) return

  lastSentShellSize = { cols: 0, rows: 0 }
  shellSocket?.close()
  shellTerminal.reset()

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const currentSocket = new WebSocket(`${protocol}//${window.location.host}/api/shell`)
  shellSocket = currentSocket

  currentSocket.addEventListener('open', () => {
    if (shellSocket !== currentSocket) return
    performShellFit(false)
    currentSocket.send(
      JSON.stringify({
        type: 'attach',
        shellId: id,
        cols: shellTerminal?.cols,
        rows: shellTerminal?.rows
      })
    )
    shellTerminal?.focus()
  })

  currentSocket.addEventListener('message', (event) => {
    if (shellSocket !== currentSocket) return
    const data = String(event.data)
    const control = parseShellControlMessage(data)
    if (control?.type === 'attached') {
      settleShellFit()
      return
    }
    if (control?.type === 'exited') {
      handleShellExited(control.shellId)
      return
    }
    if (control?.type === 'hello') return
    shellTerminal?.write(data)
  })

  currentSocket.addEventListener('close', () => {
    if (shellSocket !== currentSocket) return
    // A closed socket without a preceding 'exited' control is a transient drop
    // (server reload); stay silent and let a panel revisit reconnect.
  })

  currentSocket.addEventListener('error', () => {
    if (shellSocket !== currentSocket) return
    shellTerminal?.writeln('\r\n\r\n[terminal error]')
  })
}

function sendShellResize() {
  if (!shellTerminal || shellSocket?.readyState !== WebSocket.OPEN) return false
  shellSocket.send(
    JSON.stringify({ type: 'resize', cols: shellTerminal.cols, rows: shellTerminal.rows })
  )
  return true
}

function performShellFit(notifyServer = true) {
  if (!shellTerminal || !shellFitAddon) return
  const mount = shellTerminalEl.value
  if (!mount || mount.clientWidth < 1 || mount.clientHeight < 1) return

  const dimensions = shellFitAddon.proposeDimensions()
  if (!dimensions || dimensions.cols < 1 || dimensions.rows < 1) return

  if (dimensions.cols !== shellTerminal.cols || dimensions.rows !== shellTerminal.rows) {
    shellFitAddon.fit()
  }

  if (shellTerminal.cols < 1 || shellTerminal.rows < 1) return
  if (shellTerminal.cols === lastSentShellSize.cols && shellTerminal.rows === lastSentShellSize.rows) return

  if (notifyServer && sendShellResize()) {
    lastSentShellSize = { cols: shellTerminal.cols, rows: shellTerminal.rows }
  }
}

function scheduleShellFit(delay = 0) {
  if (shellFitTimer) {
    clearTimeout(shellFitTimer)
    shellFitTimer = null
  }
  if (shellFitFrame !== null) {
    cancelAnimationFrame(shellFitFrame)
    shellFitFrame = null
  }
  shellFitTimer = setTimeout(() => {
    shellFitTimer = null
    shellFitFrame = window.requestAnimationFrame(() => {
      shellFitFrame = null
      performShellFit()
    })
  }, delay)
}

function settleShellFit() {
  scheduleShellFit()
  for (const delay of [50, 150, 350]) {
    setTimeout(() => scheduleShellFit(), delay)
  }
}

function parseShellControlMessage(
  data: string
): { type: 'hello' } | { type: 'attached'; shellId: string } | { type: 'exited'; shellId: string } | null {
  if (!data.startsWith('\x00')) return null
  try {
    const value: unknown = JSON.parse(data.slice(1))
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    if (record.type === 'hello') return { type: 'hello' }
    if (record.type === 'attached' && typeof record.shellId === 'string') {
      return { type: 'attached', shellId: record.shellId }
    }
    if (record.type === 'exited' && typeof record.shellId === 'string') {
      return { type: 'exited', shellId: record.shellId }
    }
    return null
  } catch {
    return null
  }
}

function handleShellExited(id: string) {
  const remaining = shells.value.filter((shell) => shell.id !== id)
  shells.value = remaining
  if (activeShellId.value !== id) return

  // The exited shell was the visible one: drop the socket, clear the buffer,
  // and fall back to another shell (or the empty state) with no leftover text.
  activeShellId.value = ''
  shellSocket?.close()
  shellSocket = null
  shellTerminal?.reset()
  if (remaining.length) selectShell(remaining[remaining.length - 1]!.id)
}

function selectSession(id: string) {
  const selected = sessions.value.find((session) => session.id === id)
  selectedArchivedSessionId.value = ''
  if (terminal) terminal.options.cursorBlink = true
  // On mobile the sidebar and spec browser overlay the conversation; collapse
  // them so opening a conversation reveals the main panel underneath.
  if (isMobile.value) {
    sidebarCollapsed.value = true
    specPanelCollapsed.value = true
  }
  if (selected?.finalized) {
    activeSidebarPanel.value = 'conversations'
    socket?.close()
    setSessionId(id)
    status.value = 'closed'
    terminal?.reset()
    terminal?.writeln(`[finalized into ${selected.baseBranch || 'base'} at ${selected.finalCommit?.slice(0, 8) || 'unknown'}]`)
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
  socket?.close()
  socket = null
  status.value = 'closed'
  terminal?.reset()
  if (terminal) terminal.options.cursorBlink = false

  try {
    const response = await $fetch<{ log: string }>(
      `/api/sessions/archives/${encodeURIComponent(session.id)}/log`
    )
    if (selectedArchivedSessionId.value !== session.id) return
    if (response.log) {
      terminal?.write(response.log, () => terminal?.scrollToBottom())
    } else {
      terminal?.writeln('[No persisted terminal history]')
    }
  } catch (error) {
    if (selectedArchivedSessionId.value !== session.id) return
    terminal?.writeln(`[Failed to load archived conversation: ${extractFetchError(error)}]`)
  }
}

// A card click opens the viewer modal on the feature's primary document —
// spec.md when it exists, otherwise whatever the directory leads with.
function openSpecViewer(feature: SpecFeature) {
  specViewerFeatureId.value = feature.id
  const file = feature.files.find((entry) => entry.filename === 'spec.md') || feature.files[0]
  if (file) void selectSpecFile(feature.id, file)
  else closeSpecPreview()
}

function closeSpecViewer() {
  specViewerFeatureId.value = ''
  closeSpecPreview()
}

async function selectSpecFile(featureId: string, file: SpecFile) {
  const requestId = ++specContentRequestId
  selectedSpecFile.value = { featureId, filename: file.filename, label: file.label }
  selectedSpecContent.value = ''
  loadingSpecContent.value = true

  try {
    const response = await $fetch<{ content: string }>(
      `/api/specs/${encodeURIComponent(featureId)}/${file.filename.split('/').map(encodeURIComponent).join('/')}`
    )
    if (requestId !== specContentRequestId) return
    selectedSpecContent.value = response.content
  } catch (error) {
    if (requestId !== specContentRequestId) return
    const message = error instanceof Error ? error.message : 'Failed to load spec file'
    selectedSpecContent.value = message
  } finally {
    if (requestId === specContentRequestId) loadingSpecContent.value = false
  }
}

function sendTerminalCommand(command: string) {
  if (socket?.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify({ type: 'input', data: `${command}\r` }))
  return true
}

function sendTerminalText(text: string) {
  if (socket?.readyState !== WebSocket.OPEN) return false
  // Bracketed paste keeps multi-line prompts from being submitted line by
  // line by the CLI's readline.
  socket.send(JSON.stringify({ type: 'input', data: `\x1b[200~${text}\x1b[201~\r` }))
  return true
}

/**
 * Waits until the terminal socket is attached to `id`. Switching conversations
 * tears the socket down and reconnects, so a prompt sent immediately after
 * selectSession() would land in the previous conversation (or nowhere).
 */
function waitForSessionAttached(id: string, timeoutMs = 8000) {
  return new Promise<boolean>((resolve) => {
    const deadline = Date.now() + timeoutMs
    const check = () => {
      if (sessionId.value === id && status.value === 'connected') return resolve(true)
      if (Date.now() > deadline) return resolve(false)
      window.setTimeout(check, 100)
    }
    check()
  })
}

/** Waits for a freshly created conversation to report its server-assigned id. */
function waitForNewSessionAttached(timeoutMs = 30000) {
  return new Promise<string>((resolve) => {
    const deadline = Date.now() + timeoutMs
    const check = () => {
      if (sessionId.value && status.value === 'connected') return resolve(sessionId.value)
      if (Date.now() > deadline) return resolve('')
      window.setTimeout(check, 100)
    }
    check()
  })
}

/**
 * Waits for a conversation's CLI to show a settled prompt. A conversation
 * created moments ago is still booting its TUI, and a prompt typed into it
 * before then is swallowed by the startup redraw. `idle` is derived from the
 * same screen check the server uses to gate its own one-shot queries.
 */
async function waitForSessionIdle(id: string, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = sessions.value.find((session) => session.id === id)?.runtime?.state
    if (state === 'idle' || state === 'waiting_input') return true
    if (state === 'dead') return false
    await new Promise((resolve) => window.setTimeout(resolve, 200))
  }
  return false
}

/**
 * Makes `target` the attached conversation and waits for the socket to settle,
 * so the prompt that follows lands in it and not in whatever was on screen.
 */
async function attachToFeatureSession(target: SessionListItem, featureId: string) {
  if (sessionId.value === target.id && status.value === 'connected') return true

  selectSession(target.id)
  pushToast('info', `Switched to ${target.title || target.id} for ${featureId}.`)
  if (await waitForSessionAttached(target.id)) return true

  pushToast('error', `Timed out attaching to the conversation for ${featureId}.`, 6000)
  return false
}

/**
 * Entry point for every spec-browser action. The feature's branch decides where
 * it runs: the conversation whose worktree is on `042-some-feature` gets the
 * prompt regardless of what is on screen, and a feature no conversation owns
 * yet gets a brand-new one (the New Conversation modal opens and the action is
 * replayed once the conversation is up). It never borrows an unrelated
 * conversation. Shift-click forces a new conversation even when one exists.
 */
async function runFeatureAction(action: PendingFeatureAction, forceNew = false) {
  const target = forceNew ? null : findSessionForFeature(action.featureId)

  if (!target) {
    pendingFeatureAction.value = action
    await openNewSessionModal()
    return
  }

  if (!(await attachToFeatureSession(target, action.featureId))) return
  dispatchFeatureAction(action)
}

/** Runs a resolved action against the currently attached conversation. */
function dispatchFeatureAction(action: PendingFeatureAction) {
  if (action.kind === 'speckit') {
    if (sendTerminalCommand(`/speckit.${action.step} ${action.featureId}`)) {
      pushToast('info', `Sent /speckit.${action.step} for ${action.featureId}.`)
    } else {
      pushToast('error', 'Terminal is not connected.', 5000)
    }
    return
  }

  if (action.kind === 'skill') {
    const skill = skills.value.find((entry) => entry.id === action.skillId)
    if (!skill) {
      pushToast('error', `Skill ${action.skillId} is no longer available.`, 5000)
      return
    }
    void sendSkillPrompt(skill, action.featureId)
    return
  }

  beginCascade(action.featureId)
}

function runSpeckitStep(feature: SpecFeature, step: string, event?: MouseEvent) {
  void runFeatureAction({ kind: 'speckit', featureId: feature.id, step }, event?.shiftKey)
}

function runSkill(skill: SkillInfo, feature: SpecFeature, event?: MouseEvent) {
  void runFeatureAction({ kind: 'skill', featureId: feature.id, skillId: skill.id }, event?.shiftKey)
}

function startCascade(feature: SpecFeature, event?: MouseEvent) {
  if (cascade.value) {
    pushToast('warning', 'A cascade is already running.')
    return
  }
  void runFeatureAction({ kind: 'cascade', featureId: feature.id }, event?.shiftKey)
}

async function sendSkillPrompt(skill: SkillInfo, featureId: string) {
  try {
    const response = await $fetch<{ prompt: string }>(`/api/skills/${encodeURIComponent(skill.id)}/render`, {
      method: 'POST',
      body: { args: featureId }
    })
    if (sendTerminalText(response.prompt)) {
      pushToast('info', `Sent skill ${skill.id} for ${featureId}.`)
    } else {
      pushToast('error', 'Terminal is not connected.', 5000)
    }
  } catch (error) {
    pushToast('error', `Failed to render skill: ${extractFetchError(error)}`, 6000)
  }
}

/** Starts the sequential speckit chain in the already-attached conversation. */
function beginCascade(featureId: string) {
  if (cascade.value) return
  const feature = features.value.find((entry) => entry.id === featureId)
  if (!feature) {
    pushToast('error', `Feature ${featureId} is no longer in specs/.`, 5000)
    return
  }
  if (!sessionId.value) {
    pushToast('error', 'Cascade aborted: no conversation is attached.', 5000)
    return
  }

  const steps: string[] = []
  if (!feature.hasSpec) steps.push('specify')
  if (!feature.hasPlan) steps.push('plan')
  if (!feature.hasTasks) steps.push('tasks')
  steps.push('implement')

  cascade.value = {
    sessionId: sessionId.value,
    featureId,
    steps,
    index: -1,
    phase: 'waiting-start'
  }
  advanceCascade()
}

function advanceCascade() {
  const state = cascade.value
  if (!state) return
  state.index += 1
  if (state.index >= state.steps.length) {
    pushToast('success', `Cascade for ${state.featureId} completed.`)
    cascade.value = null
    void refreshFeatures()
    return
  }

  // The socket now belongs to whichever conversation is on screen; sending the
  // next step into a different one would silently drive the wrong CLI.
  if (sessionId.value !== state.sessionId) {
    pushToast('error', 'Cascade aborted: the conversation it started in is no longer attached.', 6000)
    cascade.value = null
    return
  }

  const step = state.steps[state.index]!
  if (!sendTerminalCommand(`/speckit.${step} ${state.featureId}`)) {
    pushToast('error', 'Cascade aborted: terminal is not connected.', 6000)
    cascade.value = null
    return
  }
  state.phase = 'waiting-start'
}

function cancelCascade() {
  if (!cascade.value) return
  cascade.value = null
  pushToast('info', 'Cascade cancelled. The current CLI turn keeps running.')
}

function trackCascadeState(session: SessionListItem, state: string) {
  const cascadeState = cascade.value
  if (!cascadeState || session.id !== cascadeState.sessionId) return

  if (state === 'dead' || state === 'disconnected') {
    pushToast('error', `Cascade aborted: conversation is ${state}.`, 6000)
    cascade.value = null
    return
  }
  if (cascadeState.phase === 'waiting-start' && state === 'working') {
    cascadeState.phase = 'waiting-idle'
    return
  }
  if (cascadeState.phase === 'waiting-idle' && state === 'idle') {
    void refreshFeatures()
    advanceCascade()
  }
  // waiting_input pauses the chain implicitly: the CLI resumes after the
  // user answers, and the next idle transition advances the cascade.
}

function startSpecEdit() {
  if (!selectedSpecFile.value || loadingSpecContent.value) return
  specEditContent.value = selectedSpecContent.value
  showSpecEditModal.value = true
}

async function saveSpecEdit() {
  const file = selectedSpecFile.value
  if (!file || savingSpec.value) return
  savingSpec.value = true

  try {
    const url: string = `/api/specs/${encodeURIComponent(file.featureId)}/${file.filename.split('/').map(encodeURIComponent).join('/')}`
    await $fetch(url, {
      method: 'PUT',
      body: { content: specEditContent.value }
    })
    selectedSpecContent.value = specEditContent.value
    showSpecEditModal.value = false
    pushToast('success', `Saved ${file.featureId}/${file.filename}.`)
    void refreshFeatures()
  } catch (error) {
    pushToast('error', `Failed to save spec: ${extractFetchError(error)}`, 6000)
  } finally {
    savingSpec.value = false
  }
}

async function loadSessionOptions() {
  loadingSessionOptions.value = true
  integrationError.value = ''
  try {
    sessionOptions.value = await $fetch<SessionOptions>('/api/sessions/options')
    const provider = sessionOptions.value.providers.find((option) => option.id === newSessionProvider.value)
      || sessionOptions.value.providers[0]
    if (provider) {
      newSessionProvider.value = provider.id
    }
    if (!sessionOptions.value.branches.includes(newSessionBaseBranch.value)) {
      newSessionBaseBranch.value = sessionOptions.value.branches.includes('main')
        ? 'main'
        : sessionOptions.value.branches[0] || ''
    }
  } catch (error) {
    integrationError.value = extractFetchError(error)
  } finally {
    loadingSessionOptions.value = false
  }
}

async function openNewSessionModal() {
  showNewSessionModal.value = true
  newSessionProvider.value = defaultProvider.value
  await loadSessionOptions()
  await nextTick()
  newSessionBaseBranchRef.value?.focus()
}

const settingsProviderOptions = computed<SessionProviderOption[]>(() =>
  sessionOptions.value.providers.length
    ? sessionOptions.value.providers
    : [
        { id: 'claude', name: 'Claude' },
        { id: 'codex', name: 'Codex' }
      ]
)

async function openSettingsModal() {
  showSettingsModal.value = true
  await nextTick()
  settingsDoneRef.value?.focus()
  // Populate provider names from the server when they aren't cached yet,
  // without disturbing the New Conversation provider selection.
  if (!sessionOptions.value.providers.length) {
    try {
      sessionOptions.value = await $fetch<SessionOptions>('/api/sessions/options')
    } catch (error) {
      console.warn('Failed to load provider options', error)
    }
  }
}

async function createNewSession() {
  if (!newSessionBaseBranch.value || creatingSession.value) return
  // Captured before the modal closes: the close watcher clears the pending
  // action so cancelling (Esc, ×, Cancel) never leaves it armed.
  const pending = pendingFeatureAction.value
  const label = pendingFeatureActionLabel.value
  creatingSession.value = true
  window.localStorage.removeItem('claude-web-session-id')
  sessionId.value = ''
  connect(undefined, newSessionProvider.value, {
    baseBranch: newSessionBaseBranch.value,
    featureId: pending?.featureId
  })
  showNewSessionModal.value = false
  creatingSession.value = false

  if (!pending) return

  // The server assigns the id and provisions the worktree during attach, so the
  // spec action can only run once the conversation reports back.
  const newSessionId = await waitForNewSessionAttached()
  if (!newSessionId) {
    pushToast('error', `Conversation for ${pending.featureId} did not start; action cancelled.`, 6000)
    return
  }

  pushToast('info', `Waiting for the CLI to start before running ${label}...`)
  await refreshSessions()
  if (!(await waitForSessionIdle(newSessionId))) {
    pushToast('error', `The CLI never became ready; ${label} was not sent.`, 8000)
    return
  }
  dispatchFeatureAction(pending)
}

// Any close path (submit, Cancel, ×, Esc) disarms a queued spec action.
watch(showNewSessionModal, (open) => {
  if (!open) pendingFeatureAction.value = null
})

function handleNewConversationEnter(event: KeyboardEvent) {
  // Buttons (Create/Cancel/close) handle Enter themselves; for anything else
  // (the base-branch/provider selects) Enter creates the conversation.
  const target = event.target
  if (target instanceof HTMLElement && target.closest('button')) return
  event.preventDefault()
  void createNewSession()
}

async function openIntegrationModal(mode: 'rebase' | 'finalize') {
  if (!activeSession.value || activeSession.value.finalized) return
  integrationMode.value = mode
  integrationError.value = ''
  integrationCommitMessage.value = `feat: finalize ${shortId(activeSession.value.id)}`
  commitQueryScreen.value = ''
  showIntegrationModal.value = true
  await loadSessionOptions()
  integrationBaseBranch.value = sessionOptions.value.branches.includes(activeSession.value.baseBranch || '')
    ? activeSession.value.baseBranch || ''
    : sessionOptions.value.branches.includes('main') ? 'main' : sessionOptions.value.branches[0] || ''
  // Focus a field inside the form so Enter reaches the form's keydown handler
  // (the rebase form is select-only, so browsers won't submit it implicitly).
  await nextTick()
  integrationBaseBranchRef.value?.focus()
}

let commitScreenTimer: ReturnType<typeof setInterval> | null = null

function stopCommitScreenPolling() {
  if (commitScreenTimer) {
    clearInterval(commitScreenTimer)
    commitScreenTimer = null
  }
}

/** Mirrors the ephemeral provider CLI screen into the modal while it drafts. */
function startCommitScreenPolling(sessionId: string) {
  stopCommitScreenPolling()
  commitScreenTimer = setInterval(async () => {
    try {
      const response = await $fetch<{ screen: string | null }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/commit-message-screen`
      )
      if (response.screen) commitQueryScreen.value = response.screen
    } catch {
      // The screen mirror is diagnostic only; polling errors are ignored.
    }
  }, 700)
}

async function generateCommitMessage() {
  const session = activeSession.value
  if (!session || generatingCommitMessage.value) return
  generatingCommitMessage.value = true
  integrationError.value = ''
  commitQueryScreen.value = ''
  startCommitScreenPolling(session.id)

  try {
    const response = await $fetch<{ message: string }>(
      `/api/sessions/${encodeURIComponent(session.id)}/commit-message`,
      {
        method: 'POST',
        body: integrationBaseBranch.value ? { baseBranch: integrationBaseBranch.value } : {}
      }
    )
    integrationCommitMessage.value = response.message
    // Success: the terminal mirror served its purpose, clear it away.
    commitQueryScreen.value = ''
  } catch (error) {
    // Failure: keep the last captured screen visible for debugging.
    integrationError.value = extractFetchError(error)
  } finally {
    stopCommitScreenPolling()
    generatingCommitMessage.value = false
  }
}

watch(showIntegrationModal, (open) => {
  if (!open) {
    stopCommitScreenPolling()
    commitQueryScreen.value = ''
  }
})

async function runSessionIntegration() {
  const session = activeSession.value
  if (!session || !integrationBaseBranch.value || integrationRunning.value) return
  if (integrationMode.value === 'finalize' && !integrationCommitMessage.value.trim()) return
  integrationRunning.value = true
  integrationError.value = ''
  try {
    const mode = integrationMode.value
    const targetBranch = integrationBaseBranch.value
    const result = await $fetch<{ conflictReport?: string }>(
      `/api/sessions/${encodeURIComponent(session.id)}/${mode}`,
      {
        method: 'POST',
        body: {
          baseBranch: targetBranch,
          commitMessage: integrationCommitMessage.value.trim()
        }
      }
    )
    showIntegrationModal.value = false
    previewError.value = ''

    if (result?.conflictReport) {
      conflictReport.value = result.conflictReport
      showConflictReport.value = true
      void nextTick(() => conflictCloseRef.value?.focus())
      pushToast('success', `Rebase conflicts on ${targetBranch} were auto-resolved.`)
    }

    if (mode === 'finalize') {
      // Finalize archives the conversation server-side, so it leaves the active
      // list. If it was the open one, switch away and land on another (or none).
      const wasActive = session.id === sessionId.value
      if (wasActive) {
        socket?.close()
        window.localStorage.removeItem('claude-web-session-id')
        sessionId.value = ''
        terminal?.reset()
        terminal?.writeln(`[finalized into ${targetBranch} and archived]\r\n`)
      }
      await Promise.allSettled([refreshSessions(), refreshArchivedSessions()])
      pushToast('success', `Finalized into ${targetBranch} and archived.`)
      if (wasActive && sessions.value[0]) connect(sessions.value[0].id)
    } else {
      await refreshSessions()
      refreshGitGraph()
    }
  } catch (error) {
    integrationError.value = extractFetchError(error)
  } finally {
    integrationRunning.value = false
  }
}

async function toggleSessionPreview() {
  const session = activeSession.value
  if (!session || !canPreviewActiveSession.value || previewRunning.value) return

  previewRunning.value = true
  previewError.value = ''

  try {
    if (session.previewBranch) {
      await $fetch(`/api/sessions/${encodeURIComponent(session.id)}/preview`, { method: 'DELETE' })
    } else {
      const existingPreview = previewingSession.value
      if (existingPreview && existingPreview.id !== session.id) {
        await $fetch(`/api/sessions/${encodeURIComponent(existingPreview.id)}/preview`, { method: 'DELETE' })
      }
      await $fetch(`/api/sessions/${encodeURIComponent(session.id)}/preview`, { method: 'POST' })
    }
    await refreshSessions()
    await refreshGitGraph()
  } catch (error) {
    previewError.value = extractFetchError(error)
  } finally {
    previewRunning.value = false
  }
}

function sessionDisplayName(session: SessionListItem) {
  return session.title || shortId(session.id)
}

function startSessionRename(session: SessionListItem) {
  editingSessionId.value = session.id
  editingSessionTitle.value = session.title || ''
}

function cancelSessionRename() {
  editingSessionId.value = ''
  editingSessionTitle.value = ''
}

async function saveSessionRename() {
  const id = editingSessionId.value
  if (!id || savingSessionTitle.value) return
  const title = editingSessionTitle.value.trim()
  savingSessionTitle.value = true

  try {
    await $fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { title }
    })
    cancelSessionRename()
    await refreshSessions()
  } catch (error) {
    pushToast('error', `Failed to rename conversation: ${extractFetchError(error)}`, 6000)
  } finally {
    savingSessionTitle.value = false
  }
}

async function refreshArchivedSessions() {
  loadingArchived.value = true
  try {
    const response = await $fetch<{ sessions: SessionListItem[] }>('/api/sessions/archives')
    archivedSessions.value = response.sessions
  } catch (error) {
    console.warn('Failed to refresh archived conversations', error)
  } finally {
    loadingArchived.value = false
  }
}

async function toggleArchivedSessions() {
  showArchivedSessions.value = !showArchivedSessions.value
  if (showArchivedSessions.value) await refreshArchivedSessions()
}

async function archiveSession(session: SessionListItem) {
  if (archivingSessionId.value) return
  const result = await openGitDialog({
    title: 'Archive Conversation',
    message: `Archive ${sessionDisplayName(session)}?\nThe tmux session and worktree are removed. The branch is kept, so the conversation can be restored later.`,
    confirmLabel: 'Archive'
  })
  if (!result) return

  archivingSessionId.value = session.id
  const archivingActiveSession = session.id === sessionId.value

  try {
    await $fetch(`/api/sessions/${encodeURIComponent(session.id)}/archive`, { method: 'POST' })

    if (archivingActiveSession) {
      socket?.close()
      window.localStorage.removeItem('claude-web-session-id')
      sessionId.value = ''
      terminal?.reset()
      terminal?.writeln('Conversation archived.\r\n')
    }

    await Promise.allSettled([refreshSessions(), refreshArchivedSessions()])
    pushToast('success', 'Conversation archived.')
    if (archivingActiveSession && sessions.value[0]) {
      connect(sessions.value[0].id)
    }
  } catch (error) {
    pushToast('error', `Failed to archive conversation: ${extractFetchError(error)}`, 6000)
  } finally {
    archivingSessionId.value = ''
  }
}

async function restoreArchivedSession(session: SessionListItem) {
  if (restoringSessionId.value) return
  restoringSessionId.value = session.id

  try {
    await $fetch(`/api/sessions/archives/${encodeURIComponent(session.id)}/restore`, { method: 'POST' })
    await Promise.allSettled([refreshSessions(), refreshArchivedSessions()])
    pushToast('success', 'Conversation restored.')
    selectedArchivedSessionId.value = ''
    selectSession(session.id)
  } catch (error) {
    pushToast('error', `Failed to restore conversation: ${extractFetchError(error)}`, 6000)
  } finally {
    restoringSessionId.value = ''
  }
}

async function deleteArchivedSession(session: SessionListItem) {
  if (deletingSessionId.value) return
  const result = await openGitDialog({
    title: 'Delete Archived Conversation',
    message: `Permanently delete ${sessionDisplayName(session)}?\nIts kept branch and logs are removed. This cannot be undone.`,
    danger: true,
    confirmLabel: 'Delete'
  })
  if (!result) return

  deletingSessionId.value = session.id
  try {
    await $fetch(`/api/sessions/archives/${encodeURIComponent(session.id)}`, { method: 'DELETE' })
    await refreshArchivedSessions()
    if (selectedArchivedSessionId.value === session.id) {
      selectedArchivedSessionId.value = ''
      terminal?.reset()
      if (terminal) terminal.options.cursorBlink = true
    }
    pushToast('success', 'Archived conversation deleted.')
  } catch (error) {
    pushToast('error', `Failed to delete archived conversation: ${extractFetchError(error)}`, 6000)
  } finally {
    deletingSessionId.value = ''
  }
}

async function deleteAllArchivedSessions() {
  if (deletingSessionId.value || !archivedSessions.value.length) return
  const result = await openGitDialog({
    title: 'Delete All Archived Conversations',
    message: `Permanently delete all ${archivedSessions.value.length} archived conversations? This cannot be undone.`,
    danger: true,
    confirmLabel: 'Delete All'
  })
  if (!result) return

  deletingSessionId.value = 'all'
  try {
    await $fetch('/api/sessions/archives', { method: 'DELETE' })
    await refreshArchivedSessions()
    if (selectedArchivedSessionId.value) {
      selectedArchivedSessionId.value = ''
      terminal?.reset()
      if (terminal) terminal.options.cursorBlink = true
    }
    pushToast('success', 'All archived conversations deleted.')
  } catch (error) {
    pushToast('error', `Failed to delete archived conversations: ${extractFetchError(error)}`, 6000)
  } finally {
    deletingSessionId.value = ''
  }
}

function reconnectActiveSession() {
  connect(sessionId.value || getInitialSessionId())
}

function sendResize() {
  if (!terminal || socket?.readyState !== WebSocket.OPEN) return false
  const wasAtBottom = terminal.buffer.active.viewportY === terminal.buffer.active.baseY
  if (wasAtBottom) {
    // Width changes reflow the previous tmux frame into xterm's local
    // scrollback. Remove that synthetic tail without visibly leaving the
    // active prompt; preserve the viewport when the user is reading history.
    terminal.write('\x1b[3J', () => terminal?.scrollToBottom())
  }
  socket.send(
    JSON.stringify({
      type: 'resize',
      cols: terminal.cols,
      rows: terminal.rows
    })
  )
  return true
}

function performTerminalFit(notifyServer = true) {
  if (!terminal || !fitAddon) return
  const mount = terminalEl.value
  if (!mount || mount.clientWidth < 1 || mount.clientHeight < 1) return

  const dimensions = fitAddon.proposeDimensions()
  if (!dimensions || dimensions.cols < 1 || dimensions.rows < 1) return

  if (dimensions.cols !== terminal.cols || dimensions.rows !== terminal.rows) fitAddon.fit()

  if (terminal.cols < 1 || terminal.rows < 1) return
  if (terminal.cols === lastSentTerminalSize.cols && terminal.rows === lastSentTerminalSize.rows) return

  if (notifyServer && sendResize()) {
    lastSentTerminalSize = { cols: terminal.cols, rows: terminal.rows }
  }
}

function settleTerminalFit() {
  for (const timer of fitSettleTimers) clearTimeout(timer)
  fitSettleTimers.clear()
  scheduleTerminalFit()
  for (const delay of [50, 150, 350]) {
    const timer = setTimeout(() => {
      fitSettleTimers.delete(timer)
      scheduleTerminalFit()
    }, delay)
    fitSettleTimers.add(timer)
  }
}

function scheduleTerminalFit(delay = 0) {
  if (fitTimer) {
    clearTimeout(fitTimer)
    fitTimer = null
  }

  if (fitFrame !== null) {
    cancelAnimationFrame(fitFrame)
    fitFrame = null
  }

  fitTimer = setTimeout(() => {
    fitTimer = null
    fitFrame = window.requestAnimationFrame(() => {
      fitFrame = null
      performTerminalFit()
    })
  }, delay)
}

function getInitialSessionId() {
  if (sessionId.value) return sessionId.value
  const stored = window.localStorage.getItem('claude-web-session-id')
  if (stored) {
    sessionId.value = stored
    return stored
  }

  return sessions.value[0]?.id
}

function setSessionId(value: string) {
  sessionId.value = value
  window.localStorage.setItem('claude-web-session-id', value)
}

function parseControlMessage(
  data: string
): { type: 'hello' } | { type: 'attached'; sessionId: string } | { type: 'git-changed' } | null {
  if (!data.startsWith('\x00')) return null
  try {
    const value: unknown = JSON.parse(data.slice(1))
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
    if (keys.length === 1 && record.type === 'hello') return { type: 'hello' }
    if (keys.length === 1 && record.type === 'git-changed') return { type: 'git-changed' }
    if (keys.length === 2 && record.type === 'attached' && typeof record.sessionId === 'string') {
      return { type: 'attached', sessionId: record.sessionId }
    }
    return null
  } catch {
    return null
  }
}

function extractFetchError(error: unknown) {
  if (error && typeof error === 'object') {
    const data = 'data' in error
      ? (error as { data?: { statusMessage?: string; message?: string; data?: { conflictFiles?: string[] } } }).data
      : undefined
    const conflicts = data?.data?.conflictFiles
    if (data?.statusMessage) {
      return conflicts?.length ? `${data.statusMessage}\nConflicts: ${conflicts.join(', ')}` : data.statusMessage
    }
    if (data?.message) return data.message
    if ('statusMessage' in error && typeof (error as { statusMessage?: unknown }).statusMessage === 'string') {
      return String((error as { statusMessage: string }).statusMessage)
    }
  }
  return error instanceof Error ? error.message : 'Git action failed'
}

function formatSessionTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function formatCommitDate(value: string) {
  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000))
  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit'
  }).format(date)
}

function computeGraphRows(commits: GitCommit[], headHash: string, style: 'rounded' | 'angular' = 'rounded') {
  const result = new Map<string, GraphRowData>()
  if (!commits.length) return result

  const commitMap = new Map<string, GitCommit>()
  const mainlineSet = new Set<string>()
  for (const commit of commits) {
    commitMap.set(commit.hash, commit)
  }

  let current: GitCommit | undefined = commits[0]
  while (current) {
    mainlineSet.add(current.hash)
    current = current.parents[0] ? commitMap.get(current.parents[0]) : undefined
  }

  const commitLanes = new Map<string, number>()
  const commitColors = new Map<string, string>()
  const activeLanes = new Map<number, string>()
  const pendingParents = new Map<string, { lane: number; color: string }>()
  const commitIndices = new Map<string, number>()

  for (let index = 0; index < commits.length; index += 1) {
    const commit = commits[index]
    if (!commit) continue
    commitIndices.set(commit.hash, index)

    let lane = 0
    let color = GRAPH_COLORS[0]!
    const pending = pendingParents.get(commit.hash)

    if (pending) {
      lane = pending.lane
      color = pending.color
      pendingParents.delete(commit.hash)
    } else if (mainlineSet.has(commit.hash)) {
      lane = 0
      color = GRAPH_COLORS[0]!
    } else {
      lane = 1
      while (activeLanes.has(lane)) lane += 1
      color = getGraphColor(commit.hash)
    }

    commitLanes.set(commit.hash, lane)
    commitColors.set(commit.hash, color)
    activeLanes.set(lane, commit.hash)

    result.set(commit.hash, {
      commitHash: commit.hash,
      lane,
      color,
      nodeType: commit.hash === headHash ? 'head' : commit.parents.length > 1 ? 'merge' : 'regular',
      isMainline: mainlineSet.has(commit.hash),
      connections: []
    })

    for (let parentIndex = 0; parentIndex < commit.parents.length; parentIndex += 1) {
      const parentHash = commit.parents[parentIndex]
      if (!parentHash) continue
      if (commitLanes.has(parentHash) || pendingParents.has(parentHash)) continue

      let parentLane = lane
      let parentColor = color
      if (parentIndex > 0) {
        if (mainlineSet.has(parentHash)) {
          parentLane = 0
          parentColor = GRAPH_COLORS[0]!
        } else {
          parentLane = 1
          while (activeLanes.has(parentLane) || parentLane === lane) parentLane += 1
          parentColor = getGraphColor(parentHash)
        }
      }

      pendingParents.set(parentHash, { lane: parentLane, color: parentColor })
    }

    const firstParentHash = commit.parents[0]
    const firstParentLane = firstParentHash
      ? commitLanes.get(firstParentHash) ?? pendingParents.get(firstParentHash)?.lane
      : undefined
    if (!firstParentHash || (firstParentLane !== undefined && firstParentLane !== lane)) {
      activeLanes.delete(lane)
    }
  }

  for (let index = 0; index < commits.length; index += 1) {
    const commit = commits[index]
    if (!commit) continue
    const row = result.get(commit.hash)
    if (!row) continue

    for (let parentIndex = 0; parentIndex < commit.parents.length; parentIndex += 1) {
      const parentHash = commit.parents[parentIndex]
      if (!parentHash) continue
      const parentLane = commitLanes.get(parentHash)
      const parentRowIndex = commitIndices.get(parentHash)
      if (parentLane === undefined) continue

      const color = parentIndex === 0
        ? row.color
        : commitColors.get(parentHash) || getGraphColor(parentHash)

      if (row.lane === parentLane) {
        row.connections.push({ type: 'vertical-bottom', fromLane: row.lane, toLane: parentLane, color, style })
      } else if (parentIndex > 0) {
        row.connections.push({
          type: row.lane < parentLane ? 'merge-out' : 'merge-in',
          fromLane: row.lane,
          toLane: parentLane,
          color,
          style
        })
      } else {
        row.connections.push({
          type: row.lane < parentLane ? 'branch-out' : 'branch-in',
          fromLane: row.lane,
          toLane: parentLane,
          color,
          style
        })
      }

      if (parentRowIndex !== undefined && parentRowIndex > index + 1) {
        for (let rowIndex = index + 1; rowIndex < parentRowIndex; rowIndex += 1) {
          const intermediateCommit = commits[rowIndex]
          if (!intermediateCommit) continue
          const intermediateRow = result.get(intermediateCommit.hash)
          intermediateRow?.connections.push({
            type: 'vertical',
            fromLane: parentLane,
            toLane: parentLane,
            color,
            style
          })
        }
      }

      const parentRow = result.get(parentHash)
      parentRow?.connections.push({
        type: 'vertical-top',
        fromLane: parentLane,
        toLane: parentLane,
        color,
        style
      })
    }
  }

  return result
}

function getGraphColor(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index)
    hash |= 0
  }
  return GRAPH_COLORS[Math.abs(hash) % GRAPH_COLORS.length]!
}

function graphLaneX(lane: number) {
  return GRAPH_PADDING + lane * GRAPH_COLUMN_WIDTH
}

function graphSegmentPath(segment: GraphSegment) {
  const fromX = graphLaneX(segment.fromLane)
  const toX = graphLaneX(segment.toLane)
  const centerY = GRAPH_ROW_HEIGHT / 2

  if (segment.type === 'vertical') return `M ${fromX} 0 L ${toX} ${GRAPH_ROW_HEIGHT}`
  if (segment.type === 'vertical-top') return `M ${fromX} 0 L ${fromX} ${centerY}`
  if (segment.type === 'vertical-bottom') return `M ${fromX} ${centerY} L ${fromX} ${GRAPH_ROW_HEIGHT}`

  if (segment.style === 'rounded') {
    return `M ${fromX} ${centerY} C ${fromX} ${GRAPH_ROW_HEIGHT}, ${toX} ${GRAPH_ROW_HEIGHT}, ${toX} ${GRAPH_ROW_HEIGHT}`
  }

  const midY = GRAPH_ROW_HEIGHT * 0.75
  return `M ${fromX} ${centerY} L ${fromX} ${midY} L ${toX} ${GRAPH_ROW_HEIGHT}`
}

function parseUnifiedDiff(diff: string): GitDiffLine[] {
  const lines: GitDiffLine[] = []
  let oldLine = 0
  let newLine = 0

  diff.split('\n').forEach((content, index) => {
    const hunk = content.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      lines.push({ key: `${index}-hunk`, oldLine: null, newLine: null, content, kind: 'hunk' })
      return
    }

    if (content.startsWith('diff --git') || content.startsWith('index ') || content.startsWith('--- ') || content.startsWith('+++ ')) {
      lines.push({ key: `${index}-header`, oldLine: null, newLine: null, content, kind: 'header' })
      return
    }

    if (content.startsWith('+')) {
      lines.push({ key: `${index}-add`, oldLine: null, newLine, content, kind: 'add' })
      newLine += 1
      return
    }

    if (content.startsWith('-')) {
      lines.push({ key: `${index}-remove`, oldLine, newLine: null, content, kind: 'remove' })
      oldLine += 1
      return
    }

    lines.push({ key: `${index}-context`, oldLine, newLine, content, kind: 'context' })
    oldLine += 1
    newLine += 1
  })

  return lines
}

function diffLineClass(line: GitDiffLine) {
  if (line.kind === 'add') return 'bg-[#12382f] text-[#b7f7d0]'
  if (line.kind === 'remove') return 'bg-[#3b1820] text-[#ffb4c4]'
  if (line.kind === 'hunk') return 'bg-[#223447] text-[#8fb8ff]'
  if (line.kind === 'header') return 'bg-[#24231f] text-[#f7b83d]'
  return 'text-[#d6cbbb]'
}

function isRemoteBranch(branch: string) {
  return !gitGraph.value?.branches.some((item) => item.name === branch && !item.remote)
}

function stashName(index: number) {
  return `stash@{${index}}`
}

function shortId(value: string) {
  if (value.length <= 18) return value
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

function displayBranch(value?: string) {
  if (!value) return '-'
  if (value.length <= 24) return value
  return `${value.slice(0, 11)}...${value.slice(-6)}`
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatRuntimeState(session: SessionListItem) {
  const state = session.runtime?.state || 'unknown'
  if (state === 'idle') return 'Idle'
  if (state === 'working') return 'Working'
  if (state === 'waiting_input') return 'Input'
  if (state === 'dead') return 'Dead'
  if (state === 'disconnected') return 'Offline'
  return 'Checking'
}

function runtimeStateClass(session: SessionListItem) {
  const state = session.runtime?.state || 'unknown'

  if (state === 'working') return 'bg-[#bcd42a] text-[#2b2a27]'
  if (state === 'waiting_input') return 'bg-[#f7b83d] text-[#2b2a27]'
  if (state === 'idle') return 'bg-[#26a6a6] text-white'
  if (state === 'dead') return 'bg-[#e61f44] text-white'
  return 'bg-[#605e57] text-white'
}

function getXtermTheme() {
  const colors = selectedTheme.value.colors

  return {
    background: colors['terminal.background'] || colors['editor.background'] || '#1e1d1b',
    foreground: colors['terminal.foreground'] || colors.foreground || '#ede0ce',
    cursor: colors['editorCursor.foreground'] || colors.foreground || '#f8f8f0',
    selectionBackground: colors['editor.selectionBackground'] || '#ff5d3855',
    black: colors['terminal.ansiBlack'] || '#383733',
    red: colors['terminal.ansiRed'] || '#ba0e2e',
    green: colors['terminal.ansiGreen'] || '#26a6a6',
    yellow: colors['terminal.ansiYellow'] || '#ff5d38',
    blue: colors['terminal.ansiBlue'] || '#bcd42a',
    magenta: colors['terminal.ansiMagenta'] || '#26a6a6',
    cyan: colors['terminal.ansiCyan'] || '#ff5d38',
    white: colors['terminal.ansiWhite'] || '#f4ece1',
    brightBlack: colors['terminal.ansiBrightBlack'] || '#605e57',
    brightRed: colors['terminal.ansiBrightRed'] || '#f03e5f',
    brightGreen: colors['terminal.ansiBrightGreen'] || '#59d9d9',
    brightYellow: colors['terminal.ansiBrightYellow'] || '#ffb09e',
    brightBlue: colors['terminal.ansiBrightBlue'] || '#d7e67e',
    brightMagenta: colors['terminal.ansiBrightMagenta'] || '#59d9d9',
    brightCyan: colors['terminal.ansiBrightCyan'] || '#ffb09e',
    brightWhite: colors['terminal.ansiBrightWhite'] || '#ffffff'
  }
}
</script>

<template>
  <main
    class="app-shell h-screen h-dvh w-screen max-w-full overflow-hidden bg-[var(--rg-editor)] text-[var(--rg-foreground)]"
    :style="themeVars"
    @click="closeFloatingMenus"
  >
    <section class="grid h-full min-h-0 grid-rows-[30px_minmax(0,1fr)_22px] overflow-hidden">
      <header class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-[var(--rg-border)] bg-[var(--rg-sidebar)] px-3 text-[11px] text-[var(--rg-muted)]">
        <div class="flex min-w-0 items-center gap-2">
          <span class="text-[11px] font-bold uppercase tracking-wider text-[var(--rg-accent)]">SPECCAT</span>
          <span class="truncate font-mono text-[11px]">/ {{ activeSession?.projectDir?.split('/').filter(Boolean).pop() || 'workspace' }}</span>
        </div>
        <div class="flex h-full min-w-0 items-center gap-0.5 font-mono text-[11px]">
          <button class="workspace-tab" :class="activeSidebarPanel === 'conversations' && !databaseOpen ? 'workspace-tab-active' : ''" title="Chat (⌘⌥1 / Ctrl+Alt+1)" @click="openChatPanel">Chat</button>
          <button class="workspace-tab" :class="activeSidebarPanel === 'terminal' && !databaseOpen ? 'workspace-tab-active' : ''" title="Terminal (⌘⌥2 or ⌘⌥T / Ctrl+Alt+2 or Ctrl+Alt+T)" @click="openTerminalPanel">Terminal</button>
          <button class="workspace-tab" :class="databaseOpen ? 'workspace-tab-active' : ''" title="Database (⌘⌥3 or ⌘⌥D / Ctrl+Alt+3 or Ctrl+Alt+D)" @click="openDatabasePanel">Database</button>
          <button v-if="!isMobile" class="workspace-tab" :class="chatMaximized ? 'workspace-tab-active' : ''" title="Toggle maximized chat (⌘⌥L / Ctrl+Alt+L)" @click="chatMaximized = !chatMaximized">{{ chatMaximized ? '⤡' : '⤢' }}</button>
          <button class="ml-1 grid h-[22px] w-[22px] place-items-center rounded text-[13px] hover:bg-[var(--rg-editor)] hover:text-[var(--rg-foreground)]" title="Refresh" @click="activeSidebarPanel === 'terminal' ? refreshShells() : refreshSessions()">↻</button>
          <button class="grid h-[22px] w-[22px] place-items-center rounded text-[13px] hover:bg-[var(--rg-editor)] hover:text-[var(--rg-foreground)]" title="Settings" @click="openSettingsModal">⚙</button>
        </div>
      </header>

      <section
        class="brick-workspace relative grid min-h-0 min-w-0 overflow-hidden"
        :class="chatMaximized ? 'brick-chat-max' : ''"
        :style="{ gridTemplateColumns: appGridColumns }"
      >
        <nav class="relative z-[60] flex min-h-0 min-w-0 overflow-hidden flex-col items-center border-r border-black/40 bg-[var(--rg-activity)] py-2">
          <button
            class="grid h-12 w-full place-items-center border-l-2"
            :class="!sidebarCollapsed && activeSidebarPanel === 'conversations' ? 'border-[var(--rg-foreground)] text-[var(--rg-foreground)]' : 'border-transparent text-[#88857c] hover:text-[#ede0ce]'"
            title="Conversations"
            @click="selectSidebarPanel('conversations')"
          >
            <span class="text-xl">▦</span>
          </button>
          <button
            class="grid h-12 w-full place-items-center border-l-2"
            :class="!specPanelCollapsed ? 'border-[var(--rg-foreground)] text-[var(--rg-foreground)]' : 'border-transparent text-[#88857c] hover:text-[#ede0ce]'"
            title="Spec Browser"
            @click="openSpecPanel"
          >
            <span class="text-xl">S</span>
          </button>
          <button
            class="grid h-12 w-full place-items-center border-l-2"
            :class="!sidebarCollapsed && activeSidebarPanel === 'terminal' ? 'border-[var(--rg-foreground)] text-[var(--rg-foreground)]' : 'border-transparent text-[#88857c] hover:text-[#ede0ce]'"
            title="Terminal"
            @click="selectSidebarPanel('terminal')"
          >
            <span class="font-mono text-lg leading-none">&gt;_</span>
          </button>
          <button
            class="grid h-12 w-full place-items-center border-l-2"
            :class="databaseOpen ? 'border-[var(--rg-foreground)] text-[var(--rg-foreground)]' : 'border-transparent text-[#88857c] hover:text-[#ede0ce]'"
            title="PostgreSQL Database"
            @click="databaseOpen = !databaseOpen"
          >
            <span class="text-xl leading-none">◉</span>
          </button>
          <div class="flex-1" />
          <button
            class="grid h-12 w-full place-items-center border-l-2 border-transparent text-[#88857c] hover:text-[#ede0ce]"
            title="Refresh"
            @click="activeSidebarPanel === 'terminal' ? refreshShells() : refreshSessions()"
          >
            <span class="text-lg">↻</span>
          </button>
          <button
            class="grid h-12 w-full place-items-center border-l-2 border-transparent text-[#88857c] hover:text-[#ede0ce]"
            title="Settings"
            @click="openSettingsModal"
          >
            <span class="text-xl">⚙</span>
          </button>
        </nav>
        <DatabaseWorkspace v-if="databaseOpen" @close="databaseOpen = false" />
        <aside
          v-show="!specPanelCollapsed"
          class="brick-specs grid min-h-0 min-w-0 overflow-hidden grid-rows-[35px_44px_minmax(0,1fr)] border-r border-black/40 bg-[var(--rg-sidebar)]"
          :class="isMobile ? 'absolute inset-y-0 left-12 right-0 z-30' : ''"
        >
          <div class="flex min-w-0 items-center justify-between gap-2 border-b border-black/30 px-4 text-[11px] font-bold uppercase tracking-wide text-[var(--rg-foreground)]">
            <span class="truncate">Spec Browser</span>
          </div>
          <div class="flex min-w-0 items-center gap-2 border-b border-black/30 bg-[var(--rg-sidebar-header)] px-3">
            <input
              v-model="specSearchQuery"
              type="search"
              class="h-7 min-w-0 flex-1 border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 text-xs text-[var(--rg-foreground)] outline-none placeholder:text-[#88857c] focus:border-[var(--rg-accent)]"
              placeholder="Search specs"
              aria-label="Search specs"
            >
            <button
              type="button"
              class="h-7 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 text-xs font-bold text-[var(--rg-foreground)] hover:border-[var(--rg-accent)]"
              @click="refreshFeatures"
            >
              Refresh
            </button>
          </div>

          <div class="min-h-0 overflow-auto p-2">
            <div class="mb-2 flex h-6 items-center px-1 text-[11px] font-bold uppercase text-[#a0988e]">
              Spec Directories ({{ filteredFeatures.length }})
            </div>
            <!-- Cards only: the files themselves live in the viewer modal. -->
            <div class="grid gap-2">
              <div
                v-for="feature in filteredFeatures"
                :key="feature.id"
                class="grid gap-1.5 border bg-[var(--rg-editor-group)] p-2.5 text-left text-[12px] text-[var(--rg-foreground)]"
                :class="specViewerFeatureId === feature.id
                  ? 'border-[var(--rg-accent)]'
                  : 'border-[var(--rg-border)] hover:border-[#a0988e]'"
                :title="`${feature.id} — open spec files`"
                role="button"
                tabindex="0"
                @click="openSpecViewer(feature)"
                @keydown.enter="openSpecViewer(feature)"
              >
                <div class="flex min-w-0 items-center gap-2">
                  <span class="min-w-0 flex-1 truncate font-mono font-semibold">{{ feature.id }}</span>
                  <span
                    v-if="featureSessionMap.get(feature.id)"
                    class="shrink-0 border px-1 text-[9px] font-bold uppercase"
                    :class="sessionId === featureSessionMap.get(feature.id)!.id
                      ? 'border-[var(--rg-accent)] bg-[var(--rg-accent)] text-white'
                      : 'border-[var(--rg-accent)] text-[var(--rg-accent)]'"
                    :title="`Actions run in: ${featureSessionMap.get(feature.id)!.title || featureSessionMap.get(feature.id)!.id} (${featureSessionMap.get(feature.id)!.worktreeBranch || 'no branch'})`"
                  >
                    active
                  </span>
                </div>
                <p class="truncate text-[11px] text-[#a0988e]">{{ feature.name }}</p>
                <div class="flex min-w-0 flex-wrap gap-1 text-[9px] font-bold uppercase">
                  <span v-if="feature.hasSpec" class="border border-[var(--rg-border)] px-1 text-[var(--rg-accent)]">spec</span>
                  <span v-if="feature.hasPlan" class="border border-[var(--rg-border)] px-1 text-[#f7b83d]">plan</span>
                  <span v-if="feature.hasTasks" class="border border-[var(--rg-border)] px-1 text-[#ff5d38]">tasks {{ feature.completedTasks }}/{{ feature.totalTasks }}</span>
                  <span
                    v-if="traceability.get(feature.id) && traceability.get(feature.id)!.risk !== 'none'"
                    class="border px-1"
                    :class="featureRiskClass(traceability.get(feature.id)!.risk)"
                    :title="traceability.get(feature.id)!.alerts.join('\n')"
                  >
                    FR {{ traceability.get(feature.id)!.counts.total - traceability.get(feature.id)!.counts.uncovered }}/{{ traceability.get(feature.id)!.counts.total }}
                  </span>
                  <span class="ml-auto border border-transparent px-1 text-[#88857c]">{{ feature.files.length }} files</span>
                </div>
                <div class="flex flex-wrap items-center gap-1 border-t border-black/30 pt-1.5">
                  <button
                    v-for="step in SPECKIT_STEPS"
                    :key="step"
                    type="button"
                    class="border border-[var(--rg-border)] bg-[var(--rg-input)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--rg-foreground)] hover:border-[var(--rg-accent)] disabled:opacity-40"
                    :disabled="Boolean(cascade)"
                    :title="(featureSessionMap.get(feature.id)
                      ? `Send /speckit.${step} ${feature.id} to ${featureSessionMap.get(feature.id)!.title || featureSessionMap.get(feature.id)!.id}`
                      : `Send /speckit.${step} ${feature.id} in a new conversation`) + ' (Shift+click: new conversation)'"
                    @click.stop="runSpeckitStep(feature, step, $event)"
                  >
                    {{ step }}
                  </button>
                  <button
                    v-if="!cascade || cascade.featureId !== feature.id"
                    type="button"
                    class="border border-[var(--rg-accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--rg-accent)] hover:bg-[var(--rg-accent)] hover:text-white disabled:opacity-40"
                    :disabled="Boolean(cascade)"
                    title="Run the remaining speckit steps sequentially in the conversation on this feature's branch, waiting for the CLI to go idle between steps (Shift+click: new conversation)"
                    @click.stop="startCascade(feature, $event)"
                  >
                    ▶ auto
                  </button>
                  <span
                    v-else
                    class="flex items-center gap-1 text-[9px] font-bold uppercase text-[var(--rg-accent)]"
                  >
                    <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--rg-accent)]" />
                    {{ cascade.steps[cascade.index] }} ({{ cascade.index + 1 }}/{{ cascade.steps.length }})
                    <button
                      type="button"
                      class="border border-[var(--rg-border)] px-1 text-[9px] text-[var(--rg-foreground)] hover:border-[#f03e5f] hover:text-[#f03e5f]"
                      @click.stop="cancelCascade"
                    >
                      cancel
                    </button>
                  </span>
                  <button
                    v-for="skill in skills"
                    :key="skill.id"
                    type="button"
                    class="border border-[var(--rg-border)] bg-[var(--rg-input)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#d7e67e] hover:border-[var(--rg-accent)]"
                    :title="`${skill.description || `Run skill ${skill.id} on ${feature.id}`} (Shift+click: new conversation)`"
                    @click.stop="runSkill(skill, feature, $event)"
                  >
                    ✦ {{ skill.id }}
                  </button>
                </div>
              </div>
            </div>
            <p v-if="loadingFeatures && !features.length" class="px-2 py-3 text-[12px] text-[#88857c]">
              Loading specs...
            </p>
            <p v-else-if="!filteredFeatures.length" class="px-2 py-3 text-[12px] text-[#88857c]">
              No spec directories found.
            </p>
          </div>
        </aside>

        <aside
          v-show="!sidebarCollapsed"
          class="brick-threads grid min-h-0 min-w-0 overflow-hidden grid-rows-[35px_44px_minmax(0,1fr)_128px] border-r border-black/40 bg-[var(--rg-sidebar)]"
          :class="isMobile ? 'absolute inset-y-0 left-12 right-0 z-30' : ''"
        >
          <div class="flex items-center border-b border-black/30 px-4 text-[11px] font-bold uppercase tracking-wide text-[var(--rg-foreground)]">
            {{ activeSidebarPanel === 'terminal' ? 'Terminal' : 'Explorer' }}
          </div>
          <div
            v-if="activeSidebarPanel === 'conversations'"
            class="flex min-w-0 items-center gap-2 border-b border-black/30 bg-[var(--rg-sidebar-header)] px-3"
          >
            <button
              type="button"
              class="h-7 min-w-0 flex-1 bg-[var(--rg-button)] px-2 text-xs font-bold text-white opacity-95 hover:opacity-100"
              @click="openNewSessionModal"
            >
              + New Conversation <span class="ml-1 opacity-70">N</span>
            </button>
            <button
              type="button"
              class="h-7 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 text-xs font-bold text-[var(--rg-foreground)] hover:border-[var(--rg-accent)]"
              @click="refreshSessions"
            >
              Refresh
            </button>
          </div>
          <div
            v-else
            class="flex min-w-0 items-center gap-2 border-b border-black/30 bg-[var(--rg-sidebar-header)] px-3"
          >
            <button
              type="button"
              class="h-7 min-w-0 flex-1 bg-[var(--rg-button)] px-2 text-xs font-bold text-white opacity-95 hover:opacity-100 disabled:opacity-60"
              :disabled="creatingShell"
              @click="createShell"
            >
              + New Terminal <span class="ml-1 opacity-70">N</span>
            </button>
            <button
              type="button"
              class="h-7 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 text-xs font-bold text-[var(--rg-foreground)] hover:border-[var(--rg-accent)]"
              @click="refreshShells"
            >
              Refresh
            </button>
          </div>

          <div v-if="activeSidebarPanel === 'conversations'" class="min-h-0 overflow-auto py-2">
            <div class="sticky top-0 z-10 -mt-2 bg-[var(--rg-sidebar)] px-3 pb-2 pt-2">
              <input
                v-model="conversationSearchQuery"
                type="search"
                class="h-7 w-full border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 text-xs text-[var(--rg-foreground)] outline-none placeholder:text-[#88857c] focus:border-[var(--rg-accent)]"
                placeholder="Search conversations"
                aria-label="Search conversations"
              >
            </div>
            <div class="mb-1 flex h-6 items-center px-3 text-[11px] font-bold uppercase text-[#a0988e]">
              CLI Conversations ({{ conversationSearchQuery.trim() ? `${filteredSessions.length}/${sessions.length}` : sessions.length }})
            </div>
            <p
              v-if="conversationLimitWarning"
              class="mx-3 mb-2 border border-[#f7b83d]/60 bg-[#f7b83d]/10 px-2 py-1.5 text-[11px] leading-4 text-[#f7b83d]"
            >
              {{ conversationLimitWarning }}
            </p>
            <div
              v-for="session in filteredSessions"
              :key="session.id"
              class="group grid w-full grid-cols-[18px_minmax(0,1fr)] gap-2 px-3 py-1.5 text-left text-[12px]"
              :class="session.id === sessionId
                ? 'bg-[var(--rg-selection)] text-[var(--rg-editor)]'
                : session.previewBranch
                  ? 'border-l-2 border-[var(--rg-accent)] bg-[var(--rg-editor-group)] text-[var(--rg-foreground)]'
                : 'text-[var(--rg-foreground)] hover:bg-[var(--rg-editor-group)]'"
              :title="session.id"
              role="button"
              tabindex="0"
              @click="selectSession(session.id)"
              @keydown.enter="selectSession(session.id)"
            >
              <span :class="session.id === sessionId ? 'text-[var(--rg-editor)]' : 'text-[var(--rg-accent)]'">●</span>
              <span class="min-w-0">
                <span class="flex min-w-0 items-center gap-2">
                  <input
                    v-if="editingSessionId === session.id"
                    v-model="editingSessionTitle"
                    type="text"
                    class="h-5 min-w-0 flex-1 border border-[var(--rg-accent)] bg-[var(--rg-input)] px-1 font-mono text-[12px] text-[var(--rg-foreground)] outline-none"
                    placeholder="Conversation title"
                    autofocus
                    @click.stop
                    @keydown.enter.prevent="saveSessionRename"
                    @keydown.esc.stop="cancelSessionRename"
                    @blur="saveSessionRename"
                  >
                  <span
                    v-else
                    class="block min-w-0 flex-1 truncate font-mono font-semibold"
                    :title="session.title ? `${session.title} · ${session.id}` : session.id"
                    @dblclick.stop="startSessionRename(session)"
                  >
                    {{ sessionDisplayName(session) }}
                  </span>
                  <button
                    type="button"
                    class="shrink-0 px-1 text-[11px] leading-none opacity-0 hover:!opacity-100 group-hover:opacity-60"
                    title="Rename conversation"
                    @click.stop="startSessionRename(session)"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    class="shrink-0 px-1 text-sm font-bold leading-none opacity-60 hover:opacity-100"
                    :class="archivingSessionId === session.id ? 'cursor-wait' : ''"
                    title="Archive conversation (tmux session and worktree are removed, branch is kept)"
                    @click.stop="archiveSession(session)"
                  >
                    ×
                  </button>
                </span>
                <span class="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                  <span class="shrink-0 text-[9px] font-bold uppercase opacity-70">{{ session.provider }}</span>
                  <span
                    class="shrink-0 px-1.5 py-0.5 text-[10px] font-bold"
                    :class="runtimeStateClass(session)"
                  >
                    {{ formatRuntimeState(session) }}
                  </span>
                  <span
                    v-if="session.previewBranch"
                    class="shrink-0 border border-[var(--rg-accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase"
                    :class="session.id === sessionId ? 'text-[var(--rg-editor)]' : 'text-[var(--rg-accent)]'"
                  >
                    preview
                  </span>
                </span>
                <span
                  v-if="session.worktreeBranch || session.baseBranch || session.cwd"
                  class="mt-0.5 flex min-w-0 flex-wrap items-center gap-1"
                  @click.stop
                >
                  <button
                    v-if="session.worktreeBranch"
                    type="button"
                    class="inline-flex min-w-0 max-w-full items-center gap-1 border border-[var(--rg-accent)] px-1.5 py-0.5 font-mono text-[9px] hover:bg-[var(--rg-accent)]/10"
                    :class="session.id === sessionId ? 'text-[var(--rg-editor)]' : 'text-[var(--rg-accent)]'"
                    title="Click to copy current branch"
                    @click.stop="copyText(session.worktreeBranch!)"
                  >
                    <span class="shrink-0 opacity-70">⑂</span>
                    <span class="truncate">{{ session.worktreeBranch }}</span>
                  </button>
                  <button
                    v-if="session.baseBranch"
                    type="button"
                    class="inline-flex min-w-0 max-w-full items-center gap-1 border px-1.5 py-0.5 font-mono text-[9px] hover:bg-black/5"
                    :class="session.id === sessionId ? 'border-[#2b2a27]/40 text-[#2b2a27]/80' : 'border-[#88857c]/50 text-[#88857c]'"
                    title="Click to copy base branch"
                    @click.stop="copyText(session.baseBranch!)"
                  >
                    <span class="truncate">base: {{ session.baseBranch }}</span>
                  </button>
                  <button
                    v-if="session.cwd"
                    type="button"
                    class="inline-flex min-w-0 max-w-full items-center gap-1 border px-1.5 py-0.5 font-mono text-[9px] hover:bg-black/5"
                    :class="session.id === sessionId ? 'border-[#2b2a27]/40 text-[#2b2a27]/80' : 'border-[#88857c]/50 text-[#88857c]'"
                    :title="`Click to copy worktree path: ${session.cwd}`"
                    @click.stop="copyText(session.cwd)"
                  >
                    <span class="shrink-0 opacity-70">▚</span>
                    <span class="truncate">{{ session.cwd }}</span>
                  </button>
                </span>
                <span
                  class="block truncate font-mono text-[11px]"
                  :class="session.id === sessionId ? 'text-[#2b2a27]/80' : 'text-[#88857c]'"
                >
                  {{ formatSessionTime(session.updatedAt) }} · {{ formatBytes(session.logBytes) }}
                </span>
                <span
                  v-if="session.preview"
                  class="block truncate text-[11px]"
                  :class="session.id === sessionId ? 'text-[#2b2a27]/70' : 'text-[#7a7267]'"
                  :title="session.preview"
                >
                  {{ session.preview }}
                </span>
              </span>
            </div>
            <p v-if="!sessions.length" class="px-4 py-3 text-[12px] text-[#88857c]">
              {{ loadingSessions ? 'Loading conversations...' : 'No saved conversations.' }}
            </p>
            <p v-else-if="!filteredSessions.length" class="px-4 py-3 text-[12px] text-[#88857c]">
              No conversations match "{{ conversationSearchQuery.trim() }}".
            </p>

            <div class="mt-3 border-t border-black/20 pt-1">
              <div class="flex h-6 items-center justify-between px-3 text-[11px] font-bold uppercase text-[#a0988e]">
                <button
                  type="button"
                  class="flex items-center gap-1 hover:text-[var(--rg-foreground)]"
                  @click="toggleArchivedSessions"
                >
                  <span>{{ showArchivedSessions ? '▾' : '▸' }}</span>
                  <span>Archived ({{ archivedSessions.length }})</span>
                </button>
                <button
                  v-if="showArchivedSessions && archivedSessions.length"
                  type="button"
                  class="text-[10px] normal-case text-[#88857c] hover:text-[#f03e5f]"
                  title="Permanently delete all archived conversations"
                  @click="deleteAllArchivedSessions"
                >
                  Delete All
                </button>
              </div>
              <template v-if="showArchivedSessions">
                <div
                  v-for="session in filteredArchivedSessions"
                  :key="session.id"
                  class="group grid w-full grid-cols-[18px_minmax(0,1fr)] gap-2 px-3 py-1.5 text-left text-[12px] text-[#a0988e] hover:bg-[var(--rg-editor-group)]"
                  :class="selectedArchivedSessionId === session.id ? 'bg-[var(--rg-selection)] text-[var(--rg-editor)]' : ''"
                  :title="session.id"
                  role="button"
                  tabindex="0"
                  @click="selectArchivedSession(session)"
                  @keydown.enter.prevent="selectArchivedSession(session)"
                >
                  <span class="opacity-50">◌</span>
                  <span class="min-w-0">
                    <span class="flex min-w-0 items-center gap-2">
                      <span class="block min-w-0 flex-1 truncate font-mono font-semibold">{{ sessionDisplayName(session) }}</span>
                      <span class="shrink-0 text-[9px] font-bold uppercase opacity-70">{{ session.provider }}</span>
                      <button
                        type="button"
                        class="shrink-0 px-1 text-[12px] leading-none opacity-60 hover:opacity-100 hover:text-[var(--rg-accent)]"
                        :class="restoringSessionId === session.id ? 'cursor-wait' : ''"
                        title="Restore conversation (recreates the worktree)"
                        @click.stop="restoreArchivedSession(session)"
                      >
                        ↩
                      </button>
                      <button
                        type="button"
                        class="shrink-0 px-1 text-sm font-bold leading-none opacity-60 hover:opacity-100 hover:text-[#f03e5f]"
                        :class="deletingSessionId === session.id ? 'cursor-wait' : ''"
                        title="Permanently delete archived conversation"
                        @click.stop="deleteArchivedSession(session)"
                      >
                        ×
                      </button>
                    </span>
                    <span class="block truncate font-mono text-[11px] text-[#88857c]">
                      archived {{ session.archivedAt ? formatSessionTime(session.archivedAt) : '' }}{{ session.branchKept === false ? ' · branch removed' : '' }}
                    </span>
                  </span>
                </div>
                <p v-if="!archivedSessions.length" class="px-4 py-2 text-[12px] text-[#88857c]">
                  {{ loadingArchived ? 'Loading archives...' : 'No archived conversations.' }}
                </p>
              </template>
            </div>
          </div>
          <div v-else class="min-h-0 overflow-auto py-2">
            <div class="mb-1 flex h-6 items-center px-3 text-[11px] font-bold uppercase text-[#a0988e]">
              Shells ({{ shells.length }})
            </div>
            <button
              v-for="shell in shells"
              :key="shell.id"
              type="button"
              class="group grid w-full grid-cols-[16px_minmax(0,1fr)_18px] items-center gap-2 px-3 py-1.5 text-left text-[12px]"
              :class="activeShellId === shell.id ? 'bg-[var(--rg-editor-group)] text-[var(--rg-foreground)]' : 'text-[#c8bdaf] hover:bg-[var(--rg-editor-group)]'"
              :title="shell.tmuxName"
              @click="selectShell(shell.id)"
            >
              <span class="font-mono text-[var(--rg-accent)]">&gt;_</span>
              <span class="min-w-0 truncate font-mono">{{ shell.id }}</span>
              <span
                class="grid h-4 w-4 place-items-center text-[13px] text-[#88857c] opacity-0 hover:text-[#f03e5f] group-hover:opacity-100"
                role="button"
                title="Close terminal"
                @click.stop="killShell(shell.id)"
              >
                ×
              </span>
            </button>
            <p v-if="!shells.length" class="px-4 py-3 text-[12px] text-[#88857c]">
              {{ loadingShells ? 'Loading terminals...' : 'No terminals. Create one with + New Terminal.' }}
            </p>
          </div>
          <section class="grid min-h-0 grid-rows-[32px_minmax(0,1fr)] overflow-hidden border-t border-black/30 bg-[var(--rg-editor-group)]">
            <div class="flex h-8 items-center border-b border-[#46443f] px-3 text-[11px] font-bold uppercase text-[#ede0ce]">
              Outline
            </div>
            <div class="grid gap-1 p-3 font-mono text-[11px] text-[#a0988e]">
              <div class="flex justify-between gap-2">
                <span>socket</span>
                <span class="text-[var(--rg-accent)]">{{ statusText }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span>{{ activeSession?.provider || 'provider' }}</span>
                <span class="text-[var(--rg-accent)]">{{ activeSession ? formatRuntimeState(activeSession) : '-' }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span>branch</span>
                <span class="min-w-0 truncate text-[var(--rg-accent)]" :title="activeSession?.worktreeBranch || '-'">{{ activeSession?.worktreeBranch || '-' }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span>bin</span>
                <span>{{ activeSession?.cliBin || '-' }}</span>
              </div>
              <div class="truncate text-[#7a7267]">{{ activeSession?.cwd || '-' }}</div>
            </div>
          </section>
        </aside>

        <section class="brick-chat relative grid min-h-0 min-w-0 overflow-hidden grid-rows-[35px_minmax(0,1fr)_128px] bg-[var(--rg-editor)]">
          <div class="flex min-w-0 items-center justify-between border-b border-black/40 bg-[var(--rg-editor-group)]">
            <div class="flex min-w-0 items-center">
              <div class="flex h-[35px] min-w-0 max-w-[52vw] items-center gap-2 border-r border-black/40 bg-[var(--rg-editor)] px-3 text-[12px] text-[var(--rg-foreground)]">
                <span class="text-[var(--rg-accent)]">●</span>
                <span class="truncate font-mono">{{ activeSession?.tmuxName || 'new-session' }}</span>
              </div>
              <div class="flex h-[35px] items-center px-3 text-[12px] text-[#88857c]">
                terminal
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
                  v-if="canPreviewActiveSession"
                  type="button"
                  class="grid h-6 w-7 place-items-center border border-[var(--rg-border)] bg-[var(--rg-input)] text-[13px] text-[var(--rg-foreground)] hover:border-[var(--rg-accent)] hover:text-[var(--rg-accent)] disabled:cursor-wait disabled:opacity-50"
                  :class="isActiveSessionPreviewing ? 'border-[var(--rg-accent)] text-[var(--rg-accent)]' : ''"
                  :disabled="previewRunning"
                  :title="isActiveSessionPreviewing ? 'End preview and switch back to the base branch' : 'Preview worktree changes in the main worktree'"
                  @click="toggleSessionPreview"
                >
                  {{ isActiveSessionPreviewing ? '◉' : '◎' }}
                </button>
                <button
                  type="button"
                  class="h-6 border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 text-[var(--rg-foreground)] hover:border-[var(--rg-accent)] hover:text-[var(--rg-accent)]"
                  title="Rebase the conversation worktree onto a selected base branch"
                  @click="openIntegrationModal('rebase')"
                >
                  Rebase
                </button>
                <button
                  type="button"
                  class="h-6 bg-[var(--rg-button)] px-2 font-bold text-white hover:brightness-110"
                  title="Squash, merge to a selected base branch, and close the conversation"
                  @click="openIntegrationModal('finalize')"
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
            v-show="activeSidebarPanel === 'terminal'"
            class="absolute inset-0 z-10 grid min-h-0 grid-rows-[36px_minmax(0,1fr)] bg-[var(--rg-terminal)] shadow-2xl"
          >
            <div class="flex min-w-0 items-stretch border-b border-black/40 bg-[var(--rg-editor-group)] font-mono text-[11px]">
              <div class="flex min-w-0 flex-1 items-stretch overflow-x-auto">
                <button
                  v-for="shell in shells"
                  :key="shell.id"
                  type="button"
                  class="group flex shrink-0 items-center gap-2 border-r border-black/30 px-3"
                  :class="activeShellId === shell.id ? 'bg-[var(--rg-terminal)] text-[var(--rg-foreground)]' : 'text-[#88857c] hover:text-[#ede0ce]'"
                  @click="selectShell(shell.id)"
                >
                  <span class="text-[var(--rg-accent)]">&gt;_</span>
                  <span class="max-w-[140px] truncate">{{ shell.id }}</span>
                  <span
                    class="grid h-4 w-4 place-items-center text-[13px] text-[#88857c] hover:text-[#f03e5f]"
                    role="button"
                    title="Close terminal"
                    @click.stop="killShell(shell.id)"
                  >
                    ×
                  </span>
                </button>
              </div>
              <button
                type="button"
                class="grid w-9 shrink-0 place-items-center border-l border-black/40 text-[16px] text-[var(--rg-foreground)] hover:text-[var(--rg-accent)] disabled:opacity-60"
                :disabled="creatingShell"
                title="New Terminal (N)"
                @click="createShell"
              >
                +
              </button>
            </div>
            <div class="relative min-h-0 min-w-0 overflow-hidden p-3">
              <div ref="shellTerminalEl" class="terminal h-full min-h-0 w-full min-w-0" />
              <div
                v-if="!activeShellId"
                class="absolute inset-0 grid place-items-center bg-[var(--rg-terminal)] text-center text-[12px] text-[#88857c]"
              >
                <div class="grid gap-2">
                  <p>No terminal open.</p>
                  <button
                    type="button"
                    class="mx-auto h-7 bg-[var(--rg-button)] px-3 text-xs font-bold text-white hover:brightness-110 disabled:opacity-60"
                    :disabled="creatingShell"
                    @click="createShell"
                  >
                    + New Terminal <span class="ml-1 opacity-70">N</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div class="terminal-frame min-h-0 min-w-0 overflow-hidden bg-[var(--rg-terminal)] p-3">
            <div ref="terminalEl" class="terminal h-full min-h-0 w-full min-w-0" />
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

        <aside
          class="brick-git grid min-h-0 min-w-0 overflow-hidden border-r border-black/40 bg-[var(--rg-sidebar)]"
          style="grid-template-rows: 35px 44px minmax(0, 1fr) minmax(280px, 50%);"
          :class="isMobile
            ? 'absolute inset-y-0 left-12 right-0 z-20 shadow-2xl'
            : gitGraphPinned
              ? 'relative'
              : 'absolute bottom-0 right-0 top-0 z-20 w-[min(840px,calc(100vw-48px))] shadow-2xl'"
        >
          <div class="flex min-w-0 items-center justify-between gap-2 border-b border-black/30 px-3 text-[11px] font-bold uppercase tracking-wide text-[var(--rg-foreground)]">
            <span>Git Graph</span>
            <span class="flex items-center gap-1">
              <button
                type="button"
                class="grid h-6 w-6 place-items-center border border-[var(--rg-border)] bg-[var(--rg-input)] text-[13px] text-[var(--rg-foreground)] hover:border-[var(--rg-accent)]"
                :class="graphBranchFilter.length ? 'border-[var(--rg-accent)] text-[var(--rg-accent)]' : ''"
                :title="graphBranchFilter.length ? `Branch filter (${graphBranchFilter.length} selected)` : 'Filter branches'"
                @click.stop="showGraphSettingsDropdown = false; showGraphBranchDropdown = !showGraphBranchDropdown"
              >
                ⎇
              </button>
              <button
                type="button"
                class="grid h-6 w-6 place-items-center border border-[var(--rg-border)] bg-[var(--rg-input)] text-[13px] text-[var(--rg-foreground)] hover:border-[var(--rg-accent)]"
                title="Manage worktrees"
                @click="openWorktreesModal"
              >
                ⌗
              </button>
              <button
                type="button"
                class="grid h-6 w-6 place-items-center border border-[var(--rg-border)] bg-[var(--rg-input)] text-[13px] text-[var(--rg-foreground)] hover:border-[var(--rg-accent)]"
                title="Graph settings"
                @click.stop="showGraphBranchDropdown = false; showGraphSettingsDropdown = !showGraphSettingsDropdown"
              >
                ⚙
              </button>
              <button
                type="button"
                class="grid h-6 w-6 place-items-center border border-[var(--rg-border)] bg-[var(--rg-input)] text-[13px] text-[var(--rg-foreground)] hover:border-[var(--rg-accent)]"
                :class="gitGraphPinned ? 'border-[var(--rg-accent)] text-[var(--rg-accent)]' : ''"
                :title="gitGraphPinned ? 'Unpin Git Graph' : 'Pin Git Graph'"
                @click="toggleGitGraphPinned"
              >
                {{ gitGraphPinned ? '●' : '○' }}
              </button>
            </span>
          </div>

          <div
            v-if="showGraphBranchDropdown"
            class="absolute right-2 top-9 z-40 max-h-[60%] w-72 overflow-auto border border-[var(--rg-border)] bg-[var(--rg-input)] py-1 font-mono text-[11px] text-[var(--rg-foreground)] shadow-2xl"
            @click.stop
          >
            <button
              type="button"
              class="block w-full px-3 py-1.5 text-left font-bold hover:bg-[var(--rg-editor-group)]"
              :class="graphBranchFilter.length ? '' : 'text-[var(--rg-accent)]'"
              @click="clearGraphBranchFilter"
            >
              All branches
            </button>
            <div class="my-1 border-t border-[var(--rg-border)]" />
            <div class="px-3 py-1 text-[10px] font-bold uppercase text-[var(--rg-muted)]">Local</div>
            <button
              v-for="branch in localGraphBranches"
              :key="`filter-${branch.name}`"
              type="button"
              class="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-[var(--rg-editor-group)]"
              @click="toggleGraphBranchFilter(branch.name)"
            >
              <span class="w-3 text-[var(--rg-accent)]">{{ graphBranchFilter.includes(branch.name) ? '✓' : '' }}</span>
              <span class="min-w-0 truncate">{{ branch.name }}</span>
              <span v-if="branch.current" class="shrink-0 text-[9px] uppercase text-[var(--rg-muted)]">head</span>
            </button>
            <template v-for="group in remoteGraphBranchGroups" :key="`remote-${group.remote}`">
              <div class="px-3 py-1 text-[10px] font-bold uppercase text-[var(--rg-muted)]">{{ group.remote }}</div>
              <button
                v-for="branch in group.branches"
                :key="`filter-${branch.name}`"
                type="button"
                class="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-[var(--rg-editor-group)]"
                @click="toggleGraphBranchFilter(branch.name)"
              >
                <span class="w-3 text-[var(--rg-accent)]">{{ graphBranchFilter.includes(branch.name) ? '✓' : '' }}</span>
                <span class="min-w-0 truncate">{{ branch.name }}</span>
              </button>
            </template>
          </div>

          <div
            v-if="showGraphSettingsDropdown"
            class="absolute right-2 top-9 z-40 w-64 border border-[var(--rg-border)] bg-[var(--rg-input)] py-1 font-mono text-[11px] text-[var(--rg-foreground)] shadow-2xl"
            @click.stop
          >
            <div class="px-3 py-1 text-[10px] font-bold uppercase text-[var(--rg-muted)]">Graph Style</div>
            <label class="flex w-full cursor-pointer items-center gap-2 px-3 py-1 hover:bg-[var(--rg-editor-group)]">
              <input v-model="graphSettings.style" type="radio" value="rounded" class="accent-[var(--rg-accent)]">
              <span>Rounded connections</span>
            </label>
            <label class="flex w-full cursor-pointer items-center gap-2 px-3 py-1 hover:bg-[var(--rg-editor-group)]">
              <input v-model="graphSettings.style" type="radio" value="angular" class="accent-[var(--rg-accent)]">
              <span>Angular connections</span>
            </label>
            <div class="my-1 border-t border-[var(--rg-border)]" />
            <label class="flex w-full cursor-pointer items-center gap-2 px-3 py-1 hover:bg-[var(--rg-editor-group)]">
              <input v-model="graphSettings.muteNonHead" type="checkbox" class="accent-[var(--rg-accent)]">
              <span>Mute commits not ancestors of HEAD</span>
            </label>
            <div class="my-1 border-t border-[var(--rg-border)]" />
            <div class="px-3 py-1 text-[10px] font-bold uppercase text-[var(--rg-muted)]">Columns</div>
            <label class="flex w-full cursor-pointer items-center gap-2 px-3 py-1 hover:bg-[var(--rg-editor-group)]">
              <input v-model="graphSettings.showAuthor" type="checkbox" class="accent-[var(--rg-accent)]">
              <span>Author</span>
            </label>
            <label class="flex w-full cursor-pointer items-center gap-2 px-3 py-1 hover:bg-[var(--rg-editor-group)]">
              <input v-model="graphSettings.showDate" type="checkbox" class="accent-[var(--rg-accent)]">
              <span>Date</span>
            </label>
          </div>

          <div class="flex min-w-0 items-center gap-2 border-b border-black/30 bg-[var(--rg-sidebar-header)] px-3">
            <input
              v-model="gitGraphSearch"
              type="search"
              class="h-7 min-w-0 flex-1 border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 text-xs text-[var(--rg-foreground)] outline-none placeholder:text-[#88857c] focus:border-[var(--rg-accent)]"
              placeholder="Find commits"
              aria-label="Find commits"
              @keydown.enter.exact.prevent="goToGraphFindMatch(1)"
              @keydown.enter.shift.prevent="goToGraphFindMatch(-1)"
            >
            <span
              v-if="gitGraphSearch.trim()"
              class="shrink-0 font-mono text-[10px] text-[var(--rg-muted)]"
            >
              {{ graphFindMatches.length ? `${graphFindIndex + 1 || '–'}/${graphFindMatches.length}` : '0/0' }}
            </span>
            <button
              type="button"
              class="grid h-7 w-7 shrink-0 place-items-center border border-[var(--rg-border)] bg-[var(--rg-input)] text-xs text-[var(--rg-foreground)] hover:border-[var(--rg-accent)] disabled:opacity-40"
              title="Previous match (Shift+Enter)"
              :disabled="!graphFindMatches.length"
              @click="goToGraphFindMatch(-1)"
            >
              ↑
            </button>
            <button
              type="button"
              class="grid h-7 w-7 shrink-0 place-items-center border border-[var(--rg-border)] bg-[var(--rg-input)] text-xs text-[var(--rg-foreground)] hover:border-[var(--rg-accent)] disabled:opacity-40"
              title="Next match (Enter)"
              :disabled="!graphFindMatches.length"
              @click="goToGraphFindMatch(1)"
            >
              ↓
            </button>
            <button
              type="button"
              class="h-7 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 text-xs font-bold text-[var(--rg-foreground)] hover:border-[var(--rg-accent)]"
              :class="loadingGitGraph ? 'cursor-wait opacity-60' : ''"
              @click="refreshGitGraph"
            >
              Refresh
            </button>
            <button
              type="button"
              class="grid h-7 w-7 shrink-0 place-items-center border border-[var(--rg-border)] bg-[var(--rg-input)] text-sm text-[var(--rg-foreground)] hover:border-[var(--rg-accent)]"
              title="Manage Remotes"
              @click="openRemotesModal"
            >
              ⇄
            </button>
          </div>

          <div class="min-h-0 overflow-auto" @scroll.passive="handleGraphListScroll">
            <div class="border-b border-black/30 bg-[var(--rg-editor-group)] px-3 py-2 font-mono text-[11px] text-[#c8bdaf]">
              <div class="flex min-w-0 items-center justify-between gap-3">
                <span class="truncate" :title="gitGraph?.root || graphWorkingDirectory">{{ gitGraph?.root || graphWorkingDirectory || 'Current project' }}</span>
                <span
                  class="shrink-0 px-1.5 py-0.5 text-[10px] font-bold"
                  :class="gitGraph?.status.clean ? 'bg-[var(--rg-accent)] text-white' : 'bg-[#f7b83d] text-[#2b2a27]'"
                  title="Working tree actions (Shift+F10)"
                  role="button"
                  tabindex="0"
                  aria-haspopup="menu"
                  @contextmenu="openWorkingTreeContextMenu"
                  @keydown="openWorkingTreeContextMenu"
                >
                  {{ gitGraph?.status.clean ? 'clean' : `${gitGraph?.status.changed || 0} changed` }}
                </span>
              </div>
              <div class="mt-1 truncate text-[#88857c]">
                {{ currentBranches[0]?.name || gitGraph?.head || 'HEAD' }}
              </div>
              <div v-if="showFeatureLegend || previewLineSet.size" class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#88857c]">
                <span v-if="showFeatureLegend" class="flex items-center gap-1">
                  <span class="inline-block h-2 w-2 rounded-[1px] bg-[#26a6a6]" />
                  conversation
                </span>
                <span v-if="previewLineSet.size" class="flex items-center gap-1">
                  <span class="inline-block h-2 w-2 rounded-[1px] bg-[#f03e5f]" />
                  preview
                </span>
              </div>
            </div>

            <p v-if="loadingGitGraph && !gitGraph" class="px-4 py-3 text-[12px] text-[#88857c]">
              Loading git graph...
            </p>
            <p v-else-if="gitGraphError" class="px-4 py-3 text-[12px] leading-5 text-[#f03e5f]">
              {{ gitGraphError }}
            </p>
            <p v-else-if="gitGraph && !gitGraph.commits.length" class="px-4 py-3 text-[12px] text-[#88857c]">
              No commits found.
            </p>

            <button
              v-if="gitGraph && !gitGraph.status.clean"
              type="button"
              class="group grid w-full cursor-pointer items-center border-b border-black/20 text-left text-[12px]"
              :class="selectedUncommittedChanges ? 'bg-[var(--rg-selection)] text-[var(--rg-editor)]' : 'text-[var(--rg-foreground)] hover:bg-[var(--rg-editor-group)]'"
              :style="{ gridTemplateColumns: `${gitGraphColumnWidth}px minmax(0,1fr)`, height: `${GRAPH_ROW_HEIGHT}px` }"
              @click="selectUncommittedChanges"
              @contextmenu="openWorkingTreeContextMenu"
              @keydown="openWorkingTreeContextMenu"
              aria-haspopup="menu"
            >
              <span class="relative block overflow-hidden">
                <svg :width="gitGraphColumnWidth" :height="GRAPH_ROW_HEIGHT" class="block" aria-hidden="true">
                  <circle
                    :cx="graphLaneX(0)"
                    :cy="GRAPH_ROW_HEIGHT / 2"
                    :r="GRAPH_NODE_RADIUS + 1"
                    fill="#f7b83d"
                    stroke="currentColor"
                    stroke-width="1.5"
                  />
                </svg>
              </span>
              <span class="flex min-w-0 items-center gap-2 px-2">
                <span class="font-semibold text-[#f7b83d]">Uncommitted Changes</span>
                <span class="min-w-0 flex-1 truncate text-[10px] text-[var(--rg-muted)]">
                  {{ gitGraph.status.staged }} staged · {{ gitGraph.status.unstaged }} unstaged
                </span>
              </span>
            </button>

            <button
              v-for="stash in gitGraph?.stashes || []"
              :key="`stash-${stash.index}`"
              type="button"
              class="group grid w-full cursor-pointer items-center border-b border-black/20 text-left text-[12px] text-[var(--rg-foreground)] hover:bg-[var(--rg-editor-group)]"
              :style="{ gridTemplateColumns: `${gitGraphColumnWidth}px minmax(0,1fr)`, height: `${GRAPH_ROW_HEIGHT}px` }"
              :title="stash.hash"
              @contextmenu="openStashContextMenu($event, stash)"
              @keydown="openStashContextMenu($event, stash)"
              aria-haspopup="menu"
            >
              <span class="relative block overflow-hidden">
                <svg
                  :width="gitGraphColumnWidth"
                  :height="GRAPH_ROW_HEIGHT"
                  class="block shrink-0"
                  aria-hidden="true"
                >
                  <circle
                    :cx="graphLaneX(0)"
                    :cy="GRAPH_ROW_HEIGHT / 2"
                    :r="GRAPH_NODE_RADIUS"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="text-[#f7b83d]"
                  />
                  <circle
                    :cx="graphLaneX(0)"
                    :cy="GRAPH_ROW_HEIGHT / 2"
                    :r="GRAPH_NODE_RADIUS - 2"
                    fill="#f7b83d"
                  />
                </svg>
              </span>
              <span class="flex min-w-0 items-center gap-2 rounded-r px-2 transition-colors group-hover:bg-[var(--rg-panel)]/50">
                <span class="shrink-0 font-mono text-[11px] text-[#f7b83d]">{{ stashName(stash.index) }}</span>
                <span v-if="stash.branch" class="shrink-0 rounded border border-[#f7b83d]/30 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[#f7b83d]">{{ stash.branch }}</span>
                <span class="min-w-0 flex-1 truncate text-xs">{{ stash.message }}</span>
                <span class="shrink-0 text-[10px] text-[var(--rg-muted)]">{{ stash.date }}</span>
              </span>
            </button>

            <button
              v-for="commit in gitGraph?.commits || []"
              :key="commit.hash"
              type="button"
              class="group grid w-full cursor-pointer items-center border-b border-black/20 text-left text-[12px]"
              :class="[
                selectedCommitHash === commit.hash
                  ? 'bg-[var(--rg-selection)] text-[var(--rg-editor)]'
                  : graphFindMatchSet.has(commit.hash)
                    ? 'bg-[var(--rg-accent)]/15 text-[var(--rg-foreground)] hover:bg-[var(--rg-editor-group)]'
                    : previewLineSet.has(commit.hash)
                      ? 'bg-[#f03e5f]/12 text-[var(--rg-foreground)] hover:bg-[var(--rg-editor-group)]'
                      : featureLineSet.has(commit.hash)
                        ? 'bg-[#26a6a6]/12 text-[var(--rg-foreground)] hover:bg-[var(--rg-editor-group)]'
                        : 'text-[var(--rg-foreground)] hover:bg-[var(--rg-editor-group)]',
                isMutedCommit(commit.hash) ? 'opacity-40' : ''
              ]"
              :style="{ gridTemplateColumns: `${gitGraphColumnWidth}px minmax(0,1fr)`, height: `${GRAPH_ROW_HEIGHT}px` }"
              :title="commit.hash"
              :data-commit-hash="commit.hash"
              @click="selectCommit(commit.hash)"
              @contextmenu="openCommitContextMenu($event, commit)"
              @keydown="openCommitContextMenu($event, commit)"
              aria-haspopup="menu"
            >
              <span class="relative block overflow-hidden">
                <svg
                  :width="gitGraphColumnWidth"
                  :height="GRAPH_ROW_HEIGHT"
                  class="block shrink-0"
                  aria-hidden="true"
                >
                  <path
                    v-for="(segment, index) in graphRows.get(commit.hash)?.connections || []"
                    :key="index"
                    :d="graphSegmentPath(segment)"
                    :stroke="segment.color"
                    :stroke-dasharray="segment.type.startsWith('merge') ? '4 3' : undefined"
                    stroke-width="2"
                    fill="none"
                  />
                  <circle
                    v-if="graphRows.get(commit.hash)?.nodeType === 'head'"
                    :cx="graphLaneX(graphRows.get(commit.hash)?.lane || 0)"
                    :cy="GRAPH_ROW_HEIGHT / 2"
                    :r="GRAPH_NODE_RADIUS + 2"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="text-[var(--rg-accent)]"
                  />
                  <circle
                    v-if="mergeBaseSet.has(commit.hash)"
                    :cx="graphLaneX(graphRows.get(commit.hash)?.lane || 0)"
                    :cy="GRAPH_ROW_HEIGHT / 2"
                    :r="GRAPH_NODE_RADIUS + 3"
                    fill="none"
                    stroke="#f7b83d"
                    stroke-width="1.5"
                    stroke-dasharray="3 2"
                  />
                  <circle
                    v-if="graphRows.get(commit.hash)?.nodeType === 'merge'"
                    :cx="graphLaneX(graphRows.get(commit.hash)?.lane || 0)"
                    :cy="GRAPH_ROW_HEIGHT / 2"
                    :r="GRAPH_NODE_RADIUS + 1"
                    fill="none"
                    :stroke="graphRows.get(commit.hash)?.color || commit.color"
                    stroke-width="1.5"
                  />
                  <circle
                    :cx="graphLaneX(graphRows.get(commit.hash)?.lane || 0)"
                    :cy="GRAPH_ROW_HEIGHT / 2"
                    :r="graphRows.get(commit.hash)?.nodeType === 'merge' ? GRAPH_NODE_RADIUS - 1 : GRAPH_NODE_RADIUS"
                    :fill="graphRows.get(commit.hash)?.color || commit.color"
                  />
                </svg>
              </span>
              <span
                class="flex min-w-0 items-center gap-2 rounded-r px-2 transition-colors"
                :class="selectedCommitHash === commit.hash ? '' : 'group-hover:bg-[var(--rg-panel)]/50'"
                :style="{ height: `${GRAPH_ROW_HEIGHT - 4}px`, alignSelf: 'center' }"
              >
                <span
                  class="shrink-0 font-mono text-[11px]"
                  :class="graphRows.get(commit.hash)?.nodeType === 'head' ? 'font-semibold text-[var(--rg-accent)]' : 'text-[var(--rg-muted)]'"
                >
                  {{ commit.shortHash }}
                </span>
                <span class="flex min-w-0 shrink-0 items-center gap-1">
                  <span
                    v-for="grouped in groupedBranchesFor(commit).slice(0, 3)"
                    :key="grouped.displayName"
                    class="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                    :class="selectedCommitHash === commit.hash
                      ? 'border-[#2b2a27]/40 text-[#2b2a27]'
                      : grouped.isLocal
                        ? 'border-[#26a6a6]/50 text-[#26a6a6]'
                        : 'border-[#ff9d5c]/50 text-[#ff9d5c]'"
                    :title="grouped.originalBranches.join(', ')"
                    @contextmenu="openBranchContextMenu($event, commit, grouped.originalBranches[0]!)"
                  >
                    {{ grouped.displayName }}
                  </span>
                  <span
                    v-for="tag in commit.tags.slice(0, 3)"
                    :key="`tag:${tag}`"
                    class="shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                    :class="selectedCommitHash === commit.hash ? 'border-[#2b2a27]/40 text-[#2b2a27]' : 'border-[#c58cff]/50 text-[#c58cff]'"
                    :title="`tag: ${tag}`"
                    @contextmenu="openTagContextMenu($event, commit, tag)"
                  >
                    {{ tag }}
                  </span>
                  <span
                    v-if="mergeBaseSet.has(commit.hash)"
                    class="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                    :class="selectedCommitHash === commit.hash ? 'border-[#2b2a27]/40 text-[#2b2a27]' : 'border-[#f7b83d]/50 text-[#f7b83d]'"
                    title="Merge base of a conversation/preview branch and HEAD"
                  >
                    base
                  </span>
                </span>
                <span class="min-w-0 flex-1 truncate text-xs">{{ commit.subject }}</span>
                <span v-if="graphSettings.showAuthor" class="hidden shrink-0 text-[10px] text-[var(--rg-muted)] sm:inline">{{ commit.author.name }}</span>
                <span v-if="graphSettings.showDate" class="shrink-0 text-[10px] text-[var(--rg-muted)]">{{ formatCommitDate(commit.date) }}</span>
              </span>
            </button>
          </div>

          <section class="grid min-h-0 grid-rows-[32px_minmax(0,1fr)] overflow-hidden border-t border-black/30 bg-[var(--rg-editor-group)]">
            <div class="flex h-8 items-center border-b border-[#46443f] px-3 text-[11px] font-bold uppercase text-[#ede0ce]">
              {{ selectedUncommittedChanges ? 'Uncommitted Changes' : compareView || loadingCompare ? 'Commit Comparison' : 'Commit Details' }}
            </div>
            <div class="min-h-0 overflow-hidden p-3 font-mono text-[11px] leading-5 text-[#c8bdaf]">
              <template v-if="selectedUncommittedChanges && gitGraph">
                <div class="grid h-full grid-cols-[minmax(0,1fr)_220px] gap-3">
                  <div class="min-h-0 overflow-auto">
                    <div class="mb-1 flex items-center justify-between text-[#bcd42a]">
                      <span>Staged ({{ gitGraph.status.stagedFiles.length }})</span>
                      <button
                        v-if="gitGraph.status.stagedFiles.length"
                        type="button"
                        class="text-[10px] text-[var(--rg-muted)] hover:text-[var(--rg-foreground)]"
                        @click="unstageFiles()"
                      >
                        Unstage All
                      </button>
                    </div>
                    <button
                      v-for="file in gitGraph.status.stagedFiles"
                      :key="`staged-${file.path}`"
                      type="button"
                      class="flex w-full items-center gap-2 truncate py-0.5 text-left hover:bg-black/10"
                      :title="`Unstage ${file.path}`"
                      @click="unstageFiles([file.path])"
                    >
                      <span class="w-3 text-[#bcd42a]">{{ file.status }}</span>
                      <span class="truncate">{{ file.oldPath ? `${file.oldPath} → ${file.path}` : file.path }}</span>
                    </button>

                    <div class="mb-1 mt-2 flex items-center justify-between text-[#f7b83d]">
                      <span>Unstaged ({{ gitGraph.status.unstagedFiles.length }})</span>
                      <button
                        v-if="gitGraph.status.unstagedFiles.length"
                        type="button"
                        class="text-[10px] text-[var(--rg-muted)] hover:text-[var(--rg-foreground)]"
                        @click="stageFiles()"
                      >
                        Stage All
                      </button>
                    </div>
                    <button
                      v-for="file in gitGraph.status.unstagedFiles"
                      :key="`unstaged-${file.path}`"
                      type="button"
                      class="flex w-full items-center gap-2 truncate py-0.5 text-left hover:bg-black/10"
                      :title="`Stage ${file.path}`"
                      @click="stageFiles([file.path])"
                    >
                      <span class="w-3 text-[#f7b83d]">{{ file.status }}</span>
                      <span class="truncate">{{ file.oldPath ? `${file.oldPath} → ${file.path}` : file.path }}</span>
                    </button>
                  </div>
                  <div class="flex min-h-0 flex-col gap-2 border-l border-[var(--rg-border)] pl-3">
                    <textarea
                      v-model="gitCommitMessage"
                      rows="3"
                      class="min-h-0 flex-1 resize-none border border-[var(--rg-border)] bg-[var(--rg-input)] p-2 text-[11px] text-[var(--rg-foreground)] outline-none focus:border-[var(--rg-accent)]"
                      placeholder="Commit message..."
                      @keydown.ctrl.enter="commitStagedChanges"
                      @keydown.meta.enter="commitStagedChanges"
                    />
                    <button
                      type="button"
                      class="h-7 bg-[var(--rg-accent)] px-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                      :disabled="!gitCommitMessage.trim() || !gitGraph.status.stagedFiles.length || gitActionRunning"
                      @click="commitStagedChanges"
                    >
                      {{ gitActionRunning ? 'Working...' : `Commit (${gitGraph.status.stagedFiles.length})` }}
                    </button>
                  </div>
                </div>
              </template>
              <template v-else-if="compareView || loadingCompare">
                <p v-if="loadingCompare" class="text-[#88857c]">Comparing commits...</p>
                <div v-else-if="compareView" class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
                  <div class="min-h-0">
                    <div class="mb-2 flex min-w-0 items-center justify-between gap-2">
                      <span class="min-w-0 truncate text-[var(--rg-accent)]">
                        {{ compareView.from.slice(0, 8) }} → {{ compareView.to.slice(0, 8) }}
                      </span>
                      <button
                        type="button"
                        class="shrink-0 text-[10px] text-[var(--rg-muted)] hover:text-[var(--rg-foreground)]"
                        @click="closeCompareView"
                      >
                        Close
                      </button>
                    </div>
                    <div class="mb-2 flex gap-4 text-[11px]">
                      <span>{{ compareView.stats.filesChanged }} files</span>
                      <span class="text-[#bcd42a]">+{{ compareView.stats.additions }}</span>
                      <span class="text-[#f03e5f]">−{{ compareView.stats.deletions }}</span>
                    </div>
                  </div>
                  <div class="min-h-0 overflow-auto border-t border-black/30 pt-2">
                    <div
                      v-for="file in compareView.files"
                      :key="`${file.status}-${file.oldPath || ''}-${file.path}`"
                      class="grid w-full grid-cols-[22px_minmax(0,1fr)_auto] gap-2 py-0.5 text-left"
                      :title="file.oldPath ? `${file.oldPath} → ${file.path}` : file.path"
                    >
                      <span
                        class="text-center font-bold"
                        :class="file.status === 'A' ? 'text-[#59d9d9]' : file.status === 'D' ? 'text-[#f03e5f]' : file.status === 'R' ? 'text-[#f7b83d]' : 'text-[#bcd42a]'"
                      >
                        {{ file.status }}
                      </span>
                      <span class="truncate">{{ file.oldPath ? `${file.oldPath} → ${file.path}` : file.path }}</span>
                      <span class="shrink-0 font-mono text-[10px]">
                        <span class="text-[#bcd42a]">+{{ file.additions }}</span>
                        <span class="ml-1 text-[#f03e5f]">−{{ file.deletions }}</span>
                      </span>
                    </div>
                    <p v-if="!compareView.files.length" class="py-1 text-[#88857c]">No differences.</p>
                  </div>
                </div>
              </template>
              <template v-else-if="selectedCommit">
                <div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
                  <div class="min-h-0">
                    <div class="mb-2 truncate text-[var(--rg-accent)]">{{ selectedCommit.subject }}</div>
                    <div class="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1">
                      <span class="text-[#88857c]">hash</span>
                      <span class="truncate" :title="selectedCommit.hash">{{ selectedCommit.hash }}</span>
                      <span class="text-[#88857c]">author</span>
                      <span class="truncate" :title="selectedCommit.author.email">{{ selectedCommit.author.name }}</span>
                      <span class="text-[#88857c]">date</span>
                      <span>{{ formatCommitDate(selectedCommit.date) }}</span>
                      <span class="text-[#88857c]">parents</span>
                      <span>{{ selectedCommit.parents.length || 0 }}</span>
                    </div>
                  </div>
                  <div class="mt-3 grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-t border-black/30 pt-2">
                    <div class="mb-1 flex items-center justify-between text-[#ede0ce]">
                      <span>Files ({{ selectedCommitFiles.length }})</span>
                      <span class="flex items-center gap-2">
                        <button
                          type="button"
                          class="text-[10px] hover:text-[var(--rg-foreground)]"
                          :class="commitFileViewMode === 'flat' ? 'text-[var(--rg-accent)]' : 'text-[var(--rg-muted)]'"
                          title="Show files as a flat list"
                          @click="commitFileViewMode = 'flat'"
                        >
                          Flat
                        </button>
                        <button
                          type="button"
                          class="text-[10px] hover:text-[var(--rg-foreground)]"
                          :class="commitFileViewMode === 'tree' ? 'text-[var(--rg-accent)]' : 'text-[var(--rg-muted)]'"
                          title="Show files as a directory tree"
                          @click="commitFileViewMode === 'flat' ? toggleCommitFileViewMode() : undefined"
                        >
                          Tree
                        </button>
                        <button
                          type="button"
                          class="text-[10px] text-[var(--rg-muted)] hover:text-[var(--rg-foreground)]"
                          @click="refreshSelectedCommitFiles"
                        >
                          Refresh
                        </button>
                      </span>
                    </div>
                    <p v-if="loadingCommitFiles" class="min-h-0 overflow-auto py-1 text-[#88857c]">Loading files...</p>
                    <p v-else-if="commitFilesError" class="min-h-0 overflow-auto py-1 text-[#f03e5f]">{{ commitFilesError }}</p>
                    <p v-else-if="!selectedCommitFiles.length" class="min-h-0 overflow-auto py-1 text-[#88857c]">No file changes.</p>
                    <div v-else-if="commitFileViewMode === 'flat'" class="h-full min-h-0 overflow-auto pr-1">
                      <button
                        v-for="file in selectedCommitFiles"
                        :key="`${file.status}-${file.oldPath || ''}-${file.path}`"
                        type="button"
                        class="grid w-full grid-cols-[22px_minmax(0,1fr)] gap-2 py-0.5 text-left hover:bg-black/10"
                        :class="selectedCommitFilePath === file.path ? 'bg-black/20 text-[var(--rg-accent)]' : ''"
                        :title="file.oldPath ? `${file.oldPath} → ${file.path}` : file.path"
                        @click="openDiffPreview(file)"
                      >
                        <span
                          class="text-center font-bold"
                          :class="file.status === 'A' ? 'text-[#59d9d9]' : file.status === 'D' ? 'text-[#f03e5f]' : file.status === 'R' ? 'text-[#f7b83d]' : 'text-[#bcd42a]'"
                        >
                          {{ file.status }}
                        </span>
                        <span class="truncate">{{ file.oldPath ? `${file.oldPath} → ${file.path}` : file.path }}</span>
                      </button>
                    </div>
                    <div v-else class="h-full min-h-0 overflow-auto pr-1">
                      <template v-for="row in commitFileTreeRows">
                        <button
                          v-if="row.kind === 'folder'"
                          :key="`folder-${row.path}`"
                          type="button"
                          class="grid w-full grid-cols-[22px_minmax(0,1fr)] gap-2 py-0.5 text-left hover:bg-black/10"
                          :style="{ paddingLeft: `${row.depth * 12}px` }"
                          :title="row.path"
                          @click="toggleFileFolder(row.path)"
                        >
                          <span class="text-center text-[var(--rg-accent)]">{{ row.expanded ? '▾' : '▸' }}</span>
                          <span class="truncate text-[#a0988e]">{{ row.name }}/</span>
                        </button>
                        <button
                          v-else
                          :key="`file-${row.file.status}-${row.file.oldPath || ''}-${row.file.path}`"
                          type="button"
                          class="grid w-full grid-cols-[22px_minmax(0,1fr)] gap-2 py-0.5 text-left hover:bg-black/10"
                          :class="selectedCommitFilePath === row.file.path ? 'bg-black/20 text-[var(--rg-accent)]' : ''"
                          :style="{ paddingLeft: `${row.depth * 12}px` }"
                          :title="row.file.oldPath ? `${row.file.oldPath} → ${row.file.path}` : row.file.path"
                          @click="openDiffPreview(row.file)"
                        >
                          <span
                            class="text-center font-bold"
                            :class="row.file.status === 'A' ? 'text-[#59d9d9]' : row.file.status === 'D' ? 'text-[#f03e5f]' : row.file.status === 'R' ? 'text-[#f7b83d]' : 'text-[#bcd42a]'"
                          >
                            {{ row.file.status }}
                          </span>
                          <span class="truncate">{{ row.name }}</span>
                        </button>
                      </template>
                    </div>
                  </div>
                </div>
              </template>
              <p v-else class="text-[#88857c]">Select a commit.</p>
            </div>
          </section>
        </aside>

        <!-- The diff preview is a workspace-level overlay so a wide diff can
             cover the spec browser and conversation list as well as the chat. -->
        <section
          v-if="diffPreview || diffPreviewError || loadingDiffPreview"
          class="brick-diff-preview absolute inset-y-0 left-12 right-0 z-30 grid min-h-0 min-w-0 grid-rows-[36px_minmax(0,1fr)] border-l border-[var(--rg-border)] bg-[var(--rg-editor)] shadow-2xl"
        >
          <div class="flex min-w-0 items-center justify-between gap-3 border-b border-black/40 bg-[var(--rg-editor-group)] px-3 font-mono text-[11px]">
            <div class="flex min-w-0 items-center gap-2">
              <span class="bg-[var(--rg-accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                {{ selectedCommit?.shortHash || diffPreview?.hash.slice(0, 8) || 'diff' }}
              </span>
              <span class="min-w-0 truncate text-[var(--rg-foreground)]" :title="diffPreview?.oldPath ? `${diffPreview.oldPath} → ${diffPreview.path}` : diffPreview?.path">
                {{ diffPreview?.oldPath ? `${diffPreview.oldPath} → ${diffPreview.path}` : diffPreview?.path || selectedCommitFilePath || 'Loading diff...' }}
              </span>
              <span v-if="diffPreview?.truncated" class="shrink-0 bg-[#f7b83d] px-1.5 py-0.5 text-[10px] font-bold text-[#2b2a27]">
                truncated
              </span>
            </div>
            <button
              type="button"
              class="grid h-6 w-6 shrink-0 place-items-center border border-[var(--rg-border)] bg-[var(--rg-input)] text-[14px] text-[var(--rg-foreground)] hover:border-[var(--rg-accent)]"
              title="Close Preview"
              @click="closeDiffPreview"
            >
              ×
            </button>
          </div>
          <div class="min-h-0 overflow-auto bg-[#1b1a18] font-mono text-[12px] leading-5">
            <p v-if="loadingDiffPreview" class="p-4 text-[#88857c]">Loading diff...</p>
            <p v-else-if="diffPreviewError" class="p-4 text-[#f03e5f]">{{ diffPreviewError }}</p>
            <div v-else-if="diffPreview?.binary" class="p-4 text-[#f7b83d]">
              Binary file
            </div>
            <div v-else-if="diffPreview">
              <div
                v-for="line in diffPreviewLines"
                :key="line.key"
                class="grid min-w-max grid-cols-[56px_56px_minmax(680px,1fr)] border-b border-black/10"
                :class="diffLineClass(line)"
              >
                <span class="select-none border-r border-black/20 px-2 text-right text-[#88857c]">{{ line.oldLine ?? '' }}</span>
                <span class="select-none border-r border-black/20 px-2 text-right text-[#88857c]">{{ line.newLine ?? '' }}</span>
                <span class="whitespace-pre px-3">{{ line.content || ' ' }}</span>
              </div>
            </div>
          </div>
        </section>

        <div
          v-if="gitContextMenu"
          ref="gitContextMenuEl"
          class="fixed z-50 min-w-[220px] border border-[var(--rg-border)] bg-[var(--rg-input)] py-1 text-[12px] text-[var(--rg-foreground)] shadow-2xl"
          :style="{ left: `${gitContextMenu.x}px`, top: `${gitContextMenu.y}px` }"
          role="menu"
          tabindex="-1"
          aria-label="Git actions"
          @click.stop
          @contextmenu.prevent.stop
          @keydown.esc.stop="closeGitContextMenu"
        >
          <template v-if="gitContextMenu.type === 'branch'">
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="checkoutRef(gitContextMenu.branch)">Checkout</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="createBranchFrom(gitContextMenu.commit.hash)">Create Branch from Here</button>
            <button v-if="!isRemoteBranch(gitContextMenu.branch)" class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="renameBranch(gitContextMenu.branch)">Rename</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="deleteBranch(gitContextMenu.branch, isRemoteBranch(gitContextMenu.branch))">Delete</button>
            <div class="my-1 border-t border-[var(--rg-border)]" />
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="mergeRef(gitContextMenu.branch)">Merge into Current</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="rebaseOnto(gitContextMenu.branch)">Rebase Current Onto</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="pushBranch(gitContextMenu.branch)">Push</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="pullBranch(gitContextMenu.branch)">Pull</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="fetchBranch(gitContextMenu.branch)">Fetch</button>
            <div class="my-1 border-t border-[var(--rg-border)]" />
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="copyText(gitContextMenu.branch)">Copy Branch Name</button>
          </template>

          <template v-else-if="gitContextMenu.type === 'commit'">
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="addTag(gitContextMenu.commit.hash)">Add Tag</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="createBranchFrom(gitContextMenu.commit.hash)">Create Branch</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="checkoutRef(gitContextMenu.commit.hash)">Checkout</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="cherryPickCommit(gitContextMenu.commit.hash)">Cherry Pick</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="revertCommit(gitContextMenu.commit.hash)">Revert</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="mergeRef(gitContextMenu.commit.hash)">Merge into Current</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="rebaseOnto(gitContextMenu.commit.hash)">Rebase Current Onto This Commit</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="resetToCommit(gitContextMenu.commit.hash)">Reset Current Branch to This Commit</button>
            <button
              v-if="selectedCommitHash && selectedCommitHash !== gitContextMenu.commit.hash"
              class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]"
              @click.stop="compareWithSelected(gitContextMenu.commit.hash)"
            >
              Compare with Selected Commit
            </button>
            <div class="my-1 border-t border-[var(--rg-border)]" />
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="copyText(gitContextMenu.commit.hash)">Copy Commit Hash</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="copyText(gitContextMenu.commit.subject)">Copy Commit Subject</button>
          </template>

          <template v-else-if="gitContextMenu.type === 'tag'">
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="copyText(gitContextMenu.tag)">Copy Tag Name</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="pushTag(gitContextMenu.tag)">Push Tag</button>
            <button class="block w-full px-3 py-1.5 text-left text-[#f03e5f] hover:bg-[var(--rg-editor-group)]" @click.stop="deleteTag(gitContextMenu.tag)">Delete Tag</button>
          </template>

          <template v-else-if="gitContextMenu.type === 'stash'">
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="applyStash(gitContextMenu.stash.index)">Apply</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="popStash(gitContextMenu.stash.index)">Pop</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="createBranchFromStash(gitContextMenu.stash.index)">Create Branch from Stash</button>
            <div class="my-1 border-t border-[var(--rg-border)]" />
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="copyText(stashName(gitContextMenu.stash.index))">Copy Stash Name</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="copyText(gitContextMenu.stash.hash)">Copy Stash Hash</button>
            <button class="block w-full px-3 py-1.5 text-left text-[#f03e5f] hover:bg-[var(--rg-editor-group)]" @click.stop="dropStash(gitContextMenu.stash.index)">Drop</button>
          </template>

          <template v-else>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="selectUncommittedChanges(); closeGitContextMenu()">Open Changes and Commit</button>
            <div class="my-1 border-t border-[var(--rg-border)]" />
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="fetchBranch()">Fetch All</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="stashWorkingTree">Stash Uncommitted Changes</button>
            <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="resetWorkingTree">Reset Working Tree</button>
            <button class="block w-full px-3 py-1.5 text-left text-[#f03e5f] hover:bg-[var(--rg-editor-group)]" @click.stop="cleanUntracked">Clean Untracked Files</button>
          </template>
        </div>
      </section>

      <footer
        class="grid min-w-0 items-center bg-[var(--rg-status)] px-2 font-mono text-[11px] text-white"
        :style="{ gridTemplateColumns: isMobile ? 'minmax(0,1fr) auto' : '304px minmax(0,1fr) 260px' }"
      >
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate">Rainglow</span>
          <select
            v-model="selectedThemeName"
            class="h-[18px] max-w-[190px] border border-white/30 bg-black/20 px-1 text-[11px] text-white outline-none"
          >
            <option
              v-for="theme in rainglowThemes"
              :key="theme.name"
              :value="theme.name"
              class="bg-[#262522] text-white"
            >
              {{ theme.name }}
            </option>
          </select>
        </div>
        <div v-show="!isMobile" class="truncate text-center">{{ sessionId || 'no session selected' }}</div>
        <div class="truncate text-right">{{ sessions.length }} conversations · {{ statusText }}</div>
      </footer>
    </section>

    <Transition name="splash">
      <div
        v-if="!appReady"
        class="fixed inset-0 z-[500] grid place-items-center bg-[var(--rg-terminal)]"
      >
        <div class="grid justify-items-center gap-3 font-mono">
          <span class="text-2xl font-bold tracking-[0.4em] text-[var(--rg-foreground)]">SPECCAT</span>
          <span class="flex items-center gap-2 text-[11px] text-[var(--rg-muted)]">
            <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--rg-accent)]" />
            starting terminal...
          </span>
        </div>
      </div>
    </Transition>

    <Teleport to="body">
      <div
        v-if="toasts.length"
        class="pointer-events-none fixed bottom-8 right-4 z-[300] flex w-[320px] flex-col gap-2"
        :style="themeVars"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex items-start gap-2 border bg-[var(--rg-editor)] px-3 py-2 font-mono text-[12px] shadow-2xl"
          :class="toastClass(toast.type)"
          role="status"
        >
          <span class="min-w-0 flex-1 whitespace-pre-wrap break-words">{{ toast.message }}</span>
          <button
            type="button"
            class="shrink-0 text-sm font-bold leading-none opacity-60 hover:opacity-100"
            aria-label="Dismiss notification"
            @click="dismissToast(toast.id)"
          >
            ×
          </button>
        </div>
      </div>

      <div
        v-if="showNewSessionModal"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
        :style="themeVars"
      >
        <form
          class="w-full max-w-md border border-[var(--rg-border)] bg-[var(--rg-editor)] text-xs text-[var(--rg-foreground)] shadow-2xl"
          @submit.prevent="createNewSession"
          @keydown.enter.exact="handleNewConversationEnter"
        >
          <div class="flex h-10 items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
            <span>New Conversation</span>
            <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="showNewSessionModal = false">×</button>
          </div>
          <div class="grid gap-4 p-4 font-mono text-xs">
            <p
              v-if="pendingFeatureAction"
              class="border border-[var(--rg-accent)]/60 bg-[var(--rg-accent)]/10 px-3 py-2 leading-5 text-[var(--rg-accent)]"
            >
              No conversation is on <span class="font-bold">{{ pendingFeatureAction.featureId }}</span>.
              Creating one, then running {{ pendingFeatureActionLabel }}.
            </p>
            <label class="grid gap-1.5">
              <span class="text-[var(--rg-muted)]">Base Branch</span>
              <select ref="newSessionBaseBranchRef" v-model="newSessionBaseBranch" class="h-9 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 outline-none focus:border-[var(--rg-accent)]">
                <option v-for="branch in sessionOptions.branches" :key="branch" :value="branch">{{ branch }}</option>
              </select>
            </label>
            <label class="grid gap-1.5">
              <span class="text-[var(--rg-muted)]">Provider</span>
              <select v-model="newSessionProvider" class="h-9 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 outline-none focus:border-[var(--rg-accent)]">
                <option v-for="provider in sessionOptions.providers" :key="provider.id" :value="provider.id">{{ provider.name }}</option>
              </select>
            </label>
            <p v-if="integrationError" class="text-[#f03e5f]">{{ integrationError }}</p>
            <p v-else class="text-[var(--rg-muted)]">The provider uses its own configured default model. Provider and base branch are fixed when the managed worktree is created.</p>
          </div>
          <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
            <button type="button" class="border border-[var(--rg-border)] px-3 py-1.5" @click="showNewSessionModal = false">Cancel</button>
            <button
              type="submit"
              class="bg-[var(--rg-button)] px-4 py-1.5 font-bold text-white disabled:opacity-40"
              :disabled="loadingSessionOptions || creatingSession || !newSessionBaseBranch"
            >
              {{ creatingSession ? 'Creating...' : 'Create' }}
            </button>
          </div>
        </form>
      </div>

      <div
        v-if="showSettingsModal"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
        :style="themeVars"
      >
        <form
          class="w-full max-w-md border border-[var(--rg-border)] bg-[var(--rg-editor)] text-xs text-[var(--rg-foreground)] shadow-2xl"
          @submit.prevent="showSettingsModal = false"
        >
          <div class="flex h-10 items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
            <span>Settings</span>
            <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="showSettingsModal = false">×</button>
          </div>
          <div class="grid gap-4 p-4 font-mono text-xs">
            <label class="grid gap-1.5">
              <span class="text-[var(--rg-muted)]">Default Provider</span>
              <select v-model="defaultProvider" class="h-9 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 outline-none focus:border-[var(--rg-accent)]">
                <option v-for="provider in settingsProviderOptions" :key="provider.id" :value="provider.id">{{ provider.name }}</option>
              </select>
              <span class="text-[var(--rg-muted)]">Pre-selected when you start a new conversation.</span>
            </label>
            <div class="flex items-center justify-between border-t border-[var(--rg-border)] pt-3 text-[var(--rg-muted)]">
              <span>Version</span>
              <span class="text-[var(--rg-foreground)]">v{{ appVersion }}</span>
            </div>
          </div>
          <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
            <button ref="settingsDoneRef" type="submit" class="bg-[var(--rg-button)] px-4 py-1.5 font-bold text-white">Done</button>
          </div>
        </form>
      </div>

      <div
        v-if="showWorktreesModal"
        class="fixed inset-0 z-[105] flex items-center justify-center bg-black/70 p-4"
        :style="themeVars"
      >
        <form class="w-full max-w-2xl border border-[var(--rg-border)] bg-[var(--rg-editor)] text-[var(--rg-foreground)] shadow-2xl" @submit.prevent="createWorktree">
          <div class="flex h-10 items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
            <span>Worktrees</span>
            <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="showWorktreesModal = false">×</button>
          </div>
          <div class="grid max-h-[60vh] gap-1 overflow-auto p-4 font-mono text-xs">
            <p v-if="loadingWorktrees" class="text-[var(--rg-muted)]">Loading worktrees...</p>
            <p v-else-if="!worktrees.length" class="text-[var(--rg-muted)]">No worktrees found.</p>
            <div
              v-for="worktree in worktrees"
              :key="worktree.path"
              class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 py-2"
            >
              <span class="min-w-0">
                <span class="flex min-w-0 items-center gap-2">
                  <span class="min-w-0 truncate font-bold" :title="worktree.path">{{ worktree.path }}</span>
                  <span v-if="worktree.isMain" class="shrink-0 border border-[var(--rg-accent)] px-1 text-[9px] font-bold uppercase text-[var(--rg-accent)]">main</span>
                  <span v-if="worktree.managed" class="shrink-0 border border-[var(--rg-border)] px-1 text-[9px] font-bold uppercase text-[var(--rg-muted)]">managed</span>
                  <span v-if="worktree.locked" class="shrink-0 border border-[#f7b83d] px-1 text-[9px] font-bold uppercase text-[#f7b83d]">locked</span>
                  <span v-if="worktree.prunable" class="shrink-0 border border-[#f03e5f] px-1 text-[9px] font-bold uppercase text-[#f03e5f]">prunable</span>
                </span>
                <span class="block truncate text-[10px] text-[var(--rg-muted)]">
                  {{ worktree.branch || 'detached' }} · {{ worktree.head.slice(0, 8) }}
                </span>
              </span>
              <button
                v-if="!worktree.isMain && worktree.managed"
                type="button"
                class="grid h-6 w-6 shrink-0 place-items-center border border-[var(--rg-border)] text-sm hover:border-[#f03e5f] hover:text-[#f03e5f] disabled:opacity-40"
                title="Remove worktree"
                :disabled="worktreeActionRunning"
                @click="removeWorktree(worktree)"
              >
                ×
              </button>
            </div>
          </div>
          <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
            <button type="button" class="border border-[var(--rg-border)] px-3 py-1.5 text-xs" @click="showWorktreesModal = false">Close</button>
            <button
              ref="worktreesCreateRef"
              type="submit"
              class="bg-[var(--rg-button)] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
              :disabled="worktreeActionRunning"
            >
              Create Worktree
            </button>
          </div>
        </form>
      </div>

      <!-- Spec viewer: the only place spec files are read. The browser column
           lists cards, a card opens this modal on the feature's documents. -->
      <div
        v-if="specViewerFeature"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
        :style="themeVars"
        @click.self="closeSpecViewer"
      >
        <div class="grid h-[94vh] w-[min(1100px,96vw)] grid-rows-[40px_auto_minmax(0,1fr)] border border-[var(--rg-border)] bg-[var(--rg-editor)] text-[var(--rg-foreground)] shadow-2xl">
          <div class="flex min-w-0 items-center justify-between gap-3 border-b border-[var(--rg-border)] bg-[var(--rg-editor-group)] px-4">
            <div class="flex min-w-0 items-center gap-2">
              <span class="shrink-0 bg-[var(--rg-accent)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">spec</span>
              <span class="min-w-0 truncate font-mono text-xs font-bold">{{ specViewerFeature.id }}</span>
              <span class="hidden min-w-0 truncate text-[11px] text-[var(--rg-muted)] sm:block">{{ specViewerFeature.name }}</span>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <button
                v-if="selectedSpecFile"
                type="button"
                class="h-6 border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 text-[10px] font-bold uppercase text-[var(--rg-foreground)] hover:border-[var(--rg-accent)] hover:text-[var(--rg-accent)] disabled:opacity-50"
                :disabled="loadingSpecContent"
                @click="startSpecEdit"
              >
                Edit
              </button>
              <button
                type="button"
                class="text-lg text-[var(--rg-muted)] hover:text-white"
                title="Close (Esc)"
                @click="closeSpecViewer"
              >
                ×
              </button>
            </div>
          </div>
          <div class="flex min-w-0 items-stretch overflow-x-auto border-b border-[var(--rg-border)] bg-[var(--rg-editor-group)]">
            <button
              v-for="file in specViewerFeature.files"
              :key="file.filename"
              type="button"
              class="shrink-0 border-b-2 px-4 py-2 text-[11px] font-mono"
              :class="selectedSpecFile?.filename === file.filename
                ? 'border-[var(--rg-accent)] bg-[var(--rg-editor)] text-[var(--rg-accent)]'
                : 'border-transparent text-[#a0988e] hover:text-[var(--rg-foreground)]'"
              :title="file.filename"
              @click="selectSpecFile(specViewerFeature.id, file)"
            >
              {{ file.label }}
            </button>
          </div>
          <div class="min-h-0 overflow-auto px-6 py-5 text-[13px] leading-6 text-[#c8bdaf]">
            <p v-if="!specViewerFeature.files.length" class="text-[#88857c]">This spec directory has no files.</p>
            <p v-else-if="loadingSpecContent" class="text-[#88857c]">Loading...</p>
            <!-- eslint-disable-next-line vue/no-v-html — sanitized via DOMPurify -->
            <div v-else-if="renderedSpecHtml" class="spec-markdown" v-html="renderedSpecHtml" />
            <pre v-else class="whitespace-pre-wrap break-words font-mono text-[12px]">{{ selectedSpecContent }}</pre>
          </div>
        </div>
      </div>

      <div
        v-if="showSpecEditModal && selectedSpecFile"
        class="fixed inset-0 z-[105] flex items-center justify-center bg-black/70 p-4"
        :style="themeVars"
      >
        <form
          class="grid h-[min(760px,90vh)] w-full max-w-3xl grid-rows-[40px_minmax(0,1fr)_auto] border border-[var(--rg-border)] bg-[var(--rg-editor)] text-[var(--rg-foreground)] shadow-2xl"
          @submit.prevent="saveSpecEdit"
          @keydown.enter.meta.prevent="saveSpecEdit"
          @keydown.enter.ctrl.prevent="saveSpecEdit"
        >
          <div class="flex items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
            <span class="truncate">Edit {{ selectedSpecFile.featureId }}/{{ selectedSpecFile.filename }}</span>
            <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="showSpecEditModal = false">×</button>
          </div>
          <textarea
            v-model="specEditContent"
            class="min-h-0 resize-none border-0 bg-[var(--rg-input)] p-4 font-mono text-[12px] leading-5 text-[var(--rg-foreground)] outline-none"
            spellcheck="false"
          />
          <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
            <button type="button" class="border border-[var(--rg-border)] px-3 py-1.5 text-xs" :disabled="savingSpec" @click="showSpecEditModal = false">Cancel</button>
            <button
              type="submit"
              class="bg-[var(--rg-button)] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
              :disabled="savingSpec"
            >
              {{ savingSpec ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      </div>

      <div
        v-if="showRemotesModal"
        class="fixed inset-0 z-[105] flex items-center justify-center bg-black/70 p-4"
        :style="themeVars"
      >
        <form class="w-full max-w-lg border border-[var(--rg-border)] bg-[var(--rg-editor)] text-[var(--rg-foreground)] shadow-2xl" @submit.prevent="addRemote">
          <div class="flex h-10 items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
            <span>Remotes</span>
            <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="showRemotesModal = false">×</button>
          </div>
          <div class="grid gap-1 p-4 font-mono text-xs">
            <p v-if="loadingRemotes" class="text-[var(--rg-muted)]">Loading remotes...</p>
            <p v-else-if="!remotes.length" class="text-[var(--rg-muted)]">No remotes configured.</p>
            <div
              v-for="remote in remotes"
              :key="remote.name"
              class="grid grid-cols-[90px_minmax(0,1fr)_auto] items-center gap-2 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 py-2"
            >
              <span class="truncate font-bold text-[var(--rg-accent)]">{{ remote.name }}</span>
              <span class="min-w-0">
                <span class="block truncate" :title="remote.fetchUrl">{{ remote.fetchUrl }}</span>
                <span
                  v-if="remote.pushUrl && remote.pushUrl !== remote.fetchUrl"
                  class="block truncate text-[10px] text-[var(--rg-muted)]"
                  :title="remote.pushUrl"
                >
                  push: {{ remote.pushUrl }}
                </span>
              </span>
              <span class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  class="grid h-6 w-6 place-items-center border border-[var(--rg-border)] text-[11px] hover:border-[var(--rg-accent)]"
                  title="Edit remote URL"
                  @click="editRemote(remote)"
                >
                  ✎
                </button>
                <button
                  type="button"
                  class="grid h-6 w-6 place-items-center border border-[var(--rg-border)] text-sm hover:border-[#f03e5f] hover:text-[#f03e5f]"
                  title="Delete remote"
                  @click="removeRemote(remote)"
                >
                  ×
                </button>
              </span>
            </div>
          </div>
          <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
            <button type="button" class="border border-[var(--rg-border)] px-3 py-1.5 text-xs" @click="showRemotesModal = false">Close</button>
            <button
              ref="remotesAddRef"
              type="submit"
              class="bg-[var(--rg-button)] px-4 py-1.5 text-xs font-bold text-white hover:brightness-110"
            >
              Add Remote
            </button>
          </div>
        </form>
      </div>

      <div
        v-if="gitDialog"
        class="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4"
        :style="themeVars"
      >
        <form
          class="w-full max-w-md border border-[var(--rg-border)] bg-[var(--rg-editor)] text-xs text-[var(--rg-foreground)] shadow-2xl"
          @submit.prevent="confirmGitDialog"
        >
          <div class="flex h-10 items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
            <span :class="gitDialog.danger ? 'text-[#f03e5f]' : ''">{{ gitDialog.title }}</span>
            <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="cancelGitDialog">×</button>
          </div>
          <div class="grid gap-4 p-4 font-mono text-xs">
            <p v-if="gitDialog.message" class="whitespace-pre-wrap text-[var(--rg-muted)]">{{ gitDialog.message }}</p>
            <template v-for="(field, index) in gitDialog.fields" :key="field.key">
              <label v-if="field.kind === 'text'" class="grid gap-1.5">
                <span class="text-[var(--rg-muted)]">{{ field.label }}</span>
                <input
                  v-model="field.value"
                  type="text"
                  class="h-9 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 outline-none focus:border-[var(--rg-accent)]"
                  :placeholder="field.placeholder || ''"
                  :autofocus="index === 0"
                >
              </label>
              <label v-else-if="field.kind === 'select'" class="grid gap-1.5">
                <span class="text-[var(--rg-muted)]">{{ field.label }}</span>
                <select
                  v-model="field.value"
                  class="h-9 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 outline-none focus:border-[var(--rg-accent)]"
                >
                  <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
              <label v-else class="flex items-center gap-2">
                <input v-model="field.value" type="checkbox" class="accent-[var(--rg-accent)]">
                <span>{{ field.label }}</span>
              </label>
            </template>
          </div>
          <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
            <button type="button" class="border border-[var(--rg-border)] px-3 py-1.5" @click="cancelGitDialog">Cancel</button>
            <button
              type="submit"
              class="px-4 py-1.5 font-bold text-white"
              :class="gitDialog.danger ? 'bg-[#ba0e2e] hover:brightness-110' : 'bg-[var(--rg-button)] hover:brightness-110'"
            >
              {{ gitDialog.confirmLabel }}
            </button>
          </div>
        </form>
      </div>

      <div
        v-if="showIntegrationModal"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
        :style="themeVars"
      >
        <form
          class="flex max-h-[85vh] w-full max-w-2xl flex-col border border-[var(--rg-border)] bg-[var(--rg-editor)] text-xs text-[var(--rg-foreground)] shadow-2xl"
          @submit.prevent="runSessionIntegration"
        >
          <div class="flex h-10 items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
            <span>{{ integrationMode === 'finalize' ? 'Finalize Conversation' : 'Rebase Worktree' }}</span>
            <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="showIntegrationModal = false">×</button>
          </div>
          <div class="grid min-h-0 gap-4 overflow-y-auto p-4 font-mono text-xs">
            <div class="grid grid-cols-[90px_minmax(0,1fr)] gap-2 text-[var(--rg-muted)]">
              <span>worktree</span><span class="truncate text-[var(--rg-accent)]">{{ activeSession?.worktreeBranch }}</span>
              <span>current base</span><span>{{ activeSession?.baseBranch }}</span>
            </div>
            <label class="grid gap-1.5">
              <span class="text-[var(--rg-muted)]">Target Base Branch</span>
              <select ref="integrationBaseBranchRef" v-model="integrationBaseBranch" class="h-9 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 outline-none focus:border-[var(--rg-accent)]">
                <option v-for="branch in sessionOptions.branches" :key="branch" :value="branch">{{ branch }}</option>
              </select>
            </label>
            <label v-if="integrationMode === 'finalize'" class="grid gap-1.5">
              <span class="flex items-center justify-between gap-2">
                <span class="text-[var(--rg-muted)]">Squash Commit Message</span>
                <button
                  type="button"
                  class="shrink-0 border border-[var(--rg-border)] px-2 py-0.5 text-[10px] font-bold text-[var(--rg-foreground)] hover:border-[var(--rg-accent)] disabled:opacity-40"
                  :disabled="generatingCommitMessage || integrationRunning"
                  title="Draft the message from the merge-base diff using the conversation's provider"
                  @click="generateCommitMessage"
                >
                  {{ generatingCommitMessage ? 'Generating...' : 'AI Generate' }}
                </button>
              </span>
              <textarea v-model="integrationCommitMessage" rows="8" class="border border-[var(--rg-border)] bg-[var(--rg-input)] p-3 outline-none focus:border-[var(--rg-accent)]" :disabled="generatingCommitMessage" />
            </label>
            <div v-if="generatingCommitMessage || commitQueryScreen" class="grid gap-1.5">
              <span class="text-[var(--rg-muted)]">Provider terminal (live)</span>
              <pre class="max-h-72 overflow-auto whitespace-pre border border-[var(--rg-border)] bg-black/50 p-3 text-[10px] leading-4 text-[var(--rg-foreground)]">{{ commitQueryScreen || 'Starting the provider CLI...' }}</pre>
            </div>
            <p v-if="previewError" class="whitespace-pre-wrap text-[#f03e5f]">{{ previewError }}</p>
            <p v-if="integrationError" class="whitespace-pre-wrap text-[#f03e5f]">{{ integrationError }}</p>
            <p v-else-if="integrationMode === 'finalize'" class="text-[var(--rg-muted)]">Commits will be rebased and squashed, the target branch will be fast-forwarded, then the tmux session and worktree will be removed.</p>
            <p v-else class="text-[var(--rg-muted)]">The worktree remains active after rebase so the conversation can continue.</p>
          </div>
          <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
            <button type="button" class="border border-[var(--rg-border)] px-3 py-1.5" :disabled="integrationRunning" @click="showIntegrationModal = false">Cancel</button>
            <button
              type="submit"
              class="bg-[var(--rg-button)] px-4 py-1.5 font-bold text-white disabled:opacity-40"
              :disabled="integrationRunning || !integrationBaseBranch || (integrationMode === 'finalize' && !integrationCommitMessage.trim())"
            >
              {{ integrationRunning ? 'Working...' : integrationMode === 'finalize' ? 'Finalize' : 'Rebase' }}
            </button>
          </div>
        </form>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="showConflictReport"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
        :style="themeVars"
      >
        <form class="flex max-h-[80vh] w-full max-w-lg flex-col border border-[var(--rg-border)] bg-[var(--rg-editor)] text-xs text-[var(--rg-foreground)] shadow-2xl" @submit.prevent="showConflictReport = false">
          <div class="flex h-10 items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
            <span>Conflict Resolution Report</span>
            <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="showConflictReport = false">×</button>
          </div>
          <div class="overflow-auto p-4">
            <p class="mb-3 text-[var(--rg-muted)]">Rebase conflicts were resolved automatically by the conversation's agent. This report is shown once and not stored.</p>
            <pre class="whitespace-pre-wrap break-words font-mono text-[var(--rg-foreground)]">{{ conflictReport }}</pre>
          </div>
          <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
            <button ref="conflictCloseRef" type="submit" class="bg-[var(--rg-button)] px-4 py-1.5 font-bold text-white">Close</button>
          </div>
        </form>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
.splash-leave-active {
  transition: opacity 0.25s ease;
}

.splash-leave-to {
  opacity: 0;
}

.spec-markdown {
  word-break: break-word;
}

.spec-markdown :deep(h1),
.spec-markdown :deep(h2),
.spec-markdown :deep(h3),
.spec-markdown :deep(h4) {
  margin: 10px 0 4px;
  font-weight: 700;
  color: var(--rg-foreground);
}

.spec-markdown :deep(h1) {
  font-size: 13px;
  color: var(--rg-accent);
}

.spec-markdown :deep(h2) {
  font-size: 12px;
  color: var(--rg-accent);
}

.spec-markdown :deep(h3),
.spec-markdown :deep(h4) {
  font-size: 11px;
}

.spec-markdown :deep(p) {
  margin: 4px 0;
}

.spec-markdown :deep(ul),
.spec-markdown :deep(ol) {
  margin: 4px 0;
  padding-left: 16px;
  list-style: disc;
}

.spec-markdown :deep(ol) {
  list-style: decimal;
}

.spec-markdown :deep(li) {
  margin: 2px 0;
}

.spec-markdown :deep(code) {
  padding: 0 3px;
  background: rgba(0, 0, 0, 0.3);
  color: var(--rg-accent);
}

.spec-markdown :deep(pre) {
  margin: 6px 0;
  padding: 6px 8px;
  overflow-x: auto;
  background: rgba(0, 0, 0, 0.3);
}

.spec-markdown :deep(pre code) {
  padding: 0;
  background: none;
  color: inherit;
}

.spec-markdown :deep(blockquote) {
  margin: 4px 0;
  padding-left: 8px;
  border-left: 2px solid var(--rg-border);
  color: var(--rg-muted);
}

.spec-markdown :deep(table) {
  margin: 6px 0;
  border-collapse: collapse;
}

.spec-markdown :deep(th),
.spec-markdown :deep(td) {
  padding: 2px 6px;
  border: 1px solid var(--rg-border);
}

.spec-markdown :deep(a) {
  color: var(--rg-accent);
  text-decoration: underline;
}

.spec-markdown :deep(hr) {
  margin: 8px 0;
  border-color: var(--rg-border);
}

.spec-markdown :deep(input[type='checkbox']) {
  margin-right: 4px;
}
</style>
