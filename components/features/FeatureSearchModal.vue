<script setup lang="ts">
import { ExclamationTriangleIcon, MagnifyingGlassIcon, XMarkIcon, DocumentTextIcon } from '@heroicons/vue/24/outline'
import type { ComponentPublicInstance } from 'vue'
import type { SearchResponse, SearchResult, SearchResultViewModel } from '~/types/specSearch'
import { useMarkdown } from '~/composables/useMarkdown'

const props = defineProps<{
  availableFeatureIds: string[]
}>()

const emit = defineEmits<{
  close: []
  select: [featureId: string]
}>()
const { renderMarkdown } = useMarkdown()

const SEARCH_DEBOUNCE_MS = 400
const query = ref('')
const isSearching = ref(false)
const hasSearched = ref(false)
const errorMessage = ref<string | null>(null)
const unavailableMessage = ref<string | null>(null)
const warning = ref<string | null>(null)
const lastSearchTime = ref<number | null>(null)
const results = ref<SearchResultViewModel[]>([])
const highlightedIndex = ref(-1)
const inputRef = ref<HTMLInputElement | null>(null)
const resultButtonRefs = ref<Array<HTMLElement | null>>([])
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let requestId = 0

const trimmedQuery = computed(() => query.value.trim())
const queryTerms = computed(() => {
  const terms = trimmedQuery.value
    .toLowerCase()
    .split(/\s+/)
    .map(term => term.trim())
    .filter(term => term.length >= 2)
  return Array.from(new Set(terms)).slice(0, 8)
})

const feedbackState = computed<'idle' | 'empty-query' | 'no-results' | 'error' | 'results'>(() => {
  if (errorMessage.value || unavailableMessage.value) return 'error'
  if (!trimmedQuery.value && hasSearched.value) return 'empty-query'
  if (results.value.length > 0) return 'results'
  if (hasSearched.value && !isSearching.value) return 'no-results'
  return 'idle'
})

function toViewModel(result: SearchResult): SearchResultViewModel {
  return {
    featureId: result.chunk.featureId,
    sourcePath: result.chunk.sourcePath,
    headingHierarchy: result.chunk.headingHierarchy,
    snippet: result.chunk.content,
    matchType: result.matchType,
    score: result.score,
    lineStart: result.chunk.lineStart,
    lineEnd: result.chunk.lineEnd,
  }
}

async function runSearch() {
  const q = trimmedQuery.value
  unavailableMessage.value = null

  if (!q) {
    hasSearched.value = true
    warning.value = null
    lastSearchTime.value = null
    errorMessage.value = null
    results.value = []
    highlightedIndex.value = -1
    return
  }

  const currentRequestId = ++requestId
  hasSearched.value = true
  errorMessage.value = null
  isSearching.value = true

  try {
    const response = await $fetch<SearchResponse>('/api/specs/search', {
      query: {
        q,
        mode: 'keyword',
        limit: 20,
      },
    })

    if (currentRequestId !== requestId) {
      return
    }

    warning.value = response.warning ?? null
    lastSearchTime.value = response.searchTime
    results.value = response.results.map(toViewModel)
    highlightedIndex.value = results.value.length > 0 ? 0 : -1
  } catch (error) {
    if (currentRequestId !== requestId) {
      return
    }

    const message = error instanceof Error ? error.message : 'Failed to search specs'
    errorMessage.value = message
    lastSearchTime.value = null
    results.value = []
    highlightedIndex.value = -1
  } finally {
    if (currentRequestId === requestId) {
      isSearching.value = false
    }
  }
}

watch(query, () => {
  errorMessage.value = null
  unavailableMessage.value = null
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    runSearch()
  }, SEARCH_DEBOUNCE_MS)
})

watch(results, () => {
  resultButtonRefs.value = []
})

watch(highlightedIndex, async (index) => {
  if (index < 0) return
  await nextTick()
  resultButtonRefs.value[index]?.scrollIntoView({ block: 'nearest' })
})

function closeModal() {
  emit('close')
}

function selectByIndex(index: number) {
  const result = results.value[index]
  if (!result) return

  if (!props.availableFeatureIds.includes(result.featureId)) {
    unavailableMessage.value = 'Feature unavailable'
    return
  }

  emit('select', result.featureId)
  emit('close')
}

