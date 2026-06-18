/**
 * Auto-commit service.
 * Stages working-tree changes and commits them with a deterministic, AI-free
 * commit message derived from staged git metadata.
 */

import { execSync } from 'node:child_process'
import { logger } from './logger'

/**
 * Execute a git command in a specific directory
 */
function execGit(cwd: string, args: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8' }).trim()
}

/**
 * Infer a conventional-commit type from the set of changed file paths.
 * Falls back to "chore" when nothing more specific can be determined.
 */
function inferCommitType(paths: string[]): string {
  if (paths.length === 0) return 'chore'

  const isDoc = (p: string) => /\.(md|mdx|txt)$/i.test(p) || /(^|\/)docs?\//i.test(p)
  const isTest = (p: string) => /\.(test|spec)\.[cm]?[jt]sx?$/i.test(p) || /(^|\/)(tests?|__tests__)\//i.test(p)
  const isConfig = (p: string) =>
    /(^|\/)(package\.json|pnpm-lock\.yaml|tsconfig.*\.json|.*\.config\.[cm]?[jt]s|\.[^/]+rc(\.[a-z]+)?)$/i.test(p)

  if (paths.every(isDoc)) return 'docs'
  if (paths.every(isTest)) return 'test'
  if (paths.every(isConfig)) return 'chore'
  return 'feat'
}

/**
 * Derive a short scope from the changed paths (common top-level directory).
 * Prefers an explicit featureId when provided.
 */
function inferScope(featureId: string | undefined, paths: string[]): string | undefined {
  if (featureId) return featureId
  if (paths.length === 0) return undefined

  const topDirs = new Set(
    paths.map((p) => {
      const idx = p.indexOf('/')
      return idx === -1 ? p : p.slice(0, idx)
    }),
  )
  return topDirs.size === 1 ? [...topDirs][0] : undefined
}

/**
 * Generate a deterministic commit message from staged git metadata (no AI).
 *
 * @param nameStatus output of `git diff --cached --name-status`
 * @param diffStat   output of `git diff --cached --stat`
 */
function generateDeterministicCommitMessage(
  featureId: string | undefined,
  nameStatus: string,
  diffStat: string,
): string {
  const entries = nameStatus
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split(/\s+/)
      // Renames look like "R100\told\tnew"; keep the destination path.
      return { status: status[0], path: rest[rest.length - 1] }
    })

  const paths = entries.map((e) => e.path)
  const fileCount = paths.length || (diffStat.match(/(\d+) files? changed/)?.[1] ?? '0')

  const type = inferCommitType(paths)
  const scope = inferScope(featureId, paths)
  const prefix = scope ? `${type}(${scope})` : type

  const added = entries.filter((e) => e.status === 'A').length
  const modified = entries.filter((e) => e.status === 'M').length
  const deleted = entries.filter((e) => e.status === 'D').length
  const parts: string[] = []
  if (added) parts.push(`${added} added`)
  if (modified) parts.push(`${modified} modified`)
  if (deleted) parts.push(`${deleted} deleted`)
  const summary = parts.length > 0 ? parts.join(', ') : `${fileCount} files changed`

  let subject = `${prefix}: ${summary}`
  if (subject.length > 72) subject = subject.slice(0, 69) + '...'

  // Body: list up to 10 changed files for traceability.
  const body = entries.slice(0, 10).map((e) => `- ${e.status} ${e.path}`)
  if (entries.length > 10) body.push(`- ...and ${entries.length - 10} more`)

  return body.length > 0 ? `${subject}\n\n${body.join('\n')}` : subject
}

/**
 * Auto-commit changes in a worktree
 */
export async function autoCommitChanges(
  worktreePath: string,
  featureId?: string,
  options?: { pathspecs?: string[] },
): Promise<{ success: boolean; message?: string; currentBranch?: string; error?: string }> {
  try {
    // Detect current branch (may have changed during AI execution)
    const currentBranch = execGit(worktreePath, 'rev-parse --abbrev-ref HEAD')

    const status = execGit(worktreePath, 'status --porcelain')
    if (!status.trim()) {
      return { success: true, message: 'No changes to commit', currentBranch }
    }

    if (options?.pathspecs && options.pathspecs.length > 0) {
      execGit(worktreePath, `add -A -- ${options.pathspecs.join(' ')}`)
    } else {
      execGit(worktreePath, 'add -A')
    }

    const staged = execGit(worktreePath, 'diff --cached --name-only')
    if (!staged.trim()) {
      return { success: true, message: 'No changes to commit', currentBranch }
    }

    const nameStatus = execGit(worktreePath, 'diff --cached --name-status')
    const diff = execGit(worktreePath, 'diff --cached --stat')

    // Commit messages are derived deterministically from staged git metadata
    // (no AI subprocess) to keep auto-commit fast and offline.
    const commitMessage = generateDeterministicCommitMessage(featureId, nameStatus, diff)

    // Use stdin (-F -) to safely handle messages starting with "-" or containing special characters
    execSync('git commit -F -', { cwd: worktreePath, input: commitMessage, encoding: 'utf-8' })

    logger.chat.info('Auto-commit successful', { featureId, commitMessage: commitMessage.split('\n')[0], currentBranch })
    return { success: true, message: commitMessage.split('\n')[0], currentBranch }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.chat.error('Auto-commit failed', { featureId, error: errorMessage })
    return { success: false, error: errorMessage }
  }
}
