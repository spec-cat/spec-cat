<script setup lang="ts">
import type { GitBranch, GitCommit } from '~/types/app'

type GraphSettings = {
  style: 'rounded' | 'angular'
  muteNonHead: boolean
  showAuthor: boolean
  showDate: boolean
}

const props = defineProps<{
  pinned: boolean
  loading: boolean
  search: string
  findIndex: number
  findMatches: GitCommit[]
  branchFilter: string[]
  showBranchDropdown: boolean
  showSettingsDropdown: boolean
  graphSettings: GraphSettings
  localBranches: GitBranch[]
  remoteBranchGroups: Array<{ remote: string; branches: GitBranch[] }>
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:showBranchDropdown': [value: boolean]
  'update:showSettingsDropdown': [value: boolean]
  'update:graphSettings': [value: GraphSettings]
  openWorktreesModal: []
  toggleGitGraphPinned: []
  clearGraphBranchFilter: []
  toggleGraphBranchFilter: [name: string]
  goToGraphFindMatch: [direction: 1 | -1]
  refreshGitGraph: []
  openRemotesModal: []
}>()

const gitGraphSearch = computed({ get: () => props.search, set: (value) => emit('update:search', value) })
const showGraphBranchDropdown = computed({ get: () => props.showBranchDropdown, set: (value) => emit('update:showBranchDropdown', value) })
const showGraphSettingsDropdown = computed({ get: () => props.showSettingsDropdown, set: (value) => emit('update:showSettingsDropdown', value) })
const gitGraphPinned = computed(() => props.pinned)
const loadingGitGraph = computed(() => props.loading)
const graphFindIndex = computed(() => props.findIndex)
const graphFindMatches = computed(() => props.findMatches)
const graphBranchFilter = computed(() => props.branchFilter)
const graphSettings = computed(() => props.graphSettings)
const localGraphBranches = computed(() => props.localBranches)
const remoteGraphBranchGroups = computed(() => props.remoteBranchGroups)
function updateGraphSetting<K extends keyof GraphSettings>(key: K, value: GraphSettings[K]) { emit('update:graphSettings', { ...props.graphSettings, [key]: value }) }
const openWorktreesModal = () => emit('openWorktreesModal')
const toggleGitGraphPinned = () => emit('toggleGitGraphPinned')
const clearGraphBranchFilter = () => emit('clearGraphBranchFilter')
const toggleGraphBranchFilter = (name: string) => emit('toggleGraphBranchFilter', name)
const goToGraphFindMatch = (direction: 1 | -1) => emit('goToGraphFindMatch', direction)
const refreshGitGraph = () => emit('refreshGitGraph')
const openRemotesModal = () => emit('openRemotesModal')
</script>

<template>
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
              <input
                :checked="graphSettings.style === 'rounded'"
                type="radio"
                value="rounded"
                class="accent-[var(--rg-accent)]"
                @change="updateGraphSetting('style', 'rounded')"
              >
              <span>Rounded connections</span>
            </label>
            <label class="flex w-full cursor-pointer items-center gap-2 px-3 py-1 hover:bg-[var(--rg-editor-group)]">
              <input
                :checked="graphSettings.style === 'angular'"
                type="radio"
                value="angular"
                class="accent-[var(--rg-accent)]"
                @change="updateGraphSetting('style', 'angular')"
              >
              <span>Angular connections</span>
            </label>
            <div class="my-1 border-t border-[var(--rg-border)]" />
            <label class="flex w-full cursor-pointer items-center gap-2 px-3 py-1 hover:bg-[var(--rg-editor-group)]">
              <input
                :checked="graphSettings.muteNonHead"
                type="checkbox"
                class="accent-[var(--rg-accent)]"
                @change="updateGraphSetting('muteNonHead', ($event.target as HTMLInputElement).checked)"
              >
              <span>Mute commits not ancestors of HEAD</span>
            </label>
            <div class="my-1 border-t border-[var(--rg-border)]" />
            <div class="px-3 py-1 text-[10px] font-bold uppercase text-[var(--rg-muted)]">Columns</div>
            <label class="flex w-full cursor-pointer items-center gap-2 px-3 py-1 hover:bg-[var(--rg-editor-group)]">
              <input
                :checked="graphSettings.showAuthor"
                type="checkbox"
                class="accent-[var(--rg-accent)]"
                @change="updateGraphSetting('showAuthor', ($event.target as HTMLInputElement).checked)"
              >
              <span>Author</span>
            </label>
            <label class="flex w-full cursor-pointer items-center gap-2 px-3 py-1 hover:bg-[var(--rg-editor-group)]">
              <input
                :checked="graphSettings.showDate"
                type="checkbox"
                class="accent-[var(--rg-accent)]"
                @change="updateGraphSetting('showDate', ($event.target as HTMLInputElement).checked)"
              >
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
</template>
