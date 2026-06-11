import type {
  AiResolveResponse,
  ConflictListResponse,
  FinalizeResponse,
  RebaseAbortResponse,
} from '~/types/chat'

/**
 * Finalize a conversation: merge worktree changes onto target branch,
 * clean up preview, and delete the worktree. Returns the server response
 * verbatim so callers can branch on rebaseInProgress vs. success.
 */
export async function finalizeConversationApi(params: {
  conversationId: string
  commitMessage: string
  baseBranch?: string
  worktreePath?: string
  worktreeBranch?: string
  previewBranch?: string
}): Promise<FinalizeResponse> {
  return $fetch<FinalizeResponse>('/api/chat/finalize', {
    method: 'POST',
    body: params,
  })
}

/**
 * Rebase a worktree onto the latest base branch without finalizing.
 * Used for the "sync" flow where the worktree must remain for continued
 * development.
 */
export async function rebaseConversationApi(params: {
  conversationId: string
  baseBranch?: string
  worktreePath?: string
}): Promise<FinalizeResponse> {
  return $fetch<FinalizeResponse>('/api/chat/rebase', {
    method: 'POST',
    body: params,
  })
}

/**
 * Fetch the list of conflicted files for a worktree currently mid-rebase.
 */
export async function fetchConflictList(worktreePath: string): Promise<ConflictListResponse> {
  return $fetch<ConflictListResponse>('/api/rebase/conflicts', {
    params: { worktreePath },
  })
}

/**
 * Write the resolved content for a single conflicted file. Returns the
 * raw server response; callers typically care only about `res.success`.
 */
export async function writeResolvedFile(params: {
  worktreePath: string
  filePath: string
  content: string
  signal?: AbortSignal
}): Promise<{ success: boolean; error?: string }> {
  const { signal, ...body } = params
  return $fetch<{ success: boolean; error?: string }>('/api/rebase/resolve', {
    method: 'PUT',
    body,
    signal,
  })
}

/**
 * Continue rebase after all conflicts are resolved. Endpoint differs
 * between finalize cleanup and sync-only modes.
 */
export async function continueRebaseApi(params: {
  mode: 'finalize' | 'sync'
  conversationId: string
  commitMessage: string
  baseBranch: string
  worktreePath: string
  worktreeBranch?: string
  previewBranch?: string
}): Promise<FinalizeResponse> {
  const endpoint = params.mode === 'sync' ? '/api/rebase/continue-sync' : '/api/rebase/continue'
  const { mode: _mode, ...body } = params
  return $fetch<FinalizeResponse>(endpoint, {
    method: 'POST',
    body,
  })
}

/**
 * Abort an in-progress rebase for a worktree.
 */
export async function abortRebaseApi(worktreePath: string): Promise<RebaseAbortResponse> {
  return $fetch<RebaseAbortResponse>('/api/rebase/abort', {
    method: 'POST',
    body: { worktreePath },
  })
}

/**
 * AI-resolve a single conflict file using the server's configured model.
 */
export async function aiResolveConflictApi(params: {
  worktreePath: string
  filePath: string
  conflictContent: string
  userGuidance?: string
  signal?: AbortSignal
}): Promise<AiResolveResponse> {
  const { signal, ...body } = params
  return $fetch<AiResolveResponse>('/api/rebase/ai-resolve', {
    method: 'POST',
    body,
    signal,
  })
}
