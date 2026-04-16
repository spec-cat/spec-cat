import { execGitArgs } from './gitExec'

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
