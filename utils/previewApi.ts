export interface PreviewStartResult {
  success: boolean
  previewBranch?: string
  error?: string
}

export interface PreviewEndResult {
  success: boolean
  error?: string
}

/**
 * Start previewing a conversation: server swaps the main worktree onto a
 * temp preview branch and returns its name.
 */
export async function startPreview(params: {
  conversationId: string
  worktreePath: string
  baseBranch: string
}): Promise<PreviewStartResult> {
  return $fetch<PreviewStartResult>('/api/chat/preview', {
    method: 'POST',
    body: params,
  })
}

/**
 * End preview: server restores the main worktree to baseBranch and drops
 * the preview branch.
 */
export async function endPreview(params: {
  previewBranch: string
  baseBranch: string
}): Promise<PreviewEndResult> {
  return $fetch<PreviewEndResult>('/api/chat/preview', {
    method: 'DELETE',
    body: params,
  })
}

/**
 * Classify the three-way toggle outcome without running any side effects.
 * Callers translate the plan into API calls + state updates.
 */
export type PreviewToggleDecision =
  | { kind: 'end-current'; id: string }
  | { kind: 'swap'; endId: string; startId: string }
  | { kind: 'start'; id: string }

export function decidePreviewToggle(
  currentPreviewId: string | null,
  targetId: string,
): PreviewToggleDecision {
  if (currentPreviewId === targetId) return { kind: 'end-current', id: targetId }
  if (currentPreviewId) return { kind: 'swap', endId: currentPreviewId, startId: targetId }
  return { kind: 'start', id: targetId }
}
