/**
 * Message Window Composable
 * Shows only the latest N messages and loads older ones on scroll-up.
 */
import type { ChatMessage } from '~/types/chat'

interface UseMessageWindowOptions {
  allMessages: ComputedRef<ChatMessage[]>
  containerRef: Ref<HTMLElement | null>
  initialSize?: number
  batchSize?: number
  topThreshold?: number
}

export function useMessageWindow(options: UseMessageWindowOptions) {
  const {
    allMessages,
    containerRef,
    initialSize = 50,
    batchSize = 30,
    topThreshold = 100,
  } = options

  const visibleCount = ref(initialSize)
  const isLoadingMore = ref(false)

  const visibleMessages = computed(() => {
    const all = allMessages.value
    if (all.length <= visibleCount.value) return all
    return all.slice(all.length - visibleCount.value)
  })

  const hasOlderMessages = computed(() => {
    return allMessages.value.length > visibleCount.value
  })

  // Auto-expand window when new messages arrive so visible messages don't fall off
  watch(
    () => allMessages.value.length,
    (newLen, oldLen) => {
      if (oldLen !== undefined && newLen > oldLen) {
        visibleCount.value += newLen - oldLen
      }
    },
  )

  function resetWindow() {
    visibleCount.value = initialSize
    isLoadingMore.value = false
  }

  async function loadOlderMessages() {
    const el = containerRef.value
    if (!el) return

    isLoadingMore.value = true

    const prevScrollHeight = el.scrollHeight
    const prevScrollTop = el.scrollTop

    const total = allMessages.value.length
    visibleCount.value = Math.min(visibleCount.value + batchSize, total)

    await nextTick()

    // Restore scroll position so the view doesn't jump
    const heightDiff = el.scrollHeight - prevScrollHeight
    el.scrollTop = prevScrollTop + heightDiff

    isLoadingMore.value = false
  }

  function onScrollForLoadMore() {
    const el = containerRef.value
    if (!el) return
    if (isLoadingMore.value) return
    if (!hasOlderMessages.value) return

    if (el.scrollTop < topThreshold) {
      loadOlderMessages()
    }
  }

  return {
    visibleMessages,
    hasOlderMessages,
    isLoadingMore,
    resetWindow,
    onScrollForLoadMore,
  }
}
