<script setup lang="ts">
import type { SessionListItem } from '~/server/utils/session-store'
import type { GitCommit, GitContextMenu, GitDialogField, GitStash, GitWorkspaceExpose, ToastType } from '~/types/app'
import { diffLineClass } from '~/utils/git-graph'
import { extractFetchError } from '~/utils/fetch-error'

const props = defineProps<{
  activeSession?: SessionListItem
  previewingSession: SessionListItem | null
  mobile: boolean
  pinned: boolean
  themeVars: Record<string, string>
  openDialog: (options: { title: string; message?: string; danger?: boolean; confirmLabel?: string; fields?: GitDialogField[] }) => Promise<Record<string, string | boolean> | null>
  pushToast: (type: ToastType, message: string, duration?: number) => void
  writeClipboard: (value: string) => Promise<boolean>
}>()

const emit = defineEmits<{ 'update:pinned': [value: boolean] }>()
const cwd = computed(() => props.activeSession?.projectDir || '')
const activeSessionRef = computed(() => props.activeSession)
const previewingSessionRef = computed(() => props.previewingSession)
const graphSettings = ref({ style: 'rounded' as 'rounded' | 'angular', muteNonHead: false, showAuthor: true, showDate: true })
const gitCommitMessage = ref('')
const gitActionRunning = ref(false)
const gitActionMessage = ref('')
const gitContextMenu = ref<GitContextMenu | null>(null)
const gitContextMenuEl = ref<{ focus: () => void } | null>(null)
const worktreesModalRef = ref<{ focusCreate: () => void } | null>(null)
const remotesModalRef = ref<{ focusAdd: () => void } | null>(null)

const repository = useGitRepository({
  cwd,
  selectedCommit: () => model.selectedCommit.value,
  graphFindMatches: () => model.graphFindMatches.value,
  gitActionRunning,
  pushToast: props.pushToast,
  closeContextMenu
})
const model = useGitGraphModel({
  gitGraph: repository.gitGraph,
  graphSettings,
  gitGraphSearch: repository.gitGraphSearch,
  selectedCommitHash: repository.selectedCommitHash,
  selectedCommitFiles: repository.selectedCommitFiles,
  diffPreview: repository.diffPreview,
  activeSession: activeSessionRef,
  previewingSession: previewingSessionRef
})

async function runAction(action: string, payload: Record<string, unknown> = {}) {
  if (gitActionRunning.value) return false
  gitActionRunning.value = true
  gitActionMessage.value = ''
  closeContextMenu()
  try {
    await $fetch('/api/git/action', { method: 'POST', body: { cwd: cwd.value || undefined, action, ...payload } })
    await repository.refreshGitGraph()
    return true
  } catch (error) {
    const message = extractFetchError(error)
    gitActionMessage.value = message
    props.pushToast('error', message, 6000)
    return false
  } finally { gitActionRunning.value = false }
}

const actions = useGitActions({
  gitCommitMessage,
  selectedUncommittedChanges: repository.selectedUncommittedChanges,
  openDialog: props.openDialog,
  runAction
})
const workspace = useGitWorkspaceManagement({
  cwd,
  openDialog: props.openDialog,
  runAction,
  pushToast: props.pushToast,
  focusWorktreeCreate: () => worktreesModalRef.value?.focusCreate(),
  focusRemoteAdd: () => remotesModalRef.value?.focusAdd()
})

