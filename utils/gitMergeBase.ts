/**
 * Call the merge-base API for a given branch. Returns null on any failure
 * (including unresolved merge-bases) — the caller decides how to reflect
 * that in UI state.
 */
export async function fetchMergeBase(
  workingDirectory: string,
  branch: string,
  baseBranch?: string | null,
): Promise<string | null> {
  try {
    const data = await $fetch<{ mergeBase: string | null }>('/api/git/merge-base', {
      params: {
        workingDirectory,
        branch,
        baseBranch: baseBranch ?? undefined,
      },
    })
    return data.mergeBase
  } catch {
    return null
  }
}

/**
 * Derive the map `{ branchName → mergeBaseHash }` for the active highlight
 * branches. Pure — used by both the graph view and downstream rendering.
 */
export function buildMergeBaseMap(
  entries: ReadonlyArray<{ branch: string | null; mergeBase: string | null }>,
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const { branch, mergeBase } of entries) {
    if (branch && mergeBase) {
      map[branch] = mergeBase
    }
  }
  return map
}
