import type { Ref } from 'vue'
import type { SessionListItem } from '~/server/utils/session-store'
import type { CommitFileTreeRow, GitBranch, GitCommit, GitCommitFile, GitFileDiff, GitGraphResponse } from '~/types/app'
import { GRAPH_COLUMN_WIDTH, GRAPH_PADDING, computeGraphRows, parseUnifiedDiff } from '~/utils/git-graph'

export function useGitGraphModel(options: {
  gitGraph: Ref<GitGraphResponse | null>
  graphSettings: Ref<{ style: 'rounded' | 'angular'; muteNonHead: boolean; showAuthor: boolean; showDate: boolean }>
  gitGraphSearch: Ref<string>
  selectedCommitHash: Ref<string>
  selectedCommitFiles: Ref<GitCommitFile[]>
  diffPreview: Ref<GitFileDiff | null>
  activeSession: Ref<SessionListItem | undefined>
  previewingSession: Ref<SessionListItem | null>
}) {
  const { gitGraph, graphSettings, gitGraphSearch, selectedCommitHash, selectedCommitFiles, diffPreview } = options
  const commitFileViewMode = ref<'flat' | 'tree'>('flat')
  const expandedFileFolders = ref<Set<string>>(new Set())
  const selectedCommit = computed(() => gitGraph.value?.commits.find((commit) => commit.hash === selectedCommitHash.value) || null)
  const diffPreviewLines = computed(() => diffPreview.value ? parseUnifiedDiff(diffPreview.value.diff) : [])
  const currentBranches = computed(() => gitGraph.value?.branches.filter((branch) => branch.current) || [])
  const graphRows = computed(() => computeGraphRows(gitGraph.value?.commits || [], gitGraph.value?.headHash || '', graphSettings.value.style))
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
  const isMutedCommit = (hash: string) => graphSettings.value.muteNonHead && !headAncestorHashes.value.has(hash)
  const localGraphBranches = computed(() => (gitGraph.value?.branches || []).filter((branch) => !branch.remote))
  const remoteGraphBranchGroups = computed(() => {
    const groups = new Map<string, GitBranch[]>()
    for (const branch of gitGraph.value?.branches || []) {
      if (!branch.remote) continue
      const remote = branch.name.split('/')[0] || 'remote'
      groups.set(remote, [...(groups.get(remote) || []), branch])
    }
    return [...groups.entries()].map(([remote, branches]) => ({ remote, branches }))
  })
  const gitGraphMaxLane = computed(() => {
    let max = 0
    for (const row of graphRows.value.values()) {
      max = Math.max(max, row.lane)
      for (const segment of row.connections) max = Math.max(max, segment.fromLane, segment.toLane)
    }
    return max
  })
  const gitGraphColumnWidth = computed(() => GRAPH_PADDING * 2 + (gitGraphMaxLane.value + 1) * GRAPH_COLUMN_WIDTH)
  const mergeBaseSet = computed(() => new Set(gitGraph.value?.mergeBases || []))
  function ancestorHashes(startHash: string, commitMap: Map<string, GitCommit>) {
    const result = new Set<string>()
    const queue = [startHash]
    while (queue.length) {
      const hash = queue.pop()!
      if (!hash || result.has(hash)) continue
      result.add(hash)
      const commit = commitMap.get(hash)
      if (commit) queue.push(...commit.parents)
    }
    return result
  }
  function branchLineHashes(branchName?: string, baseName?: string) {
    const result = new Set<string>()
    if (!branchName || !gitGraph.value) return result
    const commits = gitGraph.value.commits
    const commitMap = new Map(commits.map((commit) => [commit.hash, commit]))
    const tip = commits.find((commit) => commit.branches.includes(branchName))
    if (!tip) return result
    const baseTip = baseName ? commits.find((commit) => commit.branches.includes(baseName)) : undefined
    const stops = baseTip ? ancestorHashes(baseTip.hash, commitMap) : mergeBaseSet.value
    if (!stops.size) return result
    let current: GitCommit | undefined = tip
    while (current && !stops.has(current.hash)) {
      result.add(current.hash)
      current = current.parents[0] ? commitMap.get(current.parents[0]) : undefined
    }
    return result
  }
  const previewLineSet = computed(() => branchLineHashes(options.previewingSession.value?.previewBranch || undefined, options.previewingSession.value?.baseBranch || undefined))
  const featureLineSet = computed(() => branchLineHashes(options.activeSession.value?.worktreeBranch || undefined, options.activeSession.value?.baseBranch || undefined))
  const showFeatureLegend = computed(() => [...featureLineSet.value].some((hash) => !previewLineSet.value.has(hash)))
  const localBranchNames = computed(() => new Set((gitGraph.value?.branches || []).filter((branch) => !branch.remote).map((branch) => branch.name)))
  function groupedBranchesFor(commit: GitCommit) {
    const local = commit.branches.filter((branch) => localBranchNames.value.has(branch))
    const remotes = commit.branches.filter((branch) => !localBranchNames.value.has(branch))
    const matched = new Set<string>()
    const result = local.map((name) => {
      const names = remotes.filter((remote) => remote.endsWith(`/${name}`))
      names.forEach((remote) => matched.add(remote))
      return names.length
        ? { displayName: `${name}/${names.map((remote) => remote.split('/')[0]).join(',')}`, originalBranches: [name, ...names], isLocal: true }
        : { displayName: name, originalBranches: [name], isLocal: true }
    })
    return [...result, ...remotes.filter((remote) => !matched.has(remote)).map((remote) => ({ displayName: remote, originalBranches: [remote], isLocal: false }))]
  }
  const graphFindMatches = computed(() => {
    const query = gitGraphSearch.value.trim().toLowerCase()
    if (!query || !gitGraph.value) return []
    return gitGraph.value.commits.filter((commit) => commit.subject.toLowerCase().includes(query)
      || commit.hash.startsWith(query) || commit.shortHash.startsWith(query)
      || commit.author.name.toLowerCase().includes(query) || commit.refs.some((ref) => ref.toLowerCase().includes(query)))
  })
  const graphFindMatchSet = computed(() => new Set(graphFindMatches.value.map((commit) => commit.hash)))
  const commitFileTreeRows = computed<CommitFileTreeRow[]>(() => {
    if (commitFileViewMode.value !== 'tree') return []
    type Folder = { name: string; path: string; folders: Map<string, Folder>; files: GitCommitFile[] }
    const root: Folder = { name: '', path: '', folders: new Map(), files: [] }
    for (const file of selectedCommitFiles.value) {
      const parts = file.path.split('/')
      let node = root
      for (let index = 0; index < parts.length - 1; index++) {
        const name = parts[index]!
        const path = node.path ? `${node.path}/${name}` : name
        if (!node.folders.has(name)) node.folders.set(name, { name, path, folders: new Map(), files: [] })
        node = node.folders.get(name)!
      }
      node.files.push(file)
    }
    const rows: CommitFileTreeRow[] = []
    const visit = (folder: Folder, depth: number) => {
      for (const child of [...folder.folders.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        const expanded = expandedFileFolders.value.has(child.path)
        rows.push({ kind: 'folder', path: child.path, name: child.name, depth, expanded })
        if (expanded) visit(child, depth + 1)
      }
      for (const file of [...folder.files].sort((a, b) => a.path.localeCompare(b.path))) rows.push({ kind: 'file', file, name: file.path.split('/').pop() || file.path, depth })
    }
    visit(root, 0)
    return rows
  })
  function toggleCommitFileViewMode() {
    if (commitFileViewMode.value === 'tree') { commitFileViewMode.value = 'flat'; return }
    commitFileViewMode.value = 'tree'
    const folders = new Set<string>()
    for (const file of selectedCommitFiles.value) {
      const parts = file.path.split('/'); let path = ''
      for (let index = 0; index < parts.length - 1; index++) { path = path ? `${path}/${parts[index]}` : parts[index]!; folders.add(path) }
    }
    expandedFileFolders.value = folders
  }
  function toggleFileFolder(path: string) {
    const folders = new Set(expandedFileFolders.value)
    folders.has(path) ? folders.delete(path) : folders.add(path)
    expandedFileFolders.value = folders
  }
  return { selectedCommit, diffPreviewLines, currentBranches, graphRows, isMutedCommit,
    localGraphBranches, remoteGraphBranchGroups, gitGraphColumnWidth, previewLineSet, featureLineSet,
    showFeatureLegend, groupedBranchesFor, graphFindMatches, graphFindMatchSet, mergeBaseSet, commitFileViewMode,
    commitFileTreeRows, toggleCommitFileViewMode, toggleFileFolder }
}
