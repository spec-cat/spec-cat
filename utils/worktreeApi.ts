export interface CreateWorktreeResponse {
  success: boolean
  worktreePath?: string
  branch?: string
  baseBranch?: string
  error?: string
}

export interface PreviewSyncResponse {
  success: boolean
  error?: string
}

/**
 * Create a worktree for a conversation. Pass featureId to link to a feature,
 * or leave it out for an ad-hoc user-initiated conversation.
 */
export async function createWorktree(params: {
  conversationId: string
  featureId?: string
  baseBranch?: string
}): Promise<CreateWorktreeResponse> {
  return $fetch<CreateWorktreeResponse>('/api/chat/worktree', {
    method: 'POST',
    body: params,
  })
}

/**
 * Remove a worktree. Best-effort — callers typically swallow errors because
 * this runs during conversation deletion cleanup.
 */
export async function deleteWorktree(params: {
  worktreePath: string
  branch: string
  conversationId?: string
}): Promise<void> {
  await $fetch('/api/chat/worktree', {
    method: 'DELETE',
    body: params,
  })
}

/**
 * Sync changes from a worktree into its preview branch. Throws on failure
 * so the caller can branch on success vs. unknown-error paths.
 */
export async function syncPreviewBranch(params: {
  previewBranch: string
  worktreePath: string
}): Promise<void> {
  const res = await $fetch<PreviewSyncResponse>('/api/chat/preview-sync', {
    method: 'POST',
    body: params,
  })
  if (!res.success) {
    throw new Error(res.error || 'Unknown preview sync failure')
  }
}
