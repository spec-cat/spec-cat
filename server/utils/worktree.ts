import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { projectWorktreeRoot } from './project-dir'
import { PROTECTED_BRANCHES } from './branch-follow'

const execFileAsync = promisify(execFile)
export const WORKTREE_ROOT = projectWorktreeRoot()
const MANAGED_BRANCH_PATTERN = /^sc\/[a-zA-Z0-9_-]{8,120}$/
// A conversation whose worktree switched branches (a speckit step creating
// `042-feature`) owns that branch from then on, so teardown must be able to
// remove it. Anything shared — a protected trunk or the sc/preview ref — stays
// off-limits.
const FOLLOWED_BRANCH_PATTERN = /^[a-zA-Z0-9._][a-zA-Z0-9._/-]{0,199}$/

/**
 * True when a branch may be deleted as part of tearing a conversation down:
 * either the `sc/<id>` branch the worktree was provisioned on, or a branch the
 * conversation later adopted (see branch-follow.ts).
 */
export function isDeletableSessionBranch(branch: string) {
  if (MANAGED_BRANCH_PATTERN.test(branch)) return true
  if (branch.startsWith('sc/')) return false
  return FOLLOWED_BRANCH_PATTERN.test(branch) && !PROTECTED_BRANCHES.has(branch)
}

export type ManagedWorktree = {
  projectDir: string
  worktreePath: string
  branch: string
  baseBranch: string
}

export async function createSessionWorktree(
  projectDir: string,
  sessionId: string,
  requestedBaseBranch?: string,
  featureId?: string
): Promise<ManagedWorktree> {
  const branch = sessionWorktreeBranch(sessionId, featureId)
  const worktreePath = join(WORKTREE_ROOT, `sc-${sessionId}`)
  const baseBranch = requestedBaseBranch
    ? await resolveRequestedBaseBranch(projectDir, requestedBaseBranch)
    : await resolveBaseBranch(projectDir)

  if (!baseBranch) {
    throw new Error('Unable to resolve a base branch. The project must be a git repository with a local branch.')
  }

  await mkdir(WORKTREE_ROOT, { recursive: true })
  const { stdout } = await git(projectDir, ['rev-parse', '--verify', `refs/heads/${baseBranch}^{commit}`])
  const baseCommit = stdout.trim()
  await git(projectDir, ['worktree', 'add', '-b', branch, worktreePath, baseCommit])

  return { projectDir, worktreePath, branch, baseBranch }
}

/** Spec-created conversations use the spec directory name as their branch. */
export function sessionWorktreeBranch(sessionId: string, featureId?: string) {
  if (!featureId) return `sc/${sessionId}`
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(featureId)) {
    throw new Error(`Invalid spec feature id for branch: ${featureId}`)
  }
  if (PROTECTED_BRANCHES.has(featureId) || featureId.startsWith('sc/')) {
    throw new Error(`Refusing to use protected branch for spec: ${featureId}`)
  }
  return featureId
}

async function resolveRequestedBaseBranch(projectDir: string, branch: string) {
  const normalized = branch.trim()
  if (!/^(?!-)[a-zA-Z0-9._/-]+$/.test(normalized) || normalized.startsWith('sc/')) {
    throw new Error('Invalid base branch')
  }
  return await localBranchExists(projectDir, normalized) ? normalized : null
}

/**
 * Recreates a managed worktree from an existing sc/<sessionId> branch, for
 * example when restoring an archived conversation whose branch was kept.
 */
export async function restoreSessionWorktree(
  projectDir: string,
  sessionId: string,
  sessionBranch?: string
) {
  const branch = sessionBranch || `sc/${sessionId}`
  const worktreePath = join(WORKTREE_ROOT, `sc-${sessionId}`)

  if (!await localBranchExists(projectDir, branch)) {
    throw new Error(`Branch ${branch} no longer exists`)
  }

  await mkdir(WORKTREE_ROOT, { recursive: true })
  await git(projectDir, ['worktree', 'add', worktreePath, branch])

  return { projectDir, worktreePath, branch }
}

