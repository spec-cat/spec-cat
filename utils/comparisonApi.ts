export interface ComparisonFile {
  path: string
  oldPath?: string
  status: string
  additions: number
  deletions: number
  binary: boolean
}

export interface ComparisonStats {
  filesChanged: number
  additions: number
  deletions: number
}

export interface ComparisonResponse {
  files: ComparisonFile[]
  stats: ComparisonStats
}

/**
 * Fetch the file-level diff summary between two commits.
 * Thin wrapper around /api/git/diff — callers own error reporting.
 */
export async function fetchComparisonDiff(params: {
  workingDirectory: string
  from: string
  to: string
}): Promise<ComparisonResponse> {
  return $fetch<ComparisonResponse>('/api/git/diff', { query: params })
}
