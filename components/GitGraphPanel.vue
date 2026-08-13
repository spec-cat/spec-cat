<script setup lang="ts">
import type { GitBranch, GitCommit, GitCommitFile, GitCompareResponse, GitGraphResponse, GitStash, GraphRowData, CommitFileTreeRow } from '~/types/app'
import { GRAPH_NODE_RADIUS, GRAPH_ROW_HEIGHT, graphLaneX, graphSegmentPath } from '~/utils/git-graph'
import { formatCommitDate, stashName } from '~/utils/app-formatters'

type GraphSettings = {
  style: 'rounded' | 'angular'
  muteNonHead: boolean
  showAuthor: boolean
  showDate: boolean
}

type RemoteBranchGroup = { remote: string; branches: GitBranch[] }
type GroupedBranch = { displayName: string; originalBranches: string[]; isLocal: boolean }

const props = defineProps<{
  mobile: boolean
  pinned: boolean
  graph: GitGraphResponse | null
  loading: boolean
  error: string
  search: string
  findIndex: number
  findMatches: GitCommit[]
  findMatchSet: Set<string>
  branchFilter: string[]
  showBranchDropdown: boolean
  showSettingsDropdown: boolean
  graphSettings: GraphSettings
  localBranches: GitBranch[]
  remoteBranchGroups: RemoteBranchGroup[]
  workingDirectory: string
  currentBranches: GitBranch[]
  showFeatureLegend: boolean
  previewLineSet: Set<string>
  featureLineSet: Set<string>
  selectedUncommittedChanges: boolean
  selectedCommitHash: string
  selectedCommit: GitCommit | null
  graphRows: Map<string, GraphRowData>
  mergeBaseSet: Set<string>
  graphColumnWidth: number
  selectedCommitFiles: GitCommitFile[]
  selectedCommitFilePath: string
  loadingCommitFiles: boolean
  commitFilesError: string
  commitFileTreeRows: CommitFileTreeRow[]
  commitFileViewMode: 'flat' | 'tree'
  compareView: GitCompareResponse | null
  loadingCompare: boolean
  gitCommitMessage: string
  gitActionRunning: boolean
  isMutedCommit: (hash: string) => boolean
  groupedBranchesFor: (commit: GitCommit) => GroupedBranch[]
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:showBranchDropdown': [value: boolean]
  'update:showSettingsDropdown': [value: boolean]
  'update:graphSettings': [value: GraphSettings]
  'update:commitFileViewMode': [value: 'flat' | 'tree']
  'update:gitCommitMessage': [value: string]
  openWorktreesModal: []
  toggleGitGraphPinned: []
  clearGraphBranchFilter: []
  toggleGraphBranchFilter: [name: string]
  goToGraphFindMatch: [direction: 1 | -1]
  refreshGitGraph: []
  openRemotesModal: []
  handleGraphListScroll: [event: Event]
  openWorkingTreeContextMenu: [event: MouseEvent | KeyboardEvent]
  selectUncommittedChanges: []
  openStashContextMenu: [event: MouseEvent | KeyboardEvent, stash: GitStash]
  selectCommit: [hash: string]
  openCommitContextMenu: [event: MouseEvent | KeyboardEvent, commit: GitCommit]
  openBranchContextMenu: [event: MouseEvent, commit: GitCommit, branch: string]
  openTagContextMenu: [event: MouseEvent, commit: GitCommit, tag: string]
  unstageFiles: [files?: string[]]
  stageFiles: [files?: string[]]
  commitStagedChanges: []
  closeCompareView: []
  refreshSelectedCommitFiles: []
  toggleCommitFileViewMode: []
  toggleFileFolder: [path: string]
  openDiffPreview: [file: GitCommitFile]
}>()

const searchModel = computed({
  get: () => props.search,
  set: (value: string) => emit('update:search', value)
})

const gitCommitMessageModel = computed({
  get: () => props.gitCommitMessage,
  set: (value: string) => emit('update:gitCommitMessage', value)
})

function updateGraphSetting<K extends keyof GraphSettings>(key: K, value: GraphSettings[K]) {
  emit('update:graphSettings', { ...props.graphSettings, [key]: value })
}

