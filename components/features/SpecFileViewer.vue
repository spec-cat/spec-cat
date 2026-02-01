<script setup lang="ts">
import { useMarkdown } from '~/composables/useMarkdown'

const props = defineProps<{
  featureId: string
  filename: string
}>()

const { renderMarkdown } = useMarkdown()

const content = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

async function fetchContent() {
  loading.value = true
  error.value = null
  try {
    const data = await $fetch<{ content: string }>(`/api/specs/${props.featureId}/${props.filename}`)
    content.value = data.content
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load file'
    error.value = msg
    content.value = ''
  } finally {
    loading.value = false
  }
}

const renderedHtml = computed(() => {
  if (!content.value) return ''
  return renderMarkdown(content.value)
})

watch(() => [props.featureId, props.filename], () => {
  fetchContent()
}, { immediate: true })
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <span class="text-sm font-mono text-retro-muted animate-pulse">Loading...</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="flex flex-col items-center justify-center py-12 text-center px-4">
      <p class="text-sm font-mono text-retro-red">{{ error }}</p>
      <button
        type="button"
        class="mt-3 px-3 py-1.5 text-xs font-mono bg-retro-panel border border-retro-border rounded text-retro-muted hover:text-retro-cyan hover:border-retro-cyan transition-colors"
        @click="fetchContent"
      >
        Retry
      </button>
    </div>

    <!-- Rendered markdown -->
    <div
      v-else
      class="spec-markdown p-4 text-sm font-mono text-retro-text"
      v-html="renderedHtml"
    />
  </div>
</template>

<style>
.spec-markdown h1 {
  font-size: 1.25rem;
  font-weight: 700;
  color: rgb(var(--color-retro-cyan));
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgb(var(--color-retro-border));
}

.spec-markdown h2 {
  font-size: 1.1rem;
  font-weight: 700;
  color: rgb(var(--color-retro-cyan));
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
}

.spec-markdown h3 {
  font-size: 1rem;
  font-weight: 600;
  color: rgb(var(--color-retro-text));
  margin-top: 1rem;
  margin-bottom: 0.375rem;
}

.spec-markdown h4,
.spec-markdown h5,
.spec-markdown h6 {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgb(var(--color-retro-muted));
  margin-top: 0.75rem;
  margin-bottom: 0.25rem;
}

.spec-markdown p {
  margin-bottom: 0.5rem;
  line-height: 1.6;
}

.spec-markdown ul,
.spec-markdown ol {
  margin-bottom: 0.5rem;
  padding-left: 1.5rem;
}

.spec-markdown ul {
  list-style-type: disc;
}

.spec-markdown ol {
  list-style-type: decimal;
}

.spec-markdown li {
  margin-bottom: 0.25rem;
  line-height: 1.5;
}

.spec-markdown strong {
  color: rgb(var(--color-retro-text));
  font-weight: 700;
}

.spec-markdown em {
  font-style: italic;
  color: rgb(var(--color-retro-muted));
}

.spec-markdown a {
  color: rgb(var(--color-retro-cyan));
  text-decoration: underline;
}

.spec-markdown code {
  background: rgb(var(--color-retro-dark));
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  color: rgb(var(--color-retro-green));
}

.spec-markdown pre {
  background: rgb(var(--color-retro-dark));
  border: 1px solid rgb(var(--color-retro-border));
  border-radius: 0.375rem;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  overflow-x: auto;
}

.spec-markdown pre code {
  background: transparent;
  padding: 0;
  font-size: 0.8125rem;
  color: rgb(var(--color-retro-text));
}

.spec-markdown table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0.75rem;
  font-size: 0.8125rem;
}

.spec-markdown th {
  background: rgb(var(--color-retro-dark));
  border: 1px solid rgb(var(--color-retro-border));
  padding: 0.375rem 0.5rem;
  text-align: left;
  font-weight: 600;
  color: rgb(var(--color-retro-cyan));
}

.spec-markdown td {
  border: 1px solid rgb(var(--color-retro-border));
  padding: 0.375rem 0.5rem;
}

.spec-markdown hr {
  border: none;
  border-top: 1px solid rgb(var(--color-retro-border));
  margin: 1rem 0;
}

.spec-markdown blockquote {
  border-left: 3px solid rgb(var(--color-retro-cyan));
  padding-left: 0.75rem;
  margin-bottom: 0.5rem;
  color: rgb(var(--color-retro-muted));
}

/* Checkbox lists */
.spec-markdown input[type="checkbox"] {
  margin-right: 0.375rem;
}

.spec-markdown li:has(input[type="checkbox"]) {
  list-style-type: none;
  margin-left: -1.5rem;
}
</style>
