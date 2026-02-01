<script setup lang="ts">
import { XMarkIcon, PencilSquareIcon } from '@heroicons/vue/24/outline'
import { useMarkdown } from '~/composables/useMarkdown'
import { useToast } from '~/composables/useToast'
import type { Feature } from '~/types/spec-viewer'

const props = defineProps<{
  feature: Feature
}>()

const emit = defineEmits<{
  close: []
}>()

const toast = useToast()
const { renderMarkdown } = useMarkdown()

// Current file selection
const selectedFilename = ref(props.feature.files[0]?.filename || '')

// Content state
const content = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

// Edit mode
const editing = ref(false)
const editContent = ref('')
const saving = ref(false)

async function fetchContent() {
  if (!selectedFilename.value) return
  loading.value = true
  error.value = null
  try {
    const url: string = `/api/specs/${props.feature.id}/${selectedFilename.value}`
    const data = await $fetch<{ content: string }>(url)
    content.value = data.content
  } catch {
    error.value = 'Failed to load file'
    content.value = ''
  } finally {
    loading.value = false
  }
}

const renderedHtml = computed(() => {
  if (!content.value) return ''
  return renderMarkdown(content.value)
})

function selectFile(filename: string) {
  if (editing.value) {
    editing.value = false
  }
  selectedFilename.value = filename
  fetchContent()
}

function startEdit() {
  editContent.value = content.value
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  editContent.value = ''
}

async function saveEdit() {
  saving.value = true
  try {
    const url: string = `/api/specs/${props.feature.id}/${selectedFilename.value}`
    await $fetch(url, {
      method: 'PUT',
      body: { content: editContent.value },
    })
    content.value = editContent.value
    editing.value = false
    toast.success('Saved')
  } catch {
    toast.error('Failed to save')
  } finally {
    saving.value = false
  }
}

// ESC to close
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (editing.value) {
      cancelEdit()
    } else {
      emit('close')
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  fetchContent()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/80"
        @click="emit('close')"
      />

      <!-- Modal — full screen -->
      <div class="relative w-[96vw] h-[94vh] bg-retro-black border border-retro-border rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="flex-shrink-0 flex items-center justify-between px-4 h-12 border-b border-retro-border bg-retro-dark">
          <div class="flex items-center gap-3 min-w-0">
            <span class="text-sm font-mono font-bold text-retro-cyan truncate">{{ feature.name }}</span>
            <span class="text-xs font-mono text-retro-subtle">{{ feature.id }}</span>
          </div>
          <div class="flex items-center gap-2">
            <!-- Edit / Save / Cancel buttons -->
            <template v-if="editing">
              <button
                type="button"
                class="px-3 py-1 text-xs font-mono rounded border border-retro-border text-retro-muted hover:text-retro-text hover:border-retro-muted transition-colors"
                @click="cancelEdit"
              >
                Cancel
              </button>
              <button
                type="button"
                class="px-3 py-1 text-xs font-mono rounded border border-retro-cyan text-retro-cyan hover:bg-retro-cyan/10 transition-colors disabled:opacity-50"
                :disabled="saving"
                @click="saveEdit"
              >
                {{ saving ? 'Saving...' : 'Save' }}
              </button>
            </template>
            <button
              v-else-if="content && !loading && !error"
              type="button"
              class="p-1.5 rounded text-retro-muted hover:text-retro-cyan hover:bg-retro-panel transition-colors"
              title="Edit"
              @click="startEdit"
            >
              <PencilSquareIcon class="h-4 w-4" />
            </button>

            <!-- Close -->
            <button
              type="button"
              class="p-1.5 rounded text-retro-muted hover:text-retro-text hover:bg-retro-panel transition-colors"
              title="Close (ESC)"
              @click="emit('close')"
            >
              <XMarkIcon class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- File tabs -->
        <div v-if="feature.files.length > 0" class="flex-shrink-0 flex items-center gap-0 border-b border-retro-border bg-retro-dark overflow-x-auto">
          <button
            v-for="file in feature.files"
            :key="file.filename"
            type="button"
            class="px-4 py-2 text-xs font-mono border-b-2 transition-colors whitespace-nowrap"
            :class="[
              selectedFilename === file.filename
                ? 'border-retro-cyan text-retro-cyan bg-retro-black'
                : 'border-transparent text-retro-muted hover:text-retro-text hover:bg-retro-panel',
            ]"
            @click="selectFile(file.filename)"
          >
            {{ file.label }}
          </button>
        </div>

        <!-- Content area -->
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

          <!-- Empty state (no files) -->
          <div
            v-else-if="feature.files.length === 0"
            class="flex flex-col items-center justify-center py-12 text-center"
          >
            <p class="text-sm font-mono text-retro-muted">No spec files found</p>
            <p class="mt-1 text-xs font-mono text-retro-subtle">
              This feature directory has no .md files
            </p>
          </div>

          <!-- Edit mode -->
          <div v-else-if="editing" class="h-full flex flex-col">
            <textarea
              v-model="editContent"
              class="flex-1 w-full p-4 bg-retro-black text-sm font-mono text-retro-text resize-none focus:outline-none"
              spellcheck="false"
            />
          </div>

          <!-- Rendered markdown -->
          <div
            v-else
            class="spec-markdown p-6 text-sm font-mono text-retro-text max-w-4xl mx-auto"
            v-html="renderedHtml"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.spec-markdown h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: rgb(var(--color-retro-cyan));
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgb(var(--color-retro-border));
}

.spec-markdown h2 {
  font-size: 1.25rem;
  font-weight: 700;
  color: rgb(var(--color-retro-cyan));
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}

.spec-markdown h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: rgb(var(--color-retro-text));
  margin-top: 1.25rem;
  margin-bottom: 0.375rem;
}

.spec-markdown h4,
.spec-markdown h5,
.spec-markdown h6 {
  font-size: 0.95rem;
  font-weight: 600;
  color: rgb(var(--color-retro-muted));
  margin-top: 1rem;
  margin-bottom: 0.25rem;
}

.spec-markdown p {
  margin-bottom: 0.625rem;
  line-height: 1.7;
}

.spec-markdown ul,
.spec-markdown ol {
  margin-bottom: 0.625rem;
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
  line-height: 1.6;
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
  margin: 1.25rem 0;
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
