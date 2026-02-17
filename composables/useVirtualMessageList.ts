/**
 * Virtual Message List Composable
 * Renders only visible chat messages (+overscan) for long conversations.
 */
import type { ChatMessage } from '~/types/chat'

interface UseVirtualMessageListOptions {
  allMessages: ComputedRef<ChatMessage[]>
  containerRef: Ref<HTMLElement | null>
  estimateItemHeight?: number
  overscan?: number
}

interface VirtualMessageItem {
  message: ChatMessage
  index: number
  top: number
}

function resolveElement(input: unknown): HTMLElement | null {
  if (!input) return null
  if (input instanceof HTMLElement) return input
  if (typeof input === 'object' && '$el' in (input as Record<string, unknown>)) {
    const el = (input as { $el?: unknown }).$el
    return el instanceof HTMLElement ? el : null
  }
  return null
}

export function useVirtualMessageList(options: UseVirtualMessageListOptions) {
  const {
    allMessages,
    containerRef,
    estimateItemHeight = 120,
    overscan = 6,
  } = options

  const scrollTop = ref(0)
  const viewportHeight = ref(0)
  const measuredHeights = ref(new Map<string, number>())
  const elementsById = new Map<string, HTMLElement>()
  let resizeObserver: ResizeObserver | null = null

  function setMeasuredHeight(messageId: string, height: number) {
    if (!Number.isFinite(height) || height <= 0) return
    const nextHeight = Math.ceil(height)
    if (measuredHeights.value.get(messageId) === nextHeight) return
    const next = new Map(measuredHeights.value)
    next.set(messageId, nextHeight)
    measuredHeights.value = next
  }

  function measureElement(messageId: string, el: HTMLElement) {
    setMeasuredHeight(messageId, el.getBoundingClientRect().height)
  }

  function setItemRef(messageId: string, input: unknown) {
    const previous = elementsById.get(messageId)
    if (previous && resizeObserver) {
      resizeObserver.unobserve(previous)
    }
    if (previous) {
      delete previous.dataset.virtualMessageId
    }
    elementsById.delete(messageId)

    const el = resolveElement(input)
    if (!el) return

    el.dataset.virtualMessageId = messageId
    elementsById.set(messageId, el)
    measureElement(messageId, el)
    if (resizeObserver) {
      resizeObserver.observe(el)
    }
  }

  function onVirtualScroll() {
    const el = containerRef.value
    if (!el) return
    scrollTop.value = el.scrollTop
  }

  const layout = computed(() => {
    const messages = allMessages.value
    const offsets = new Array<number>(messages.length)
    let y = 0
    for (let i = 0; i < messages.length; i++) {
      offsets[i] = y
      y += measuredHeights.value.get(messages[i].id) ?? estimateItemHeight
    }
    return { offsets, totalHeight: y }
  })

  function findStartIndex(offsets: number[], targetY: number): number {
    let low = 0
    let high = offsets.length - 1
    let answer = offsets.length

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      if (offsets[mid] >= targetY) {
        answer = mid
        high = mid - 1
      } else {
        low = mid + 1
      }
    }

    if (answer === offsets.length) {
      return Math.max(0, offsets.length - 1)
    }

    return answer
  }

  const visibleItems = computed<VirtualMessageItem[]>(() => {
    const messages = allMessages.value
    if (messages.length === 0) return []

    const { offsets } = layout.value
    const viewportTop = scrollTop.value
    const viewportBottom = viewportTop + Math.max(viewportHeight.value, 1)

    const startBase = findStartIndex(offsets, Math.max(0, viewportTop - estimateItemHeight))
    let endBase = startBase
    while (endBase < messages.length && offsets[endBase] < viewportBottom) {
      endBase++
    }

    const start = Math.max(0, startBase - overscan)
    const end = Math.min(messages.length, endBase + overscan)
    const result: VirtualMessageItem[] = []
    for (let i = start; i < end; i++) {
      result.push({
        message: messages[i],
        index: i,
        top: offsets[i],
      })
    }
    return result
  })

  const totalHeight = computed(() => layout.value.totalHeight)

  onMounted(() => {
    const container = containerRef.value
    if (container) {
      viewportHeight.value = container.clientHeight
      scrollTop.value = container.scrollTop
    }

    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement
        if (containerRef.value && target === containerRef.value) {
          viewportHeight.value = entry.contentRect.height
          continue
        }
        const messageId = target.dataset.virtualMessageId
        if (messageId) {
          setMeasuredHeight(messageId, entry.contentRect.height)
        }
      }
    })

    if (containerRef.value) {
      resizeObserver.observe(containerRef.value)
    }

    for (const [messageId, el] of elementsById) {
      el.dataset.virtualMessageId = messageId
      resizeObserver.observe(el)
      measureElement(messageId, el)
    }
  })

  onUnmounted(() => {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    elementsById.clear()
  })

  return {
    visibleItems,
    totalHeight,
    onVirtualScroll,
    setItemRef,
  }
}

