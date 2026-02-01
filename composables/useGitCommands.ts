import type { CheckoutRequest, CheckoutResponse, CommitDetail } from '~/types/git'

/**
 * Composable for Git repository operations and commands.
 * Provides reactive state for git operations with error handling.
 */
export function useGitCommands() {
  // State
  const executing = ref(false)
  const lastResult = ref<string | null>(null)
  const error = ref<string | null>(null)

  /**
   * Checkout a specific branch with confirmation and error handling.
   */
  async function checkoutBranch(
    name: string, 
    force: boolean = false
  ): Promise<CheckoutResponse> {
    executing.value = true
    error.value = null
    
    try {
      const response = await $fetch<CheckoutResponse>('/api/git/checkout', {
        method: 'POST',
        body: {
          branchName: name,
          force
        } satisfies CheckoutRequest
      })
      
      lastResult.value = `Checked out branch: ${name}`
      return response
    } catch (err: any) {
      const errorMessage = err.data?.message || err.message || 'Failed to checkout branch'
      error.value = errorMessage
      
      return {
        success: false,
        newBranch: '',
        previousBranch: '',
        warnings: [errorMessage]
      }
    } finally {
      executing.value = false
    }
  }

  /**
   * Get detailed information about a specific commit.
   */
  async function getCommitDetail(hash: string): Promise<CommitDetail> {
    executing.value = true
    error.value = null
    
    try {
      const response = await $fetch<CommitDetail>(`/api/git/commit/${hash}`)
      lastResult.value = `Fetched commit details: ${hash}`
      return response
    } catch (err: any) {
      const errorMessage = err.data?.message || err.message || 'Failed to fetch commit details'
      error.value = errorMessage
      throw new Error(errorMessage)
    } finally {
      executing.value = false
    }
  }

  /**
   * Refresh repository state (trigger reload).
   */
  async function refreshRepository(): Promise<void> {
    executing.value = true
    error.value = null
    
    try {
      // This could trigger a store refresh or emit an event
      // For now, we'll just clear the error state
      lastResult.value = 'Repository refreshed'
    } catch (err: any) {
      const errorMessage = err.data?.message || err.message || 'Failed to refresh repository'
      error.value = errorMessage
      throw new Error(errorMessage)
    } finally {
      executing.value = false
    }
  }

  /**
   * Clear error state.
   */
  function clearError() {
    error.value = null
  }

  /**
   * Clear last result.
   */
  function clearLastResult() {
    lastResult.value = null
  }

  return {
    // State
    executing: readonly(executing),
    lastResult: readonly(lastResult),
    error: readonly(error),
    
    // Actions
    checkoutBranch,
    getCommitDetail,
    refreshRepository,
    clearError,
    clearLastResult
  }
}