/**
 * Recreates both the branch ref and worktree at an archived branch's tip.
 * The provider conversation keeps the same session id, while its restored git
 * runtime is newly provisioned instead of attaching to an old worktree.
 */
export async function recreateSessionWorktree(
  projectDir: string,
  sessionId: string,
  sessionBranch?: string
) {
  const branch = sessionBranch || `sc/${sessionId}`
  const worktreePath = join(WORKTREE_ROOT, `sc-${sessionId}`)

  if (!await localBranchExists(projectDir, branch)) {
    throw new Error(`Branch ${branch} no longer exists`)
  }

  const { stdout } = await git(projectDir, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`])
  const archivedTip = stdout.trim()
  await git(projectDir, ['branch', '-D', branch])
  try {
    await mkdir(WORKTREE_ROOT, { recursive: true })
    await git(projectDir, ['worktree', 'add', '-b', branch, worktreePath, archivedTip])
  } catch (error) {
    // Keep the archived work reachable even if provisioning the worktree fails.
    if (!await localBranchExists(projectDir, branch)) {
      await git(projectDir, ['branch', branch, archivedTip]).catch(() => {})
    }
    throw error
  }

  return { projectDir, worktreePath, branch }
}

export async function deleteSessionWorktree(worktree: {
  projectDir: string
  worktreePath: string
  branch: string
  // Keeps the sc/<id> branch so the session's work survives (archiving).
  keepBranch?: boolean
}) {
  assertManagedWorktreePath(worktree.worktreePath)

  if (!isDeletableSessionBranch(worktree.branch)) {
    throw new Error(`Refusing to remove unmanaged branch: ${worktree.branch}`)
  }

  try {
    await git(worktree.projectDir, ['worktree', 'remove', worktree.worktreePath, '--force'])
  } catch {
    await rm(worktree.worktreePath, { recursive: true, force: true })
  }

  await git(worktree.projectDir, ['worktree', 'prune'])
  if (!worktree.keepBranch) {
    await git(worktree.projectDir, ['branch', '-D', worktree.branch])
  }
}

/** Lists directory names under the managed worktree root (empty when absent). */
export async function listManagedWorktreeDirNames(): Promise<string[]> {
  try {
    const entries = await readdir(WORKTREE_ROOT, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

/**
 * Removes a managed worktree directory that no longer belongs to a live
 * session (boot-time recovery). Prefers `git worktree remove --force` +
 * `git worktree prune` — resolving the owning repository from the worktree's
 * `.git` link when no projectDir is known — and falls back to deleting the
 * directory. Never touches branches: orphan branches may still hold work.
 */
export async function removeOrphanedWorktreeDir(dirName: string, projectDir?: string) {
  const worktreePath = join(WORKTREE_ROOT, dirName)
  assertManagedWorktreePath(worktreePath)

  const repoDir = projectDir || await resolveWorktreeProjectDir(worktreePath)
  if (repoDir) {
    try {
      await git(repoDir, ['worktree', 'remove', worktreePath, '--force'])
    } catch {
      await rm(worktreePath, { recursive: true, force: true })
    }
    await git(repoDir, ['worktree', 'prune']).catch(() => {})
    return
  }

  await rm(worktreePath, { recursive: true, force: true })
}

/** Reads the owning repository path from a worktree's `.git` link file. */
async function resolveWorktreeProjectDir(worktreePath: string) {
  try {
    const raw = await readFile(join(worktreePath, '.git'), 'utf8')
    const gitdir = /^gitdir:\s*(.+)$/m.exec(raw)?.[1]?.trim()
    if (!gitdir) return null
    const marker = gitdir.indexOf(`${sep}.git${sep}worktrees${sep}`)
    return marker > 0 ? gitdir.slice(0, marker) : null
  } catch {
    return null
  }
}

export async function deleteSessionBranch(projectDir: string, branch: string) {
  if (!isDeletableSessionBranch(branch)) {
    throw new Error(`Refusing to remove unmanaged branch: ${branch}`)
  }
  if (await localBranchExists(projectDir, branch)) {
    await git(projectDir, ['branch', '-D', branch])
  }
}

export function sessionBranchExists(projectDir: string, branch: string) {
  return localBranchExists(projectDir, branch)
}

async function resolveBaseBranch(projectDir: string) {
  const current = await gitOutput(projectDir, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (isBaseBranch(current) && await localBranchExists(projectDir, current)) return current

  const originHead = await gitOutput(projectDir, ['symbolic-ref', 'refs/remotes/origin/HEAD'])
  const remoteDefault = originHead.replace('refs/remotes/origin/', '')
  if (isBaseBranch(remoteDefault) && await localBranchExists(projectDir, remoteDefault)) return remoteDefault

  for (const candidate of ['main', 'master']) {
    if (await localBranchExists(projectDir, candidate)) return candidate
  }

  return null
}

async function localBranchExists(projectDir: string, branch: string) {
  try {
    await git(projectDir, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`])
    return true
  } catch {
    return false
  }
}