function menuPosition(event: MouseEvent | KeyboardEvent) {
  if (event instanceof MouseEvent) return { x: event.clientX, y: event.clientY }
  const rect = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : { left: 0, bottom: 0 }
  return { x: rect.left, y: rect.bottom }
}
const isMenuKey = (event: KeyboardEvent) => event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')
const focusMenu = () => requestAnimationFrame(() => gitContextMenuEl.value?.focus())
function openCommitMenu(event: MouseEvent | KeyboardEvent, commit: GitCommit) {
  if (event instanceof KeyboardEvent && !isMenuKey(event)) return
  event.preventDefault(); gitContextMenu.value = { type: 'commit', ...menuPosition(event), commit }; focusMenu()
}
function openBranchMenu(event: MouseEvent, commit: GitCommit, branch: string) { event.preventDefault(); event.stopPropagation(); gitContextMenu.value = { type: 'branch', x: event.clientX, y: event.clientY, branch, commit }; focusMenu() }
function openTagMenu(event: MouseEvent, commit: GitCommit, tag: string) { event.preventDefault(); event.stopPropagation(); gitContextMenu.value = { type: 'tag', x: event.clientX, y: event.clientY, tag, commit }; focusMenu() }
function openWorkingTreeMenu(event: MouseEvent | KeyboardEvent) { if (event instanceof KeyboardEvent && !isMenuKey(event)) return; event.preventDefault(); gitContextMenu.value = { type: 'workingTree', ...menuPosition(event) }; focusMenu() }
function openStashMenu(event: MouseEvent | KeyboardEvent, stash: GitStash) { if (event instanceof KeyboardEvent && !isMenuKey(event)) return; event.preventDefault(); gitContextMenu.value = { type: 'stash', ...menuPosition(event), stash }; focusMenu() }
function closeContextMenu() { gitContextMenu.value = null }
function closeFloatingMenus() { closeContextMenu(); repository.showGraphBranchDropdown.value = false; repository.showGraphSettingsDropdown.value = false }
async function copyText(value: string) {
  closeContextMenu()
  if (await props.writeClipboard(value)) props.pushToast('success', 'Copied to clipboard.', 2000)
  else props.pushToast('error', 'Could not copy to clipboard.', 4000)
}
const isRemoteBranch = (branch: string) => !repository.gitGraph.value?.branches.some((item) => item.name === branch && !item.remote)
function restoreSettings() {
  try {
    const stored = JSON.parse(window.localStorage.getItem('code-cat-git-graph-settings') || '{}')
    graphSettings.value = { style: stored.style === 'angular' ? 'angular' : 'rounded', muteNonHead: Boolean(stored.muteNonHead), showAuthor: stored.showAuthor !== false, showDate: stored.showDate !== false }
  } catch {}
}
watch(cwd, () => { repository.invalidateGitState(); void repository.refreshGitGraph() }, { immediate: true })
watch(repository.selectedCommitHash, () => void repository.refreshSelectedCommitFiles())
watch(repository.gitGraphSearch, () => { repository.graphFindIndex.value = -1 })
watch(graphSettings, (value) => window.localStorage.setItem('code-cat-git-graph-settings', JSON.stringify(value)), { deep: true })
onBeforeMount(restoreSettings)

function closeHighPriorityModal() {
  if (!workspace.showWorktreesModal.value) return false
  workspace.showWorktreesModal.value = false
  return true
}
function submitHighPriorityModal() {
  if (!workspace.showWorktreesModal.value) return false
  void workspace.createWorktree()
  return true
}
function closeModal() {
  if (!workspace.showRemotesModal.value) return false
  workspace.showRemotesModal.value = false
  return true
}
function submitModal() {
  if (!workspace.showRemotesModal.value) return false
  void workspace.addRemote()
  return true
}
defineExpose<GitWorkspaceExpose>({
  refresh: repository.refreshGitGraph,
  poll: repository.pollGitState,
  invalidate: repository.invalidateGitState,
  closeFloatingMenus,
  closeHighPriorityModal,
  submitHighPriorityModal,
  closeModal,
  submitModal,
  hasDiffPreview: () => Boolean(repository.diffPreview.value || repository.diffPreviewError.value),
  closeDiffPreview: repository.closeDiffPreview
})
</script>

