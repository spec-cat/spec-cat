import { exec, execSync, execFileSync } from 'child_process'
import { promisify } from 'util'
import { getProjectDir } from './projectDir'
import type {
  Commit,
  CommitDetail,
  Branch,
  RepositoryStatus,
  WorkingDirectoryStatus,
  StagingAreaStatus,
  Remote,
  CommitAuthor,
  CommitStats,
  FileChange,
  FileChangeStatus
} from '~/types/git'

const execAsync = promisify(exec)

/**
 * Execute a git command synchronously (simple string command)
 */
export function execGit(cwd: string, command: string): string {
  try {
    const output = execSync(`git ${command}`, {
      cwd,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      encoding: 'utf-8'
    })
    return output.trim()
  } catch (error: any) {
    throw new Error(`Git command failed: ${error.message}`)
  }
}

/**
 * Execute a git command synchronously with argument array (shell-injection safe)
 */
export function execGitArgs(cwd: string, args: string[]): string {
  try {
    const output = execFileSync('git', args, {
      cwd,
      maxBuffer: 1024 * 1024 * 10,
      encoding: 'utf-8'
    })
    return output.trim()
  } catch (error: any) {
    throw new Error(`Git command failed: ${error.message}`)
  }
}

/**
 * Execute a git command safely with proper error handling
 */
export async function execGitCommand(
  args: string[],
  cwd: string = getProjectDir()
): Promise<string> {
  try {
    const command = `git ${args.join(' ')}`
    const { stdout } = await execAsync(command, { 
      cwd,
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer for large repositories
    })
    return stdout.trim()
  } catch (error: any) {
    throw new Error(`Git command failed: ${error.message}`)
  }
}

/**
 * Check if directory is a valid git repository
 */
export async function isGitRepository(path: string = getProjectDir()): Promise<boolean> {
  try {
    await execGitCommand(['rev-parse', '--git-dir'], path)
    return true
  } catch {
    return false
  }
}

/**
 * Get git repository root path
 */
export async function getRepositoryRoot(path: string = getProjectDir()): Promise<string> {
  return await execGitCommand(['rev-parse', '--show-toplevel'], path)
}

/**
 * Parse git log output into Commit objects
 */
export async function getCommitHistory(options: {
  limit?: number
  offset?: number
  branch?: string
  author?: string
  search?: string
  since?: string
  until?: string
  cwd?: string
} = {}): Promise<Commit[]> {
  const {
    limit = 50,
    offset = 0,
    branch,
    author,
    search,
    since,
    until,
    cwd = getProjectDir()
  } = options

  // Build git log arguments
  const args = ['log', '--pretty=format:%H|%h|%s|%B|%an|%ae|%ad|%cn|%ce|%cd|%P', '--date=iso']
  
  if (limit) args.push(`-${limit}`)
  if (offset && offset > 0) args.push(`--skip=${offset}`)
  if (branch) args.push(branch)
  if (author) args.push(`--author=${author}`)
  if (search) args.push(`--grep=${search}`)
  if (since) args.push(`--since=${since}`)
  if (until) args.push(`--until=${until}`)

  const output = await execGitCommand(args, cwd)
  
  if (!output) return []

  return output.split('\n').map(line => {
    const [
      hash, shortHash, subject, message, authorName, authorEmail, authorDate,
      committerName, committerEmail, committerDate, parentHashes
    ] = line.split('|')

    const parents = parentHashes ? parentHashes.split(' ').filter(Boolean) : []

    return {
      hash,
      shortHash,
      message: message || subject,
      subject,
      author: {
        name: authorName,
        email: authorEmail,
        date: authorDate
      } as CommitAuthor,
      committer: (committerName !== authorName || committerEmail !== authorEmail) ? {
        name: committerName,
        email: committerEmail,
        date: committerDate
      } as CommitAuthor : undefined,
      date: authorDate,
      parents,
      branches: [], // Will be populated separately
      tags: [] // Will be populated separately
    } as Commit
  })
}

/**
 * Get detailed information about a specific commit
 */
