const COMMIT_HASH_RE = /^[0-9a-f]{7,40}$/i

export function isSelectableBaseBranchName(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false
  const branch = value.trim()
  return branch.length > 0 && branch !== 'HEAD' && !branch.startsWith('sc/') && !COMMIT_HASH_RE.test(branch)
}

export function resolveSelectableBaseBranch(
  preferredBranch: string | null | undefined,
  branches: readonly string[],
): string | null {
  const normalizedBranches = branches
    .map(branch => branch.trim())
    .filter(Boolean)

  const preferred = preferredBranch?.trim() || ''
  if (preferred && normalizedBranches.includes(preferred) && isSelectableBaseBranchName(preferred)) {
    return preferred
  }

  if (normalizedBranches.includes('main')) return 'main'
  if (normalizedBranches.includes('master')) return 'master'

  return normalizedBranches[0] || null
}

export function getSelectableBaseBranchLabel(value: string | null | undefined): string {
  return isSelectableBaseBranchName(value) ? value.trim() : 'Loading branches...'
}