<template>
  <div class="contents" @click="closeFloatingMenus">
    <GitGraphPanel
      v-model:search="repository.gitGraphSearch.value"
      v-model:show-branch-dropdown="repository.showGraphBranchDropdown.value"
      v-model:show-settings-dropdown="repository.showGraphSettingsDropdown.value"
      v-model:graph-settings="graphSettings"
      v-model:commit-file-view-mode="model.commitFileViewMode.value"
      v-model:git-commit-message="gitCommitMessage"
      :mobile="mobile" :pinned="pinned" :graph="repository.gitGraph.value"
      :loading="repository.loadingGitGraph.value" :error="repository.gitGraphError.value"
      :find-index="repository.graphFindIndex.value" :find-matches="model.graphFindMatches.value"
      :find-match-set="model.graphFindMatchSet.value" :branch-filter="repository.graphBranchFilter.value"
      :local-branches="model.localGraphBranches.value" :remote-branch-groups="model.remoteGraphBranchGroups.value"
      :working-directory="cwd" :current-branches="model.currentBranches.value"
      :show-feature-legend="model.showFeatureLegend.value" :preview-line-set="model.previewLineSet.value"
      :feature-line-set="model.featureLineSet.value" :selected-uncommitted-changes="repository.selectedUncommittedChanges.value"
      :selected-commit-hash="repository.selectedCommitHash.value" :selected-commit="model.selectedCommit.value"
      :graph-rows="model.graphRows.value" :merge-base-set="model.mergeBaseSet.value"
      :graph-column-width="model.gitGraphColumnWidth.value" :selected-commit-files="repository.selectedCommitFiles.value"
      :selected-commit-file-path="repository.selectedCommitFilePath.value" :loading-commit-files="repository.loadingCommitFiles.value"
      :commit-files-error="repository.commitFilesError.value" :commit-file-tree-rows="model.commitFileTreeRows.value"
      :compare-view="repository.compareView.value" :loading-compare="repository.loadingCompare.value"
      :git-action-running="gitActionRunning" :is-muted-commit="model.isMutedCommit" :grouped-branches-for="model.groupedBranchesFor"
      @open-worktrees-modal="workspace.openWorktreesModal" @toggle-git-graph-pinned="emit('update:pinned', !pinned)"
      @clear-graph-branch-filter="repository.clearGraphBranchFilter" @toggle-graph-branch-filter="repository.toggleGraphBranchFilter"
      @go-to-graph-find-match="repository.goToGraphFindMatch" @refresh-git-graph="repository.refreshGitGraph"
      @open-remotes-modal="workspace.openRemotesModal" @handle-graph-list-scroll="repository.handleGraphListScroll"
      @open-working-tree-context-menu="openWorkingTreeMenu" @select-uncommitted-changes="repository.selectUncommittedChanges"
      @open-stash-context-menu="openStashMenu" @select-commit="repository.selectCommit" @open-commit-context-menu="openCommitMenu"
      @open-branch-context-menu="openBranchMenu" @open-tag-context-menu="openTagMenu"
      @unstage-files="actions.unstageFiles" @stage-files="actions.stageFiles" @commit-staged-changes="actions.commitStagedChanges"
      @close-compare-view="repository.closeCompareView" @refresh-selected-commit-files="repository.refreshSelectedCommitFiles"
      @toggle-commit-file-view-mode="model.toggleCommitFileViewMode" @toggle-file-folder="model.toggleFileFolder"
      @open-diff-preview="repository.openDiffPreview"
    />
    <GitDiffPreviewOverlay :diff="repository.diffPreview.value" :lines="model.diffPreviewLines.value"
      :loading="repository.loadingDiffPreview.value" :error="repository.diffPreviewError.value"
      :title-hash="model.selectedCommit.value?.shortHash || ''" :selected-path="repository.selectedCommitFilePath.value"
      :line-class="diffLineClass" @close="repository.closeDiffPreview" />
    <GitContextMenu ref="gitContextMenuEl" :menu="gitContextMenu" :selected-commit-hash="repository.selectedCommitHash.value"
      :is-remote-branch="isRemoteBranch" @close="closeContextMenu" @checkout-ref="actions.checkoutRef"
      @create-branch-from="actions.createBranchFrom" @rename-branch="actions.renameBranch" @delete-branch="actions.deleteBranch"
      @merge-ref="actions.mergeRef" @rebase-onto="actions.rebaseOnto" @push-branch="actions.pushBranch"
      @pull-branch="actions.pullBranch" @fetch-branch="actions.fetchBranch" @copy-text="copyText" @add-tag="actions.addTag"
      @cherry-pick-commit="actions.cherryPickCommit" @revert-commit="actions.revertCommit" @reset-to-commit="actions.resetToCommit"
      @compare-with-selected="repository.compareWithSelected" @push-tag="actions.pushTag" @delete-tag="actions.deleteTag"
      @apply-stash="actions.applyStash" @pop-stash="actions.popStash" @create-branch-from-stash="actions.createBranchFromStash"
      @drop-stash="actions.dropStash" @select-uncommitted-changes="repository.selectUncommittedChanges"
      @stash-working-tree="actions.stashWorkingTree" @reset-working-tree="actions.resetWorkingTree" @clean-untracked="actions.cleanUntracked" />
    <Teleport to="body">
      <WorktreesModal ref="worktreesModalRef" :open="workspace.showWorktreesModal.value" :worktrees="workspace.worktrees.value"
        :loading="workspace.loadingWorktrees.value" :action-running="workspace.worktreeActionRunning.value" :theme-vars="themeVars"
        @close="workspace.showWorktreesModal.value = false" @create="workspace.createWorktree" @remove="workspace.removeWorktree" />
      <RemotesModal ref="remotesModalRef" :open="workspace.showRemotesModal.value" :remotes="workspace.remotes.value"
        :loading="workspace.loadingRemotes.value" :theme-vars="themeVars" @close="workspace.showRemotesModal.value = false"
        @add="workspace.addRemote" @edit="workspace.editRemote" @remove="workspace.removeRemote" />
    </Teleport>
  </div>
</template>
