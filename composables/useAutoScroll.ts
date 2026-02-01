/**
 * Auto-Scroll Composable
 * Manages auto-scroll behavior for chat messages
 */

export function useAutoScroll() {
  const containerRef = ref<HTMLElement | null>(null)
  const shouldAutoScroll = ref(true)

  // Threshold in pixels - if user is within this distance from bottom, auto-scroll
  const SCROLL_THRESHOLD = 50

  /**
   * Check if container is scrolled near bottom
   */
  function isNearBottom(): boolean {
    const el = containerRef.value
    if (!el) return true

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    return distanceFromBottom < SCROLL_THRESHOLD
  }

  /**
   * Handle scroll event - update auto-scroll state
   */
  function onScroll() {
    shouldAutoScroll.value = isNearBottom()
  }

  /**
   * Scroll to bottom of container
   */
  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    nextTick(() => {
      const el = containerRef.value
      if (el) {
        el.scrollTo({
          top: el.scrollHeight,
          behavior,
        })
      }
    })
  }

  /**
   * Force scroll to bottom (ignores shouldAutoScroll)
   */
  function forceScrollToBottom(behavior: ScrollBehavior = 'smooth') {
    scrollToBottom(behavior)
    shouldAutoScroll.value = true
  }

  /**
   * Conditionally scroll to bottom (respects shouldAutoScroll)
   */
  function maybeScrollToBottom(behavior: ScrollBehavior = 'smooth') {
    if (shouldAutoScroll.value) {
      scrollToBottom(behavior)
    }
  }

  /**
   * Enable auto-scroll
   */
  function enableAutoScroll() {
    shouldAutoScroll.value = true
  }

  /**
   * Disable auto-scroll
   */
  function disableAutoScroll() {
    shouldAutoScroll.value = false
  }

  return {
    containerRef,
    shouldAutoScroll: readonly(shouldAutoScroll),
    onScroll,
    scrollToBottom,
    forceScrollToBottom,
    maybeScrollToBottom,
    enableAutoScroll,
    disableAutoScroll,
  }
}