export async function getCommitDetail(
  hash: string,
  cwd: string = getProjectDir()
): Promise<CommitDetail> {
  // Get basic commit info
  const [commit] = await getCommitHistory({ limit: 1, cwd })
  if (!commit || commit.hash !== hash) {
    throw new Error(`Commit ${hash} not found`)
  }

  // Get file changes
  const fileChangesOutput = await execGitCommand([
    'diff-tree', '--no-commit-id', '--name-status', '-r', hash
  ], cwd)

  const fileChanges: FileChange[] = []
  if (fileChangesOutput) {
    for (const line of fileChangesOutput.split('\n').filter(Boolean)) {
      const [status, ...pathParts] = line.split('\t')
      const path = pathParts.join('\t')
      
      // Handle renames (R) and copies (C)
      let oldPath: string | undefined
      let newPath = path
      
      if (status.startsWith('R') || status.startsWith('C')) {
        const [from, to] = path.split('\t')
        oldPath = from
        newPath = to
      }

      fileChanges.push({
        path: newPath,
        oldPath,
        status: status.charAt(0) as FileChangeStatus,
        additions: 0, // Will be populated by diffstat
        deletions: 0, // Will be populated by diffstat
        binary: false // Will be detected by diffstat
      })
    }
  }

  // Get diffstat for additions/deletions
  const diffstatOutput = await execGitCommand([
    'diff-tree', '--no-commit-id', '--numstat', '-r', hash
  ], cwd)

  const diffstatMap = new Map<string, { additions: number; deletions: number; binary: boolean }>()
  if (diffstatOutput) {
    for (const line of diffstatOutput.split('\n').filter(Boolean)) {
      const [addStr, delStr, path] = line.split('\t')
      const additions = addStr === '-' ? 0 : parseInt(addStr, 10)
      const deletions = delStr === '-' ? 0 : parseInt(delStr, 10)
      const binary = addStr === '-' && delStr === '-'
      
      diffstatMap.set(path, { additions, deletions, binary })
    }
  }

  // Merge diffstat into file changes
  for (const fileChange of fileChanges) {
    const stats = diffstatMap.get(fileChange.path)
    if (stats) {
      fileChange.additions = stats.additions
      fileChange.deletions = stats.deletions
      fileChange.binary = stats.binary
    }
  }

  // Calculate total stats
  const stats: CommitStats = {
    additions: fileChanges.reduce((sum, f) => sum + f.additions, 0),
    deletions: fileChanges.reduce((sum, f) => sum + f.deletions, 0),
    filesChanged: fileChanges.length
  }

  return {
    ...commit,
    fileChanges,
    stats
  }
}

/**
 * Get all branches in the repository
 */
export async function getBranches(
  includeRemote: boolean = false,
  cwd: string = getProjectDir()
): Promise<Branch[]> {
  const args = ['branch', '-v']
  if (includeRemote) args.push('-a')

  const output = await execGitCommand(args, cwd)
  const branches: Branch[] = []

  for (const line of output.split('\n').filter(Boolean)) {
    const isHead = line.startsWith('*')
    const cleanLine = line.replace(/^\*?\s+/, '')
    const [name, hash, ...messageParts] = cleanLine.split(/\s+/)
    
    if (!name || !hash) continue

    const isRemote = name.startsWith('remotes/')
    const actualName = isRemote ? name.replace('remotes/', '') : name
    
    // Get last commit date
    const lastCommitDate = await execGitCommand([
      'log', '-1', '--format=%ad', '--date=iso', hash
    ], cwd)

    branches.push({
      name: actualName,
      ref: isRemote ? `refs/remotes/${actualName}` : `refs/heads/${actualName}`,
      tip: hash,
      ahead: 0, // Will be calculated if upstream exists
      behind: 0, // Will be calculated if upstream exists
      color: generateBranchColor(actualName),
      isHead: isHead && !isRemote,
      isRemote,
      lastCommitDate
    })
  }

  return branches
}

/**
 * Get repository status including working directory and staging area
 */
export async function getRepositoryStatus(
  cwd: string = getProjectDir()
): Promise<RepositoryStatus> {
  // Get current branch and HEAD
  const currentBranch = await execGitCommand(['branch', '--show-current'], cwd)
  const head = await execGitCommand(['rev-parse', 'HEAD'], cwd)
  const gitDir = await execGitCommand(['rev-parse', '--git-dir'], cwd)

  // Get working directory status
  const statusOutput = await execGitCommand(['status', '--porcelain'], cwd)
  
  const untracked: string[] = []
  const modified: string[] = []
  const deleted: string[] = []
  const staged: string[] = []
  const partiallyStaged: string[] = []

  for (const line of statusOutput.split('\n').filter(Boolean)) {
    const indexStatus = line.charAt(0)
    const workingStatus = line.charAt(1)
    const filepath = line.substring(3)

    // Working directory changes
    if (workingStatus === 'M') modified.push(filepath)
    if (workingStatus === 'D') deleted.push(filepath)
    if (indexStatus === '?' && workingStatus === '?') untracked.push(filepath)

    // Staged changes
    if (indexStatus !== ' ' && indexStatus !== '?') staged.push(filepath)
    
    // Partially staged (both staged and working changes)
    if (indexStatus !== ' ' && indexStatus !== '?' && workingStatus !== ' ') {
      partiallyStaged.push(filepath)
    }
  }

  // Get remotes
  const remotesOutput = await execGitCommand(['remote', '-v'], cwd)
  const remoteMap = new Map<string, { fetchUrl: string; pushUrl: string }>()
  
  for (const line of remotesOutput.split('\n').filter(Boolean)) {
    const [name, url, type] = line.split(/\s+/)
    if (!remoteMap.has(name)) {
      remoteMap.set(name, { fetchUrl: url, pushUrl: url })
    }
    
    const remote = remoteMap.get(name)!
    if (type === '(fetch)') remote.fetchUrl = url
    if (type === '(push)') remote.pushUrl = url
  }

  const remotes: Remote[] = Array.from(remoteMap.entries()).map(([name, urls]) => ({
    name,
    url: urls.fetchUrl, // Use fetch URL as primary
    fetchUrl: urls.fetchUrl,
    pushUrl: urls.pushUrl
  }))

  return {
    currentBranch,
    head,
    workingDirectory: {
      clean: modified.length === 0 && deleted.length === 0 && untracked.length === 0,
      untracked,
      modified,
      deleted
    },
    stagingArea: {
      hasChanges: staged.length > 0,
      staged,
      partiallyStaged
    },
    remotes,
    lastUpdated: new Date().toISOString(),
    gitDir
  }
}

