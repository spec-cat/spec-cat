import type { ContentBlock, ToolUseBlock } from '~/types/chat'

/**
 * Whether the current browser tab is visible *and* focused.
 * Used to decide whether to raise completion notifications.
 */
export function isPageFocused(): boolean {
  if (typeof document === 'undefined') return false
  if (typeof document.hasFocus !== 'function') return false
  return document.visibilityState === 'visible' && document.hasFocus()
}

/**
 * Build the ws(s) URL for the chat WebSocket endpoint based on the current page.
 * Returns an empty string during SSR.
 */
export function getWsUrl(): string {
  if (typeof window === 'undefined') return ''
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/_ws`
}

/**
 * Stable key for deduplicating auto-recovery attempts during error/reset flows.
 */
export function buildRecoveryKey(conversationId: string, messageId: string): string {
  return `${conversationId}:${messageId}`
}

/**
 * Promote in-flight tool blocks ('running' | 'pending') to a terminal status.
 * Used when a stream ends and we need to finalize any still-open tool blocks.
 * Mutates blocks in place.
 */
export function markToolBlocks(blocks: ContentBlock[], status: 'complete' | 'error'): void {
  for (const block of blocks) {
    if (block.type === 'tool_use') {
      const tb = block as ToolUseBlock
      if (tb.status === 'running' || tb.status === 'pending') {
        tb.status = status
      }
    }
  }
}
