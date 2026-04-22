import { execGitCommand } from './gitExec'

const DEFAULT_BRANCH_CANDIDATES = ['main', 'master']
const WORKTREE_BRANCH_PREFIX = 'sc/'
const COMMIT_HASH_RE = /^[0-9a-f]{7,40}$/i

export function isCommitHashLike(value: string | null | undefined): value is string {
  return typeof value === 'string' && COMMIT_HASH_RE.test(value.trim())
}

export function isWorktreeBranch(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(WORKTREE_BRANCH_PREFIX)
}

export function isUsableBaseBranchName(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false
  const branch = value.trim()
  return branch.length > 0 && branch !== 'HEAD' && !isWorktreeBranch(branch) && !isCommitHashLike(branch)
}

async function listLocalBranches(cwd: string): Promise<string[]> {
  try {
    const output = await execGitCommand(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], cwd)
    return output
      .split('\n')
      .map(branch => branch.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

async function branchExists(cwd: string, branch: string): Promise<boolean> {
  try {
    await execGitCommand(['rev-parse', '--verify', `refs/heads/${branch}^{commit}`], cwd)
    return true
  } catch {
    return false
  }
}

async function getHeadHash(cwd: string): Promise<string | null> {
  try {
    return await execGitCommand(['rev-parse', 'HEAD'], cwd)
  } catch {
    return null
  }
}

async function getBranchesPointingAt(cwd: string, ref: string): Promise<string[]> {
  try {
    const output = await execGitCommand(['for-each-ref', '--format=%(refname:short)', '--points-at', ref, 'refs/heads'], cwd)
    return output
      .split('\n')
      .map(branch => branch.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function detectDefaultBranch(cwd: string): Promise<string | null> {
  try {
    const ref = await execGitCommand(['symbolic-ref', 'refs/remotes/origin/HEAD'], cwd)
    const branch = ref.replace('refs/remotes/origin/', '').trim()
    if (isUsableBaseBranchName(branch) && await branchExists(cwd, branch)) {
      return branch
    }
  } catch {
    // No origin/HEAD configured.
  }

  for (const name of DEFAULT_BRANCH_CANDIDATES) {
    if (await branchExists(cwd, name)) {
      return name
    }
  }

  return null
}

export async function resolvePreferredBaseBranch(cwd: string): Promise<string | null> {
  try {
    const currentBranch = await execGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
    if (isUsableBaseBranchName(currentBranch) && await branchExists(cwd, currentBranch)) {
      return currentBranch
    }
  } catch {
    // Fall through to detached/default branch detection.
  }

  const defaultBranch = await detectDefaultBranch(cwd)
  const headHash = await getHeadHash(cwd)
  if (headHash) {
    const matchingBranches = (await getBranchesPointingAt(cwd, headHash))
      .filter(branch => isUsableBaseBranchName(branch))

    if (defaultBranch && matchingBranches.includes(defaultBranch)) {
      return defaultBranch
    }
    if (matchingBranches.length === 1) {
      return matchingBranches[0]
    }
    if (matchingBranches.length > 0) {
      return matchingBranches[0]
    }
  }

  return defaultBranch
}

export async function resolveConversationBaseBranch(options: {
  cwd: string
  storedBaseBranch?: string | null
  worktreeBranch?: string | null
}): Promise<string | null> {
  const { cwd, storedBaseBranch, worktreeBranch } = options
  const branch = storedBaseBranch?.trim() || ''

  if (isUsableBaseBranchName(branch) && await branchExists(cwd, branch)) {
    return branch
  }

  if (isCommitHashLike(branch) && isUsableBaseBranchName(worktreeBranch) && await branchExists(cwd, worktreeBranch)) {
    const defaultBranch = await detectDefaultBranch(cwd)
    const candidates = (await listLocalBranches(cwd))
      .filter(candidate => isUsableBaseBranchName(candidate) && candidate !== worktreeBranch)

    const matches: string[] = []
    for (const candidate of candidates) {
      try {
        const mergeBase = await execGitCommand(['merge-base', candidate, worktreeBranch], cwd)
        if (mergeBase === branch) {
          matches.push(candidate)
        }
      } catch {
        // Ignore branches that do not share a merge-base.
      }
    }

    if (defaultBranch && matches.includes(defaultBranch)) {
      return defaultBranch
    }
    if (matches.length > 0) {
      return matches[0]
    }
  }

  return resolvePreferredBaseBranch(cwd)
}