/**
 * Checkout a specific branch
 */
export async function checkoutBranch(
  branchName: string,
  force: boolean = false,
  cwd: string = getProjectDir()
): Promise<{ success: boolean; error?: string }> {
  try {
    const args = ['checkout']
    if (force) args.push('-f')
    args.push(branchName)

    await execGitCommand(args, cwd)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Generate a deterministic color for a branch name (FR-003: 12-color palette)
 */
export function generateBranchColor(branchName: string): string {
  const colors = [
    '#3B82F6', // blue
    '#EF4444', // red
    '#10B981', // green
    '#F59E0B', // amber
    '#8B5CF6', // violet
    '#EC4899', // pink
    '#14B8A6', // teal
    '#F97316', // orange
    '#06B6D4', // cyan
    '#84CC16', // lime
    '#F43F5E', // rose
    '#A855F7', // purple
  ]

  // Simple hash function for consistent colors
  let hash = 0
  for (let i = 0; i < branchName.length; i++) {
    const char = branchName.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }

  return colors[Math.abs(hash) % colors.length]
}

/**
 * Get decorations (branches and tags) for commits
 */
export async function getCommitDecorations(
  commits: Commit[],
  cwd: string = getProjectDir()
): Promise<void> {
  if (commits.length === 0) return

  // Get branch decorations
  const branchOutput = await execGitCommand([
    'for-each-ref',
    "--format='%(objectname) %(refname:short)'",
    'refs/heads/',
    'refs/remotes/'
  ], cwd)

  const branchMap = new Map<string, string[]>()
  for (const line of branchOutput.split('\n').filter(Boolean)) {
    const [hash, branchName] = line.split(' ', 2)
    if (!branchMap.has(hash)) branchMap.set(hash, [])
    branchMap.get(hash)!.push(branchName)
  }

  // Get tag decorations
  const tagOutput = await execGitCommand([
    'for-each-ref',
    "--format='%(objectname) %(refname:short)'",
    'refs/tags/'
  ], cwd)

  const tagMap = new Map<string, string[]>()
  for (const line of tagOutput.split('\n').filter(Boolean)) {
    const [hash, tagName] = line.split(' ', 2)
    if (!tagMap.has(hash)) tagMap.set(hash, [])
    tagMap.get(hash)!.push(tagName)
  }

  // Apply decorations to commits
  for (const commit of commits) {
    commit.branches = branchMap.get(commit.hash) || []
    commit.tags = tagMap.get(commit.hash) || []
  }
}

/**
 * Find the merge-base (fork point) between two branches/commits.
 * Returns null if no common ancestor exists.
 */
export async function getMergeBase(
  ref1: string,
  ref2: string,
  cwd: string = getProjectDir()
): Promise<string | null> {
  try {
    const output = await execGitCommand(['merge-base', ref1, ref2], cwd)
    return output.trim() || null
  } catch {
    return null
  }
}

/**
 * Check if ref1 is an ancestor of ref2.
 */
export async function isAncestor(
  ref1: string,
  ref2: string,
  cwd: string = getProjectDir()
): Promise<boolean> {
  try {
    await execGitCommand(['merge-base', '--is-ancestor', ref1, ref2], cwd)
    return true
  } catch {
    return false
  }
}

/**
 * Check if directory is a git repository (synchronous)
 */
export function isGitRepositorySync(cwd: string): boolean {
  try {
    execGit(cwd, 'rev-parse --git-dir')
    return true
  } catch {
    return false
  }
}

/**
 * Get all branch names (synchronous)
 */
export function getBranchesSync(cwd: string): string[] {
  try {
    const output = execGit(cwd, "branch -a --format='%(refname:short)'")
    return output.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Get all tag names (synchronous)
 */
export function getTags(cwd: string): string[] {
  try {
    const output = execGit(cwd, 'tag --list')
    return output.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Get total commit count (synchronous)
 */
export function getCommitCount(cwd: string): number {
  try {
    const output = execGit(cwd, 'rev-list --all --count')
    return parseInt(output, 10) || 0
  } catch {
    return 0
  }
}

/**
 * Parse git log output into GitLogCommit objects
 */
export function parseGitLog(
  output: string,
  branches: string[],
  tags: string[]
): import('~/types/git').GitLogCommit[] {
  if (!output.trim()) return []

  const branchTips = new Map<string, string>()
  const tagTips = new Map<string, string>()

  // We would need to resolve branch/tag tips to hashes for decoration
  // For now, return commits without decorations (they can be added later)

  return output.split('\n').filter(Boolean).map(line => {
    const [hash, shortHash, author, email, timestamp, message, parentHashes] = line.split('|')
    const parents = parentHashes ? parentHashes.split(' ').filter(Boolean) : []

    return {
      hash,
      shortHash,
      author,
      email,
      timestamp: parseInt(timestamp, 10),
      message,
      parents,
      branches: [], // Decorations added separately
      tags: []
    }
  })
}

/**
 * Get commit detail (synchronous)
 */
export function getCommitDetailSync(
  cwd: string,
  hash: string
): import('~/types/git').GitShowCommit | null {
  try {
    const output = execGit(cwd, `show -s --format="%H|%h|%an|%ae|%at|%s|%b|%P" ${hash}`)
    if (!output.trim()) return null

    const [commitHash, shortHash, author, email, timestamp, message, body, parentHashes] = output.split('|')
    const parents = parentHashes ? parentHashes.trim().split(' ').filter(Boolean) : []

    return {
      hash: commitHash,
      shortHash,
      author,
      email,
      timestamp: parseInt(timestamp, 10),
      message,
      body: body || '',
      parents
    }
  } catch {
    return null
  }
}

/**
 * Get files changed in a commit (synchronous)
 */
export function getCommitFiles(
  cwd: string,
  hash: string
): import('~/types/git').GitShowFile[] {
  try {
    // Use --root to handle initial commits (no parent), -M for rename detection
    const numstatOutput = execGit(cwd, `diff-tree --root --no-commit-id --numstat -r -M ${hash}`)
    const statusOutput = execGit(cwd, `diff-tree --root --no-commit-id --name-status -r -M ${hash}`)

    if (!numstatOutput.trim()) return []

    // Build status map from --name-status output
    const statusMap = new Map<string, { status: string; oldPath?: string }>()
    for (const line of statusOutput.split('\n').filter(Boolean)) {
      const parts = line.split('\t')
      const statusCode = parts[0][0] // First char: A, M, D, R, C, etc.
      if (statusCode === 'R' || statusCode === 'C') {
        // Rename/Copy: status\toldPath\tnewPath
        statusMap.set(parts[2], { status: statusCode, oldPath: parts[1] })
      } else {
        statusMap.set(parts[1], { status: statusCode })
      }
    }

    return numstatOutput.split('\n').filter(Boolean).map(line => {
      const parts = line.split('\t')
      const addStr = parts[0]
      const delStr = parts[1]
      const isBinary = addStr === '-' && delStr === '-'
      const additions = isBinary ? 0 : parseInt(addStr, 10)
      const deletions = isBinary ? 0 : parseInt(delStr, 10)

      // For renames, numstat shows: add\tdel\toldPath => newPath  OR  add\tdel\t{old => new}
      // With -M flag: add\tdel\toldPath\tnewPath (4 fields for renames)
      let filePath: string
      if (parts.length >= 4) {
        // Rename: oldPath\tnewPath in numstat
        filePath = parts[3]
      } else {
        filePath = parts[2]
      }

      const info = statusMap.get(filePath)

      return {
        path: filePath,
        oldPath: info?.oldPath,
        status: (info?.status || 'M') as FileChangeStatus,
        additions,
        deletions,
        binary: isBinary,
      }
    })
  } catch {
    return []
  }
}

/**
 * Get commit stats (synchronous)
 */
export function getCommitStats(
  cwd: string,
  hash: string
): import('~/types/git').GitShowStats {
  try {
    // Use --root to handle initial commits (no parent)
    const output = execGit(cwd, `diff-tree --root --no-commit-id --shortstat ${hash}`)
    if (!output.trim()) return { filesChanged: 0, additions: 0, deletions: 0 }

    // Parse "3 files changed, 10 insertions(+), 5 deletions(-)"
    const filesMatch = output.match(/(\d+) files? changed/)
    const addMatch = output.match(/(\d+) insertions?\(\+\)/)
    const delMatch = output.match(/(\d+) deletions?\(-\)/)

    return {
      filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      additions: addMatch ? parseInt(addMatch[1], 10) : 0,
      deletions: delMatch ? parseInt(delMatch[1], 10) : 0
    }
  } catch {
    return { filesChanged: 0, additions: 0, deletions: 0 }
  }
}

/**
 * Get HEAD commit hash (synchronous)
 */
export function getHeadCommit(cwd: string): string {
  try {
    return execGit(cwd, 'rev-parse HEAD')
  } catch {
    return ''
  }
}

/**
 * Get a hash of the branch list for change detection (synchronous)
 */
export function getBranchListHash(cwd: string): string {
  try {
    const output = execGit(cwd, "for-each-ref --format='%(refname):%(objectname)' refs/heads refs/remotes")
    // Simple hash: use the output itself or hash it
    // For simplicity, we'll use a basic string hash
    let hash = 0
    for (let i = 0; i < output.length; i++) {
      const char = output.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16)
  } catch {
    return ''
  }
}

/**
 * Get count of uncommitted files (synchronous)
 */
export function getUncommittedFileCount(cwd: string): number {
  try {
    const output = execGit(cwd, 'status --porcelain')
    if (!output.trim()) return 0
    return output.split('\n').filter(Boolean).length
  } catch {
    return 0
  }
}

/**
 * Get a hash representing the current working tree/staging state.
 * Uses porcelain status output to detect changes even when file count is unchanged.
 */
export function getWorkingTreeHash(cwd: string): string {
  try {
    const output = execGit(cwd, 'status --porcelain')
    return hashString(output)
  } catch {
    return ''
  }
}

/**
 * Get a hash representing the current stash list.
 */
export function getStashListHash(cwd: string): string {
  try {
    const output = execGit(cwd, "stash list --pretty=format:%gd:%H")
    return hashString(output)
  } catch {
    return ''
  }
}

function hashString(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash).toString(16)
}

// =============================================================================
// Branch Operations (FR-023 to FR-032)
// =============================================================================

/**
 * Rename a branch (FR-024)
 */
export function renameBranch(cwd: string, oldName: string, newName: string): string {
  return execGitArgs(cwd, ['branch', '-m', oldName, newName])
}

/**
 * Merge a branch into current (FR-026)
 */
export function mergeBranch(
  cwd: string,
  branch: string,
  options: { noCommit?: boolean; noFastForward?: boolean; squash?: boolean } = {}
): string {
  const args = ['merge']
  if (options.noCommit) args.push('--no-commit')
  if (options.noFastForward) args.push('--no-ff')
  if (options.squash) args.push('--squash')
  args.push(branch)
  return execGitArgs(cwd, args)
}

/**
 * Rebase current branch onto target (FR-027)
 */
export function rebaseBranch(cwd: string, onto: string): string {
  return execGitArgs(cwd, ['rebase', onto])
}

/**
 * Push branch to remote (FR-028)
 */
export function pushBranch(
  cwd: string,
  branch: string,
  options: { remote?: string; force?: boolean; forceWithLease?: boolean } = {}
): string {
  const args = ['push']
  if (options.force) args.push('--force')
  if (options.forceWithLease) args.push('--force-with-lease')
  args.push(options.remote || 'origin')
  args.push(branch)
  return execGitArgs(cwd, args)
}

/**
 * Pull branch from remote (FR-029)
 */
export function pullBranch(
  cwd: string,
  options: { branch?: string; remote?: string; noFastForward?: boolean; squash?: boolean } = {}
): string {
  const args = ['pull']
  if (options.noFastForward) args.push('--no-ff')
  if (options.squash) args.push('--squash')
  if (options.remote) args.push(options.remote)
  if (options.branch) args.push(options.branch)
  return execGitArgs(cwd, args)
}

/**
 * Fetch from remote (FR-030, FR-075)
 */
export function fetchBranch(
  cwd: string,
  options: { branch?: string; remote?: string; force?: boolean; all?: boolean; prune?: boolean; pruneTags?: boolean } = {}
): string {
  const args = ['fetch']
  if (options.all) args.push('--all')
  if (options.prune) args.push('--prune')
  if (options.pruneTags) args.push('--prune-tags')
  if (options.force) args.push('--force')
  if (!options.all && options.remote) args.push(options.remote)
  if (!options.all && options.branch) args.push(options.branch)
  return execGitArgs(cwd, args)
}

// =============================================================================
// Commit Operations (FR-033 to FR-039)
// =============================================================================

/**
 * Cherry-pick a commit (FR-034)
 */
export function cherryPick(
  cwd: string,
  hash: string,
  options: { recordOrigin?: boolean; noCommit?: boolean } = {}
): string {
  const args = ['cherry-pick']
  if (options.recordOrigin) args.push('-x')
  if (options.noCommit) args.push('--no-commit')
  args.push(hash)
  return execGitArgs(cwd, args)
}

/**
 * Revert a commit (FR-035)
 */
export function revertCommit(cwd: string, hash: string): string {
  return execGitArgs(cwd, ['revert', '--no-edit', hash])
}

/**
 * Reset current branch to a commit (FR-037)
 */
export function resetBranch(cwd: string, hash: string, mode: 'soft' | 'mixed' | 'hard'): string {
  return execGitArgs(cwd, ['reset', `--${mode}`, hash])
}

/**
 * Remove untracked files/directories from working tree.
 */
export function cleanUntrackedFiles(cwd: string): string {
  return execGitArgs(cwd, ['clean', '-fd'])
}

/**
 * Get diff between two commits or working tree (FR-021, FR-022)
 */
export function getDiff(
  cwd: string,
  from: string,
  to: string
): { files: Array<{ path: string; oldPath?: string; status: string; additions: number; deletions: number; binary: boolean }>; stats: { filesChanged: number; additions: number; deletions: number } } {
  // Get file list with status
  const nameStatusOutput = execGitArgs(cwd, ['diff', '--name-status', from, to])
  const numstatOutput = execGitArgs(cwd, ['diff', '--numstat', from, to])

  const files: Array<{ path: string; oldPath?: string; status: string; additions: number; deletions: number; binary: boolean }> = []
  const numstatMap = new Map<string, { additions: number; deletions: number; binary: boolean }>()

  if (numstatOutput.trim()) {
    for (const line of numstatOutput.split('\n').filter(Boolean)) {
      const [addStr, delStr, ...pathParts] = line.split('\t')
      const path = pathParts.join('\t')
      const additions = addStr === '-' ? 0 : parseInt(addStr, 10)
      const deletions = delStr === '-' ? 0 : parseInt(delStr, 10)
      const binary = addStr === '-' && delStr === '-'
      numstatMap.set(path, { additions, deletions, binary })
    }
  }

  if (nameStatusOutput.trim()) {
    for (const line of nameStatusOutput.split('\n').filter(Boolean)) {
      const [status, ...pathParts] = line.split('\t')
      let path = pathParts.join('\t')
      let oldPath: string | undefined

      if (status.startsWith('R') || status.startsWith('C')) {
        const [from, to] = path.split('\t')
        oldPath = from
        path = to
      }

      const stat = numstatMap.get(path) || { additions: 0, deletions: 0, binary: false }
      files.push({
        path,
        oldPath,
        status: status.charAt(0),
        additions: stat.additions,
        deletions: stat.deletions,
        binary: stat.binary,
      })
    }
  }

  const stats = {
    filesChanged: files.length,
    additions: files.reduce((sum, f) => sum + f.additions, 0),
    deletions: files.reduce((sum, f) => sum + f.deletions, 0),
  }

  return { files, stats }
}

/**
 * Get unified diff for a specific file in a commit (FR-094)
 * Returns parsed diff lines with line numbers
 */
export function getFileDiff(
  cwd: string,
  commitHash: string,
  filePath: string,
  parentHash?: string
): { filePath: string; oldPath?: string; status: string; binary: boolean; lines: Array<{ type: 'add' | 'delete' | 'context' | 'header'; content: string; oldLineNumber?: number; newLineNumber?: number }>; truncated: boolean } {
  const MAX_LINES = 10000

  // Determine the diff command based on whether this is the initial commit
  let diffOutput: string
  try {
    if (parentHash) {
      diffOutput = execGitArgs(cwd, ['diff', `${parentHash}...${commitHash}`, '--', filePath])
    } else {
      // Check if commit has parents
      let parents: string
      try {
        parents = execGitArgs(cwd, ['rev-parse', `${commitHash}^`])
      } catch {
        // Initial commit — diff against empty tree
        parents = ''
      }

      if (parents) {
        diffOutput = execGitArgs(cwd, ['diff', `${commitHash}^`, commitHash, '--', filePath])
      } else {
        // Initial commit: diff against empty tree
        diffOutput = execGitArgs(cwd, ['diff', '--root', commitHash, '--', filePath])
      }
    }
  } catch {
    diffOutput = ''
  }

  // Get file status
  let status = 'M'
  let oldPath: string | undefined
  try {
    const nameStatusArgs = parentHash
      ? ['diff', '--name-status', '-M', `${parentHash}...${commitHash}`, '--', filePath]
      : ['diff-tree', '--name-status', '-M', '-r', '--root', commitHash, '--', filePath]
    const nameStatusOutput = execGitArgs(cwd, nameStatusArgs)
    if (nameStatusOutput.trim()) {
      const firstLine = nameStatusOutput.trim().split('\n')[0]
      const [statusCode, ...pathParts] = firstLine.split('\t')
      status = statusCode.charAt(0)
      if ((status === 'R' || status === 'C') && pathParts.length >= 2) {
        oldPath = pathParts[0]
      }
    }
  } catch {
    // Keep default status 'M'
  }

  // Check for binary
  const isBinary = diffOutput.includes('Binary files') || diffOutput.includes('GIT binary patch')

  if (isBinary) {
    return { filePath, oldPath, status, binary: true, lines: [], truncated: false }
  }

  // Parse unified diff output into lines
  const lines: Array<{ type: 'add' | 'delete' | 'context' | 'header'; content: string; oldLineNumber?: number; newLineNumber?: number }> = []
  let truncated = false

  if (diffOutput.trim()) {
    const diffLines = diffOutput.split('\n')
    let oldLineNum = 0
    let newLineNum = 0

    for (const line of diffLines) {
      if (lines.length >= MAX_LINES) {
        truncated = true
        break
      }

      // Skip diff metadata headers (diff --git, index, ---, +++ lines)
      if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
        continue
      }

      // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        if (match) {
          oldLineNum = parseInt(match[1], 10)
          newLineNum = parseInt(match[2], 10)
        }
        lines.push({ type: 'header', content: line })
        continue
      }

      if (line.startsWith('+')) {
        lines.push({ type: 'add', content: line.substring(1), newLineNumber: newLineNum })
        newLineNum++
      } else if (line.startsWith('-')) {
        lines.push({ type: 'delete', content: line.substring(1), oldLineNumber: oldLineNum })
        oldLineNum++
      } else if (line.startsWith(' ') || line === '') {
        // Context line (starts with space) or empty trailing line
        const content = line.startsWith(' ') ? line.substring(1) : line
        lines.push({ type: 'context', content, oldLineNumber: oldLineNum, newLineNumber: newLineNum })
        oldLineNum++
        newLineNum++
      } else if (line.startsWith('\\')) {
        // "\ No newline at end of file" — skip
        continue
      }
    }
  }

  return { filePath, oldPath, status, binary: false, lines, truncated }
}

// =============================================================================
// Tag Operations (FR-040 to FR-044)
// =============================================================================

/**
 * Create a tag (FR-040)
 */
export function createTag(
  cwd: string,
  name: string,
  hash: string,
  options: { annotated?: boolean; message?: string } = {}
): string {
  const args = ['tag']
  if (options.annotated && options.message) {
    args.push('-a', name, '-m', options.message, hash)
  } else {
    args.push(name, hash)
  }
  return execGitArgs(cwd, args)
}

/**
 * Delete a tag locally (FR-041)
 */
export function deleteTag(cwd: string, name: string): string {
  return execGitArgs(cwd, ['tag', '-d', name])
}

/**
 * Delete a tag from remote
 */
export function deleteRemoteTag(cwd: string, name: string, remote: string = 'origin'): string {
  return execGitArgs(cwd, ['push', remote, '--delete', `refs/tags/${name}`])
}

/**
 * Push a tag to remote (FR-042)
 */
export function pushTag(cwd: string, name: string, remote: string = 'origin'): string {
  return execGitArgs(cwd, ['push', remote, `refs/tags/${name}`])
}

/**
 * Get tag details (FR-043)
 */
export function getTagDetail(cwd: string, name: string): {
  name: string
  hash: string
  isAnnotated: boolean
  tagger?: { name: string; email: string; date: string }
  message?: string
} {
  // Check if tag exists and get its target
  const hash = execGitArgs(cwd, ['rev-list', '-n', '1', `refs/tags/${name}`])

  // Try to get annotated tag info
  try {
    const tagType = execGitArgs(cwd, ['cat-file', '-t', `refs/tags/${name}`])
    if (tagType === 'tag') {
      const tagInfo = execGitArgs(cwd, ['tag', '-v', name]).replace(/^.*-----BEGIN PGP SIGNATURE-----[\s\S]*$/, '')
      const taggerMatch = tagInfo.match(/Tagger:\s+(.+)\s+<(.+)>/)
      const dateMatch = tagInfo.match(/Date:\s+(.+)/)
      // Message is everything after the blank line following the header
      const messageParts = tagInfo.split('\n\n')
      const message = messageParts.length > 1 ? messageParts.slice(1).join('\n\n').trim() : undefined

      return {
        name,
        hash,
        isAnnotated: true,
        tagger: taggerMatch ? { name: taggerMatch[1], email: taggerMatch[2], date: dateMatch?.[1] || '' } : undefined,
        message,
      }
    }
  } catch {
    // Not an annotated tag or tag -v failed, fall through
  }

  // Lightweight tag
  return { name, hash, isAnnotated: false }
}

// =============================================================================
// Stash Operations (FR-045 to FR-051)
// =============================================================================

/**
 * List stashes (FR-045)
 */
export function listStashes(cwd: string): Array<{
  hash: string
  index: number
  message: string
  date: string
  branchName: string
}> {
  try {
    const output = execGitArgs(cwd, ['stash', 'list', '--format=%H|%gd|%gs|%ai'])
    if (!output.trim()) return []

    return output.split('\n').filter(Boolean).map(line => {
      const [hash, refName, message, date] = line.split('|')
      const indexMatch = refName.match(/\{(\d+)\}/)
      const index = indexMatch ? parseInt(indexMatch[1], 10) : 0
      // Extract branch name from "WIP on main: ..." or "On main: ..."
      const branchMatch = message.match(/(?:WIP on|On)\s+([^:]+):/)
      const branchName = branchMatch ? branchMatch[1] : ''

      return { hash, index, message, date, branchName }
    })
  } catch {
    return []
  }
}

/**
 * Create a stash (FR-050)
 */
export function createStash(
  cwd: string,
  options: { message?: string; includeUntracked?: boolean } = {}
): string {
  const args = ['stash', 'push']
  if (options.includeUntracked) args.push('--include-untracked')
  if (options.message) args.push('-m', options.message)
  return execGitArgs(cwd, args)
}

/**
 * Apply a stash (FR-046)
 */
export function applyStash(cwd: string, index: number, reinstateIndex: boolean = false): string {
  const args = ['stash', 'apply']
  if (reinstateIndex) args.push('--index')
  args.push(`stash@{${index}}`)
  return execGitArgs(cwd, args)
}

/**
 * Pop a stash (FR-047)
 */
export function popStash(cwd: string, index: number, reinstateIndex: boolean = false): string {
  const args = ['stash', 'pop']
  if (reinstateIndex) args.push('--index')
  args.push(`stash@{${index}}`)
  return execGitArgs(cwd, args)
}

/**
 * Drop a stash (FR-048)
 */
export function dropStash(cwd: string, index: number): string {
  return execGitArgs(cwd, ['stash', 'drop', `stash@{${index}}`])
}

/**
 * Create a branch from a stash (FR-049)
 */
export function stashBranch(cwd: string, branchName: string, index: number): string {
  return execGitArgs(cwd, ['stash', 'branch', branchName, `stash@{${index}}`])
}

// =============================================================================
// Remote Operations (FR-074 to FR-076)
// =============================================================================

/**
 * List all remotes with URLs (FR-074)
 */
export function listRemotes(cwd: string): Array<{ name: string; fetchUrl: string; pushUrl: string }> {
  try {
    const output = execGitArgs(cwd, ['remote', '-v'])
    if (!output.trim()) return []

    const remoteMap = new Map<string, { fetchUrl: string; pushUrl: string }>()

    for (const line of output.split('\n').filter(Boolean)) {
      const [name, url, type] = line.split(/\s+/)
      if (!remoteMap.has(name)) {
        remoteMap.set(name, { fetchUrl: url, pushUrl: url })
      }
      const remote = remoteMap.get(name)!
      if (type === '(fetch)') remote.fetchUrl = url
      if (type === '(push)') remote.pushUrl = url
    }

    return Array.from(remoteMap.entries()).map(([name, urls]) => ({
      name,
      fetchUrl: urls.fetchUrl,
      pushUrl: urls.pushUrl,
    }))
  } catch {
    return []
  }
}

/**
 * Add a remote (FR-076)
 */
export function addRemote(cwd: string, name: string, url: string): string {
  return execGitArgs(cwd, ['remote', 'add', name, url])
}

/**
 * Edit a remote URL (FR-076)
 */
export function editRemote(cwd: string, name: string, newUrl: string): string {
  return execGitArgs(cwd, ['remote', 'set-url', name, newUrl])
}

/**
 * Delete a remote (FR-076)
 */
export function deleteRemote(cwd: string, name: string): string {
  return execGitArgs(cwd, ['remote', 'remove', name])
}

/**
 * Fetch all remotes (FR-075)
 */
export function fetchAll(cwd: string, options: { prune?: boolean; pruneTags?: boolean } = {}): string {
  const args = ['fetch', '--all']
  if (options.prune) args.push('--prune')
  if (options.pruneTags) args.push('--prune-tags')
  return execGitArgs(cwd, args)
}
