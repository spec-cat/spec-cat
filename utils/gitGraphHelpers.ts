import { FILE_STATUS_CONFIG } from '~/types/git'
import type { GitLogCommit } from '~/types/git'

export type FileStatusKey = keyof typeof FILE_STATUS_CONFIG

export function normalizeFileStatusKey(raw: string): FileStatusKey {
  const normalized = raw.charAt(0).toUpperCase() as FileStatusKey
  return normalized in FILE_STATUS_CONFIG ? normalized : 'M'
}

export function extractGitErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const maybeErr = err as {
      data?: { message?: unknown }
      statusMessage?: unknown
      message?: unknown
    }

    if (typeof maybeErr.data?.message === 'string' && maybeErr.data.message.trim()) {
      return maybeErr.data.message
    }
    if (typeof maybeErr.statusMessage === 'string' && maybeErr.statusMessage.trim()) {
      return maybeErr.statusMessage
    }
    if (typeof maybeErr.message === 'string' && maybeErr.message.trim()) {
      return maybeErr.message
    }
  }

  if (err instanceof Error && err.message) {
    return err.message
  }

  return fallback
}

export function filterCommitsByQuery(commits: readonly GitLogCommit[], query: string): GitLogCommit[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return [...commits]
  }

  return commits.filter(
    (commit) =>
      commit.message.toLowerCase().includes(normalizedQuery) ||
      commit.author.toLowerCase().includes(normalizedQuery) ||
      commit.shortHash.includes(normalizedQuery) ||
      commit.hash.includes(normalizedQuery) ||
      commit.branches.some((branch) => branch.toLowerCase().includes(normalizedQuery)) ||
      commit.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
  )
}

export function filterCommitsByBranches(
  commits: readonly GitLogCommit[],
  branchSet: ReadonlySet<string>
): GitLogCommit[] {
  if (branchSet.size === 0) {
    return [...commits]
  }

  return commits.filter((commit) =>
    commit.branches.some((branch) => branchSet.has(branch))
  )
}
