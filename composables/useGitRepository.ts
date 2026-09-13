import type { Ref } from 'vue'
import type { GitCommitFile, GitCompareResponse, GitFileDiff, GitGraphResponse, ToastType } from '~/types/app'
import { extractFetchError } from '~/utils/fetch-error'
import { shouldLoadMoreGraph } from '~/utils/git-graph'

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
  let pollRequestId = 0
  let commitFilesRequestId = 0
  let diffRequestId = 0
  let compareRequestId = 0
  let graphInFlight: { signature: string; promise: Promise<void> } | null = null
  let pollRunning = false
  let lastFingerprint = ''

  function invalidateGitState() { lastFingerprint = ''; pollRequestId++ }
  function closeDiffPreview() {
    diffRequestId++
    selectedCommitFilePath.value = ''
    diffPreview.value = null
    diffPreviewError.value = ''
    loadingDiffPreview.value = false
  }
  function refreshGitGraph(): Promise<void> {
    const requestedCwd = options.cwd.value
    const requestedLimit = graphLimit.value
    const requestedBranches = graphBranchFilter.value.join(',')
    const signature = JSON.stringify([requestedCwd, requestedLimit, requestedBranches])
    if (graphInFlight?.signature === signature) return graphInFlight.promise

    const promise = loadGitGraph(requestedCwd, requestedLimit, requestedBranches)
    graphInFlight = { signature, promise }
    return promise.finally(() => {
      if (graphInFlight?.promise === promise) graphInFlight = null
    })
  }

  async function loadGitGraph(requestedCwd: string, requestedLimit: number, requestedBranches: string) {
    const requestId = ++graphRequestId
    loadingGitGraph.value = true
    gitGraphError.value = ''
    try {
      const response = await $fetch<GitGraphResponse>('/api/git/graph', { query: {
        cwd: requestedCwd || undefined,
        limit: requestedLimit !== 120 ? requestedLimit : undefined,
        branches: requestedBranches || undefined
      } })
      if (requestId !== graphRequestId || requestedCwd !== options.cwd.value) return
      gitGraph.value = response
      if (!selectedCommitHash.value || !response.commits.some((commit) => commit.hash === selectedCommitHash.value)) selectedCommitHash.value = response.commits[0]?.hash || ''
      else void refreshSelectedCommitFiles()
    } catch (error) {
      if (requestId !== graphRequestId || requestedCwd !== options.cwd.value) return
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
    const requestId = ++pollRequestId
    const requestedCwd = options.cwd.value
    try {
      const state = await $fetch<{ headCommit: string; branchListHash: string; workingTreeHash: string; stashListHash: string }>('/api/git/state', { query: { cwd: requestedCwd || undefined } })
      if (requestId !== pollRequestId || requestedCwd !== options.cwd.value) return
      const fingerprint = [state.headCommit, state.branchListHash, state.workingTreeHash, state.stashListHash].join(':')
      if (lastFingerprint && fingerprint !== lastFingerprint) await refreshGitGraph()
      lastFingerprint = fingerprint
    } catch {} finally { pollRunning = false }
  }
  function handleGraphListScroll(event: Event) {
    const element = event.target
    if (!(element instanceof HTMLElement) || loadingGitGraph.value || !gitGraph.value) return
    if (!shouldLoadMoreGraph({
      scrollTop: element.scrollTop,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      loaded: gitGraph.value.commits.length,
      limit: graphLimit.value
    })) return
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
    closeCompareView()
    closeDiffPreview()
  }
  function selectUncommittedChanges() {
    selectedUncommittedChanges.value = true
    selectedCommitHash.value = ''
    selectedCommitFiles.value = []
    closeCompareView()
    closeDiffPreview()
  }
  async function compareWithSelected(hash: string) {
    const from = selectedCommitHash.value
    options.closeContextMenu()
    if (!from || from === hash) return
    const requestId = ++compareRequestId
    const requestedCwd = options.cwd.value
    loadingCompare.value = true
    try {
      const response = await $fetch<GitCompareResponse>('/api/git/compare', { query: { cwd: requestedCwd || undefined, from, to: hash } })
      if (requestId === compareRequestId && requestedCwd === options.cwd.value) compareView.value = response
    } catch (error) {
      if (requestId === compareRequestId) options.pushToast('error', `Failed to compare commits: ${extractFetchError(error)}`, 6000)
    } finally { if (requestId === compareRequestId) loadingCompare.value = false }
  }
  function closeCompareView() { compareRequestId++; compareView.value = null; loadingCompare.value = false }
  async function refreshSelectedCommitFiles() {
    const commit = options.selectedCommit()
    const requestId = ++commitFilesRequestId
    if (!commit || selectedUncommittedChanges.value) { selectedCommitFiles.value = []; commitFilesError.value = ''; loadingCommitFiles.value = false; return }
    loadingCommitFiles.value = true
    commitFilesError.value = ''
    const requestedHash = commit.hash
    const requestedCwd = options.cwd.value
    try {
      const response = await $fetch<{ files: GitCommitFile[] }>('/api/git/commit-files', { query: { cwd: requestedCwd || undefined, hash: requestedHash } })
      if (requestId !== commitFilesRequestId || selectedCommitHash.value !== requestedHash || requestedCwd !== options.cwd.value) return
      selectedCommitFiles.value = response.files
      if (selectedCommitFilePath.value && !response.files.some((file) => file.path === selectedCommitFilePath.value)) closeDiffPreview()
    } catch (error) {
      if (requestId === commitFilesRequestId && selectedCommitHash.value === requestedHash) { commitFilesError.value = extractFetchError(error); selectedCommitFiles.value = [] }
    } finally { if (requestId === commitFilesRequestId) loadingCommitFiles.value = false }
  }
  async function openDiffPreview(file: GitCommitFile) {
    const commit = options.selectedCommit()
    if (!commit) return
    if (selectedCommitFilePath.value === file.path && !diffPreviewError.value) return closeDiffPreview()
    const requestId = ++diffRequestId
    const requestedCwd = options.cwd.value
    const requestedHash = commit.hash
    selectedCommitFilePath.value = file.path
    loadingDiffPreview.value = true
    diffPreviewError.value = ''
    try {
      const response = await $fetch<GitFileDiff>('/api/git/file-diff', { query: { cwd: requestedCwd || undefined, hash: requestedHash, path: file.path, oldPath: file.oldPath || undefined } })
      if (requestId === diffRequestId && selectedCommitFilePath.value === file.path && requestedCwd === options.cwd.value) diffPreview.value = response
    } catch (error) {
      if (requestId === diffRequestId) { diffPreviewError.value = extractFetchError(error); diffPreview.value = null }
    } finally { if (requestId === diffRequestId) loadingDiffPreview.value = false }
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
