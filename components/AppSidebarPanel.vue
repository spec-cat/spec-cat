<script setup lang="ts">
import type { SessionListItem } from '~/server/utils/session-store'
import type { ShellSessionInfo } from '~/types/app'
import { formatBytes, formatRuntimeState, formatSessionTime, runtimeStateClass } from '~/utils/app-formatters'

const props = defineProps<{
  collapsed: boolean
  mobile: boolean
  activeSidebarPanel: 'conversations' | 'terminal'
  conversationSearchQuery: string
  conversationLimitWarning: string
  sessions: SessionListItem[]
  filteredSessions: SessionListItem[]
  loadingSessions: boolean
  sessionId: string
  editingSessionId: string
  editingSessionTitle: string
  archivingSessionId: string
  showArchivedSessions: boolean
  archivedSessions: SessionListItem[]
  filteredArchivedSessions: SessionListItem[]
  loadingArchived: boolean
  selectedArchivedSessionId: string
  restoringSessionId: string
  deletingSessionId: string
  shells: ShellSessionInfo[]
  loadingShells: boolean
  creatingShell: boolean
  activeShellId: string
  statusText: string
  activeSession: SessionListItem | undefined
  sessionDisplayName: (session: SessionListItem) => string
}>()

const emit = defineEmits<{
  'update:conversationSearchQuery': [value: string]
  'update:editingSessionTitle': [value: string]
  openNewSessionModal: []
  refreshSessions: []
  refreshShells: []
  selectSession: [id: string]
  saveSessionRename: []
  cancelSessionRename: []
  startSessionRename: [session: SessionListItem]
  archiveSession: [session: SessionListItem]
  copyText: [value: string]
  toggleArchivedSessions: []
  deleteAllArchivedSessions: []
  selectArchivedSession: [session: SessionListItem]
  restoreArchivedSession: [session: SessionListItem]
  deleteArchivedSession: [session: SessionListItem]
  createShell: []
  selectShell: [id: string]
  killShell: [id: string]
}>()

const sidebarCollapsed = computed(() => props.collapsed)
const isMobile = computed(() => props.mobile)
const activeSidebarPanel = computed(() => props.activeSidebarPanel)
const conversationSearchQuery = computed({
  get: () => props.conversationSearchQuery,
  set: (value: string) => emit('update:conversationSearchQuery', value)
})
const editingSessionTitle = computed({
  get: () => props.editingSessionTitle,
  set: (value: string) => emit('update:editingSessionTitle', value)
})
const conversationLimitWarning = computed(() => props.conversationLimitWarning)
const sessions = computed(() => props.sessions)
const filteredSessions = computed(() => props.filteredSessions)
const loadingSessions = computed(() => props.loadingSessions)
const sessionId = computed(() => props.sessionId)
const editingSessionId = computed(() => props.editingSessionId)
const archivingSessionId = computed(() => props.archivingSessionId)
const showArchivedSessions = computed(() => props.showArchivedSessions)
const archivedSessions = computed(() => props.archivedSessions)
const filteredArchivedSessions = computed(() => props.filteredArchivedSessions)
const loadingArchived = computed(() => props.loadingArchived)
const selectedArchivedSessionId = computed(() => props.selectedArchivedSessionId)
const restoringSessionId = computed(() => props.restoringSessionId)
const deletingSessionId = computed(() => props.deletingSessionId)
const shells = computed(() => props.shells)
const loadingShells = computed(() => props.loadingShells)
const creatingShell = computed(() => props.creatingShell)
const activeShellId = computed(() => props.activeShellId)
const statusText = computed(() => props.statusText)
const activeSession = computed(() => props.activeSession)

const sessionDisplayName = (session: SessionListItem) => props.sessionDisplayName(session)
function openNewSessionModal() { emit('openNewSessionModal') }
function refreshSessions() { emit('refreshSessions') }
function refreshShells() { emit('refreshShells') }
function selectSession(id: string) { emit('selectSession', id) }
function saveSessionRename() { emit('saveSessionRename') }
function cancelSessionRename() { emit('cancelSessionRename') }
function startSessionRename(session: SessionListItem) { emit('startSessionRename', session) }
function archiveSession(session: SessionListItem) { emit('archiveSession', session) }
function copyText(value: string) { emit('copyText', value) }
function toggleArchivedSessions() { emit('toggleArchivedSessions') }
function deleteAllArchivedSessions() { emit('deleteAllArchivedSessions') }
function selectArchivedSession(session: SessionListItem) { emit('selectArchivedSession', session) }
function restoreArchivedSession(session: SessionListItem) { emit('restoreArchivedSession', session) }
function deleteArchivedSession(session: SessionListItem) { emit('deleteArchivedSession', session) }
function createShell() { emit('createShell') }
function selectShell(id: string) { emit('selectShell', id) }
function killShell(id: string) { emit('killShell', id) }
</script>

<template>
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

</template>