const isMobile = computed(() => props.mobile)
const gitGraphPinned = computed(() => props.pinned)
const gitGraph = computed(() => props.graph)
const loadingGitGraph = computed(() => props.loading)
const gitGraphError = computed(() => props.error)
const gitGraphSearch = searchModel
const graphFindIndex = computed(() => props.findIndex)
const graphFindMatches = computed(() => props.findMatches)
const graphFindMatchSet = computed(() => props.findMatchSet)
const graphBranchFilter = computed(() => props.branchFilter)
const showGraphBranchDropdown = computed({
  get: () => props.showBranchDropdown,
  set: (value: boolean) => emit('update:showBranchDropdown', value)
})
const showGraphSettingsDropdown = computed({
  get: () => props.showSettingsDropdown,
  set: (value: boolean) => emit('update:showSettingsDropdown', value)
})
const graphSettings = computed(() => props.graphSettings)
const localGraphBranches = computed(() => props.localBranches)
const remoteGraphBranchGroups = computed(() => props.remoteBranchGroups)
const graphWorkingDirectory = computed(() => props.workingDirectory)
const currentBranches = computed(() => props.currentBranches)
const showFeatureLegend = computed(() => props.showFeatureLegend)
const previewLineSet = computed(() => props.previewLineSet)
const featureLineSet = computed(() => props.featureLineSet)
const selectedUncommittedChanges = computed(() => props.selectedUncommittedChanges)
const selectedCommitHash = computed(() => props.selectedCommitHash)
const selectedCommit = computed(() => props.selectedCommit)
const graphRows = computed(() => props.graphRows)
const mergeBaseSet = computed(() => props.mergeBaseSet)
const gitGraphColumnWidth = computed(() => props.graphColumnWidth)
const selectedCommitFiles = computed(() => props.selectedCommitFiles)
const selectedCommitFilePath = computed(() => props.selectedCommitFilePath)
const loadingCommitFiles = computed(() => props.loadingCommitFiles)
const commitFilesError = computed(() => props.commitFilesError)
const commitFileTreeRows = computed(() => props.commitFileTreeRows)
const commitFileViewMode = computed({
  get: () => props.commitFileViewMode,
  set: (value: 'flat' | 'tree') => emit('update:commitFileViewMode', value)
})
const compareView = computed(() => props.compareView)
const loadingCompare = computed(() => props.loadingCompare)
const gitCommitMessage = gitCommitMessageModel
const gitActionRunning = computed(() => props.gitActionRunning)

function openWorktreesModal() { emit('openWorktreesModal') }
function toggleGitGraphPinned() { emit('toggleGitGraphPinned') }
function clearGraphBranchFilter() { emit('clearGraphBranchFilter') }
function toggleGraphBranchFilter(name: string) { emit('toggleGraphBranchFilter', name) }
function goToGraphFindMatch(direction: 1 | -1) { emit('goToGraphFindMatch', direction) }
function refreshGitGraph() { emit('refreshGitGraph') }
function openRemotesModal() { emit('openRemotesModal') }
function handleGraphListScroll(event: Event) { emit('handleGraphListScroll', event) }
function openWorkingTreeContextMenu(event: MouseEvent | KeyboardEvent) { emit('openWorkingTreeContextMenu', event) }
function selectUncommittedChanges() { emit('selectUncommittedChanges') }
function openStashContextMenu(event: MouseEvent | KeyboardEvent, stash: GitStash) {
  emit('openStashContextMenu', event, stash)
}
function selectCommit(hash: string) { emit('selectCommit', hash) }
function openCommitContextMenu(event: MouseEvent | KeyboardEvent, commit: GitCommit) { emit('openCommitContextMenu', event, commit) }
function openBranchContextMenu(event: MouseEvent, commit: GitCommit, branch: string) { emit('openBranchContextMenu', event, commit, branch) }
function openTagContextMenu(event: MouseEvent, commit: GitCommit, tag: string) { emit('openTagContextMenu', event, commit, tag) }
function unstageFiles(files?: string[]) { emit('unstageFiles', files) }
function stageFiles(files?: string[]) { emit('stageFiles', files) }
function commitStagedChanges() { emit('commitStagedChanges') }
function closeCompareView() { emit('closeCompareView') }
function refreshSelectedCommitFiles() { emit('refreshSelectedCommitFiles') }
function toggleCommitFileViewMode() { emit('toggleCommitFileViewMode') }
function toggleFileFolder(path: string) { emit('toggleFileFolder', path) }
function openDiffPreview(file: GitCommitFile) { emit('openDiffPreview', file) }
const isMutedCommit = (hash: string) => props.isMutedCommit(hash)
const groupedBranchesFor = (commit: GitCommit) => props.groupedBranchesFor(commit)
</script>

<template>
        <aside
          class="brick-git grid min-h-0 min-w-0 overflow-hidden border-r border-black/40 bg-[var(--rg-sidebar)]"
          style="grid-template-rows: 35px 44px minmax(0, 1fr) minmax(280px, 50%);"
          :class="isMobile
            ? 'absolute inset-y-0 left-12 right-0 z-20 shadow-2xl'
            : gitGraphPinned
              ? 'relative'
              : 'absolute bottom-0 right-0 top-0 z-20 w-[min(840px,calc(100vw-48px))] shadow-2xl'"
        >
          <GitGraphToolbar
            v-model:search="gitGraphSearch"
            v-model:show-branch-dropdown="showGraphBranchDropdown"
            v-model:show-settings-dropdown="showGraphSettingsDropdown"
            :pinned="gitGraphPinned"
            :loading="loadingGitGraph"
            :find-index="graphFindIndex"
            :find-matches="graphFindMatches"
            :branch-filter="graphBranchFilter"
            :graph-settings="graphSettings"
            :local-branches="localGraphBranches"
            :remote-branch-groups="remoteGraphBranchGroups"
            @update:graph-settings="emit('update:graphSettings', $event)"
            @open-worktrees-modal="openWorktreesModal"
            @toggle-git-graph-pinned="toggleGitGraphPinned"
            @clear-graph-branch-filter="clearGraphBranchFilter"
            @toggle-graph-branch-filter="toggleGraphBranchFilter"
            @go-to-graph-find-match="goToGraphFindMatch"
            @refresh-git-graph="refreshGitGraph"
            @open-remotes-modal="openRemotesModal"
          />

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

</template>