function handleArrow(direction: -1 | 1) {
  if (results.value.length === 0) return

  if (highlightedIndex.value < 0) {
    highlightedIndex.value = 0
    return
  }

  const next = highlightedIndex.value + direction
  if (next < 0) {
    highlightedIndex.value = results.value.length - 1
    return
  }

  if (next >= results.value.length) {
    highlightedIndex.value = 0
    return
  }

  highlightedIndex.value = next
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    handleArrow(1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    handleArrow(-1)
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    if (highlightedIndex.value >= 0) {
      selectByIndex(highlightedIndex.value)
    }
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeModal()
  }
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    closeModal()
  }
}

function setResultButtonRef(index: number, element: Element | ComponentPublicInstance | null) {
  if (!element) {
    resultButtonRefs.value[index] = null
    return
  }

  if (element instanceof HTMLElement) {
    resultButtonRefs.value[index] = element
    return
  }

  const maybeElement = (element as ComponentPublicInstance).$el
  resultButtonRefs.value[index] = maybeElement instanceof HTMLElement ? maybeElement : null
}

function handleRetry() {
  runSearch()
}

function renderSnippetMarkdown(snippet: string): string {
  const trimmed = snippet.trim()
  if (!trimmed) return ''
  const limited = trimmed.length > 700 ? `${trimmed.slice(0, 700)}...` : trimmed
  const html = renderMarkdown(limited)
  if (queryTerms.value.length === 0) return html

  // Highlight only text nodes (ignore tags) so markdown structure stays intact.
  const escapedTerms = queryTerms.value.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escapedTerms.join('|')})`, 'gi')
  return html
    .split(/(<[^>]+>)/g)
    .map(part => (part.startsWith('<') ? part : part.replace(pattern, '<mark>$1</mark>')))
    .join('')
}

onMounted(() => {
  nextTick(() => {
    inputRef.value?.focus()
  })
})

onUnmounted(() => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition
      appear
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-120 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        class="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/75 backdrop-blur-[1px]"
        @click="onBackdropClick"
      >
        <Transition
          appear
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 translate-y-2 scale-[0.99]"
          enter-to-class="opacity-100 translate-y-0 scale-100"
          leave-active-class="transition duration-120 ease-in"
          leave-from-class="opacity-100 translate-y-0 scale-100"
          leave-to-class="opacity-0 translate-y-1 scale-[0.995]"
        >
          <div class="w-full max-w-2xl rounded-xl border border-retro-border/80 bg-retro-black shadow-[0_24px_70px_rgba(0,0,0,0.55)] overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2 border-b border-retro-border/60 bg-retro-dark/70">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-mono border border-retro-cyan/50 text-retro-cyan bg-retro-cyan/10">
              Command Palette
            </span>
            <span class="text-[10px] font-mono text-retro-subtle">Global spec search</span>
          </div>
          <button
            type="button"
            class="p-1 rounded text-retro-muted hover:text-retro-text hover:bg-retro-panel transition-colors"
            title="Close (Escape)"
            @click="closeModal"
          >
            <XMarkIcon class="h-4 w-4" />
          </button>
        </div>

        <div class="flex items-center gap-2 px-4 py-3 border-b border-retro-border/60">
          <MagnifyingGlassIcon class="h-4 w-4 text-retro-cyan" />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            placeholder="Search specs across all features..."
            class="flex-1 bg-transparent text-sm font-mono text-retro-text placeholder:text-retro-subtle focus:outline-none"
            @keydown="handleInputKeydown"
          >
          <span class="text-[10px] font-mono text-retro-subtle border border-retro-border/60 rounded px-1.5 py-0.5">400ms</span>
        </div>

        <div class="flex items-center justify-between px-4 py-1.5 border-b border-retro-border/40 bg-retro-dark/30 text-[10px] font-mono text-retro-subtle">
          <div class="flex items-center gap-3">
            <span class="inline-flex items-center gap-1">
              <DocumentTextIcon class="h-3.5 w-3.5" />
              {{ results.length }} results
            </span>
            <span v-if="lastSearchTime !== null">{{ lastSearchTime }}ms</span>
          </div>
          <span v-if="trimmedQuery" class="truncate max-w-[42%]">“{{ trimmedQuery }}”</span>
        </div>

        <div class="max-h-[58vh] overflow-y-auto">
          <div v-if="isSearching" class="px-4 py-3 text-xs font-mono text-retro-subtle animate-pulse">
            Searching...
          </div>

          <div v-else-if="feedbackState === 'empty-query'" class="px-4 py-4 text-xs font-mono text-retro-subtle">
            Enter a search term to search across all feature specs.
          </div>

          <div v-else-if="feedbackState === 'no-results'" class="px-4 py-4 text-xs font-mono text-retro-subtle">
            No matching features found.
          </div>

          <div v-else-if="feedbackState === 'error'" class="px-4 py-3 text-xs font-mono text-retro-red">
            <p>{{ unavailableMessage || errorMessage }}</p>
            <button
              v-if="errorMessage"
              type="button"
              class="mt-2 px-2 py-1 rounded border border-retro-border text-retro-muted hover:text-retro-cyan hover:border-retro-cyan transition-colors"
              @click="handleRetry"
            >
              Retry
            </button>
          </div>

          <ul v-else-if="results.length > 0" class="py-2 px-2 space-y-2">
            <li v-for="(result, index) in results" :key="`${result.featureId}:${result.sourcePath}:${index}`">
              <button
                type="button"
                :ref="(el) => setResultButtonRef(index, el)"
                class="w-full text-left px-4 py-3 min-h-[132px] rounded-lg border border-retro-border/40 border-l-2 transition-colors"
                :class="index === highlightedIndex
                  ? 'border-retro-cyan bg-retro-panel/95 text-retro-text shadow-[0_0_0_1px_rgba(34,211,238,0.18)]'
                  : 'text-retro-muted hover:text-retro-text hover:bg-retro-panel/90'"
                @mouseenter="highlightedIndex = index"
                @click="selectByIndex(index)"
              >
                <div class="flex items-center justify-between gap-3 text-[10px] font-mono">
                  <span class="text-retro-cyan/90">{{ result.featureId }}</span>
                  <span class="text-retro-subtle truncate">{{ result.sourcePath }}:{{ result.lineStart }}-{{ result.lineEnd }}</span>
                </div>
                <div
                  class="snippet-markdown mt-2 max-h-20 overflow-hidden text-xs text-retro-text"
                  v-html="renderSnippetMarkdown(result.snippet)"
                />
                <div class="mt-2 text-[10px] font-mono text-retro-subtle">
                  Select feature
                </div>
              </button>
            </li>
          </ul>

          <div v-else class="px-4 py-3 text-xs font-mono text-retro-subtle">
            Start typing to search.
          </div>
        </div>

        <div class="flex items-center justify-between gap-3 px-4 py-2 border-t border-retro-border/60 bg-retro-dark/50 text-[11px] font-mono text-retro-subtle">
          <div class="flex items-center gap-2">
            <span class="border border-retro-border/70 rounded px-1.5 py-0.5">↑↓ move</span>
            <span class="border border-retro-border/70 rounded px-1.5 py-0.5">Enter select</span>
            <span class="border border-retro-border/70 rounded px-1.5 py-0.5">Esc close</span>
          </div>
          <span v-if="warning" class="text-retro-yellow">{{ warning }}</span>
        </div>

        <div v-if="unavailableMessage" class="px-4 pb-3 text-xs font-mono text-retro-red flex items-center gap-2">
          <ExclamationTriangleIcon class="h-3.5 w-3.5" />
          <span>{{ unavailableMessage }}</span>
        </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.snippet-markdown :deep(p) {
  margin: 0;
}

.snippet-markdown :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: rgb(var(--color-retro-cyan));
}

.snippet-markdown :deep(strong) {
  color: rgb(var(--color-retro-text));
}

.snippet-markdown :deep(mark) {
  background: rgba(var(--color-retro-cyan), 0.24);
  color: rgb(var(--color-retro-text));
  padding: 0 2px;
  border-radius: 2px;
}
</style>
