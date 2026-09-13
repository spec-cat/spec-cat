<script setup lang="ts">
import type { GitBranch, GitCommit, GitCommitFile, GitCompareResponse, GitGraphResponse, GitStash, GraphRowData, CommitFileTreeRow } from '~/types/app'
import { GRAPH_NODE_RADIUS, GRAPH_ROW_HEIGHT, graphLaneX } from '~/utils/git-graph'
import { stashName } from '~/utils/app-formatters'

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

            <GitGraphCommitRow
              v-for="commit in gitGraph?.commits || []"
              :key="commit.hash"
              :commit="commit"
              :row="graphRows.get(commit.hash)"
              :column-width="gitGraphColumnWidth"
              :selected="selectedCommitHash === commit.hash"
              :find-match="graphFindMatchSet.has(commit.hash)"
              :preview-line="previewLineSet.has(commit.hash)"
              :feature-line="featureLineSet.has(commit.hash)"
              :muted="isMutedCommit(commit.hash)"
              :merge-base="mergeBaseSet.has(commit.hash)"
              :grouped-branches="groupedBranchesFor(commit)"
              :show-author="graphSettings.showAuthor"
              :show-date="graphSettings.showDate"
              @select="selectCommit"
              @context-menu="openCommitContextMenu"
              @branch-context-menu="openBranchContextMenu"
              @tag-context-menu="openTagContextMenu"
            />
          </div>

          <GitGraphDetailsPanel
            v-model:commit-file-view-mode="commitFileViewMode"
            v-model:git-commit-message="gitCommitMessage"
            :graph="gitGraph"
            :selected-uncommitted-changes="selectedUncommittedChanges"
            :compare-view="compareView"
            :loading-compare="loadingCompare"
            :selected-commit="selectedCommit"
            :selected-commit-files="selectedCommitFiles"
            :selected-commit-file-path="selectedCommitFilePath"
            :loading-commit-files="loadingCommitFiles"
            :commit-files-error="commitFilesError"
            :commit-file-tree-rows="commitFileTreeRows"
            :git-action-running="gitActionRunning"
            @unstage-files="unstageFiles"
            @stage-files="stageFiles"
            @commit-staged-changes="commitStagedChanges"
            @close-compare-view="closeCompareView"
            @refresh-selected-commit-files="refreshSelectedCommitFiles"
            @toggle-commit-file-view-mode="toggleCommitFileViewMode"
            @toggle-file-folder="toggleFileFolder"
            @open-diff-preview="openDiffPreview"
          />
        </aside>

</template>