function isBaseBranch(branch: string) {
  return Boolean(branch && branch !== 'HEAD' && !branch.startsWith('sc/'))
}

async function gitOutput(cwd: string, args: string[]) {
  try {
    const { stdout } = await git(cwd, args)
    return stdout.trim()
  } catch {
    return ''
  }
}

function git(cwd: string, args: string[]) {
  return execFileAsync('git', args, { cwd, encoding: 'utf8' })
}

function assertManagedWorktreePath(path: string) {
  const root = `${resolve(WORKTREE_ROOT)}/`
  const target = resolve(path)
  if (!target.startsWith(root) || !/^sc-[a-zA-Z0-9_-]{8,120}$/.test(target.slice(root.length))) {
    throw new Error(`Refusing to remove unmanaged worktree path: ${path}`)
  }
}

export type WorktreeListEntry = {
  path: string
  head: string
  branch: string | null
  detached: boolean
  locked: boolean
  prunable: boolean
  bare: boolean
}

export type WorktreeDescription = WorktreeListEntry & {
  isMain: boolean
  managed: boolean
}

/** Root directory that holds this project's managed worktrees. */
export function getManagedWorktreeRoot() {
  return WORKTREE_ROOT
}

/**
 * Parses `git worktree list --porcelain` output. Entries are separated by
 * blank lines; the main worktree is always listed first by git.
 */
export function parseWorktreeList(output: string): WorktreeListEntry[] {
  const entries: WorktreeListEntry[] = []
  let current: WorktreeListEntry | null = null

  for (const rawLine of output.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (!line.trim()) {
      current = null
      continue
    }
    if (line.startsWith('worktree ')) {
      current = {
        path: line.slice('worktree '.length),
        head: '',
        branch: null,
        detached: false,
        locked: false,
        prunable: false,
        bare: false
      }
      entries.push(current)
      continue
    }
    if (!current) continue
    if (line.startsWith('HEAD ')) current.head = line.slice('HEAD '.length)
    else if (line.startsWith('branch ')) current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
    else if (line === 'detached') current.detached = true
    else if (line === 'bare') current.bare = true
    else if (line === 'locked' || line.startsWith('locked ')) current.locked = true
    else if (line === 'prunable' || line.startsWith('prunable ')) current.prunable = true
  }

  return entries
}

/**
 * Adds `isMain` (git lists the main worktree first) and `managed` (lives
 * directly under the managed tmp dir, or checks out an sc/ session branch).
 */
export function describeWorktrees(entries: WorktreeListEntry[], root: string = WORKTREE_ROOT): WorktreeDescription[] {
  return entries.map((entry, index) => ({
    ...entry,
    isMain: index === 0,
    managed: isManagedWorktreeChild(entry.path, root) || Boolean(entry.branch?.startsWith('sc/'))
  }))
}

/** True when `path` resolves to a direct child of the managed worktree root. */
export function isManagedWorktreeChild(path: string, root: string = WORKTREE_ROOT) {
  const base = resolve(root)
  const target = resolve(path)
  if (!target.startsWith(`${base}/`)) return false
  const name = target.slice(base.length + 1)
  return name.length > 0 && !name.includes('/')
}
