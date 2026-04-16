import type { FileDiffResponse } from '~/types/git'

/**
 * Fetch the unified diff for a single file within a commit.
 * Throws on non-2xx or network errors — callers decide whether to surface
 * via operation error state or silently drop.
 */
export async function fetchFileDiff(params: {
  workingDirectory: string
  commitHash: string
  filePath: string
}): Promise<FileDiffResponse> {
  return $fetch<FileDiffResponse>('/api/git/file-diff', { query: params })
}
