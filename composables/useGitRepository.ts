import type { Ref } from 'vue'
import type { GitCommitFile, GitCompareResponse, GitFileDiff, GitGraphResponse, ToastType } from '~/types/app'
import { extractFetchError } from '~/utils/fetch-error'

type PushToast = (type: ToastType, message: string, duration?: number) => void

export function useGitRepository(options: {
  cwd: Ref<string>
  selectedCommit: () => { hash: string } | null
  graphFindMatches: () => Array<{ hash: string }>
  gitActionRunning: Ref<boolean>
  pushToast: PushToast
  closeContextMenu: () => void
}) {
  const gitGraph = ref<GitGraphResponse | null>(null)
  const loadingGitGraph = ref(false)
  const gitGraphError = ref('')
  const gitGraphSearch = ref('')
  const graphFindIndex = ref(-1)
  const graphLimit = ref(120)
  const graphBranchFilter = ref<string[]>([])
  const showGraphBranchDropdown = ref(false)
  const showGraphSettingsDropdown = ref(false)
  const selectedCommitHash = ref('')
  const selectedUncommittedChanges = ref(false)
  const selectedCommitFiles = ref<GitCommitFile[]>([])
  const loadingCommitFiles = ref(false)
  const commitFilesError = ref('')
  const selectedCommitFilePath = ref('')
  const diffPreview = ref<GitFileDiff | null>(null)
  const loadingDiffPreview = ref(false)
  const diffPreviewError = ref('')
  const compareView = ref<GitCompareResponse | null>(null)
  const loadingCompare = ref(false)
  let graphRequestId = 0
  let pollRunning = false
  let lastFingerprint = ''

  function invalidateGitState() { lastFingerprint = '' }
  function closeDiffPreview() {
    selectedCommitFilePath.value = ''
    diffPreview.value = null
    diffPreviewError.value = ''
    loadingDiffPreview.value = false
  }
  async function refreshGitGraph() {
    const requestId = ++graphRequestId
    const requestedCwd = options.cwd.value
    loadingGitGraph.value = true
    gitGraphError.value = ''
    try {
      const response = await $fetch<GitGraphResponse>('/api/git/graph', { query: {
        cwd: requestedCwd || undefined,
        limit: graphLimit.value !== 120 ? graphLimit.value : undefined,
        branches: graphBranchFilter.value.length ? graphBranchFilter.value.join(',') : undefined
      } })
      if (requestId !== graphRequestId) return
      gitGraph.value = response
      if (!selectedCommitHash.value || !response.commits.some((commit) => commit.hash === selectedCommitHash.value)) selectedCommitHash.value = response.commits[0]?.hash || ''
      else void refreshSelectedCommitFiles()
    } catch (error) {
      if (requestId !== graphRequestId) return
      gitGraphError.value = error instanceof Error ? error.message : 'Failed to load git graph'
      gitGraph.value = null
      selectedCommitHash.value = ''
      selectedCommitFiles.value = []
      closeDiffPreview()
    } finally {
      if (requestId === graphRequestId) loadingGitGraph.value = false
    }
  }
  async function pollGitState() {
    if (pollRunning || loadingGitGraph.value || options.gitActionRunning.value) return
    pollRunning = true
    try {
      const state = await $fetch<{ headCommit: string; branchListHash: string; workingTreeHash: string; stashListHash: string }>('/api/git/state', { query: { cwd: options.cwd.value || undefined } })
      const fingerprint = [state.headCommit, state.branchListHash, state.workingTreeHash, state.stashListHash].join(':')
      if (lastFingerprint && fingerprint !== lastFingerprint) await refreshGitGraph()
      lastFingerprint = fingerprint
    } catch {} finally { pollRunning = false }
  }
  function handleGraphListScroll(event: Event) {
    const element = event.target
    if (!(element instanceof HTMLElement) || loadingGitGraph.value || !gitGraph.value) return
    if (gitGraph.value.commits.length < graphLimit.value || graphLimit.value >= 1000) return
    if (element.scrollTop + element.clientHeight < element.scrollHeight - 200) return
    graphLimit.value = Math.min(1000, graphLimit.value + 120)
    void refreshGitGraph()
  }
  function toggleGraphBranchFilter(name: string) {
    const filter = new Set(graphBranchFilter.value)
    filter.has(name) ? filter.delete(name) : filter.add(name)
    graphBranchFilter.value = [...filter]
    void refreshGitGraph()
  }
  function clearGraphBranchFilter() {
    if (!graphBranchFilter.value.length) return
    graphBranchFilter.value = []
    void refreshGitGraph()
  }
  function goToGraphFindMatch(direction: 1 | -1) {
    const matches = options.graphFindMatches()
    if (!matches.length) return
    graphFindIndex.value = graphFindIndex.value === -1
      ? (direction === 1 ? 0 : matches.length - 1)
      : (graphFindIndex.value + direction + matches.length) % matches.length
    const match = matches[graphFindIndex.value]
    if (!match) return
    selectCommit(match.hash)
    requestAnimationFrame(() => document.querySelector(`[data-commit-hash="${match.hash}"]`)?.scrollIntoView({ block: 'nearest' }))
  }
  function selectCommit(hash: string) {
    selectedCommitHash.value = hash
    selectedUncommittedChanges.value = false
    compareView.value = null
    closeDiffPreview()
  }
  function selectUncommittedChanges() {
    selectedUncommittedChanges.value = true
    selectedCommitHash.value = ''
    selectedCommitFiles.value = []
    compareView.value = null
    closeDiffPreview()
  }
  async function compareWithSelected(hash: string) {
    const from = selectedCommitHash.value
    options.closeContextMenu()
    if (!from || from === hash) return
    loadingCompare.value = true
    try {
      compareView.value = await $fetch<GitCompareResponse>('/api/git/compare', { query: { cwd: options.cwd.value || undefined, from, to: hash } })
    } catch (error) {
      options.pushToast('error', `Failed to compare commits: ${extractFetchError(error)}`, 6000)
    } finally { loadingCompare.value = false }
  }
  function closeCompareView() { compareView.value = null }
  async function refreshSelectedCommitFiles() {
    const commit = options.selectedCommit()
    if (!commit || selectedUncommittedChanges.value) { selectedCommitFiles.value = []; commitFilesError.value = ''; return }
    loadingCommitFiles.value = true
    commitFilesError.value = ''
    const requestedHash = commit.hash
    try {
      const response = await $fetch<{ files: GitCommitFile[] }>('/api/git/commit-files', { query: { cwd: options.cwd.value || undefined, hash: requestedHash } })
      if (selectedCommitHash.value !== requestedHash) return
      selectedCommitFiles.value = response.files
      if (selectedCommitFilePath.value && !response.files.some((file) => file.path === selectedCommitFilePath.value)) closeDiffPreview()
    } catch (error) {
      if (selectedCommitHash.value === requestedHash) { commitFilesError.value = extractFetchError(error); selectedCommitFiles.value = [] }
    } finally { if (selectedCommitHash.value === requestedHash) loadingCommitFiles.value = false }
  }
  async function openDiffPreview(file: GitCommitFile) {
    const commit = options.selectedCommit()
    if (!commit) return
    if (selectedCommitFilePath.value === file.path && !diffPreviewError.value) return closeDiffPreview()
    selectedCommitFilePath.value = file.path
    loadingDiffPreview.value = true
    diffPreviewError.value = ''
    try {
      diffPreview.value = await $fetch<GitFileDiff>('/api/git/file-diff', { query: { cwd: options.cwd.value || undefined, hash: commit.hash, path: file.path, oldPath: file.oldPath || undefined } })
    } catch (error) { diffPreviewError.value = extractFetchError(error); diffPreview.value = null }
    finally { loadingDiffPreview.value = false }
  }
  return { gitGraph, loadingGitGraph, gitGraphError, gitGraphSearch, graphFindIndex, graphLimit,
    graphBranchFilter, showGraphBranchDropdown, showGraphSettingsDropdown, selectedCommitHash,
    selectedUncommittedChanges, selectedCommitFiles, loadingCommitFiles, commitFilesError,
    selectedCommitFilePath, diffPreview, loadingDiffPreview, diffPreviewError, compareView,
    loadingCompare, invalidateGitState, refreshGitGraph, pollGitState, handleGraphListScroll,
    toggleGraphBranchFilter, clearGraphBranchFilter, goToGraphFindMatch, selectCommit,
    selectUncommittedChanges, compareWithSelected, closeCompareView, refreshSelectedCommitFiles,
    openDiffPreview, closeDiffPreview }
}
