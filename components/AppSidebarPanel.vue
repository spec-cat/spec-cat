<script setup lang="ts">
import type { SessionListItem } from '~/types/session'
import type { ShellSessionInfo } from '~/types/app'
import { formatRuntimeState } from '~/utils/app-formatters'

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

          <AppConversationList
            v-if="activeSidebarPanel === 'conversations'"
            :search-query="conversationSearchQuery"
            :limit-warning="conversationLimitWarning"
            :sessions="sessions"
            :filtered-sessions="filteredSessions"
            :loading="loadingSessions"
            :active-id="sessionId"
            :editing-id="editingSessionId"
            :editing-title="editingSessionTitle"
            :archiving-id="archivingSessionId"
            :archives-expanded="showArchivedSessions"
            :archived-sessions="archivedSessions"
            :filtered-archived-sessions="filteredArchivedSessions"
            :loading-archives="loadingArchived"
            :selected-archive-id="selectedArchivedSessionId"
            :restoring-id="restoringSessionId"
            :deleting-id="deletingSessionId"
            :session-display-name="sessionDisplayName"
            @update:search-query="conversationSearchQuery = $event"
            @update:editing-title="editingSessionTitle = $event"
            @select="selectSession"
            @save-rename="saveSessionRename"
            @cancel-rename="cancelSessionRename"
            @start-rename="startSessionRename"
            @archive="archiveSession"
            @copy="copyText"
            @toggle-archives="toggleArchivedSessions"
            @delete-all-archives="deleteAllArchivedSessions"
            @select-archive="selectArchivedSession"
            @restore-archive="restoreArchivedSession"
            @delete-archive="deleteArchivedSession"
          />
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
