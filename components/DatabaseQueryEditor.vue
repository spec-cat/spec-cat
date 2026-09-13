<script setup lang="ts">
import type { DatabaseConnectionSummary } from '~/types/database'

defineProps<{
  modelValue: string
  highlightedSql: string
  highlightedSegment: string
  activeConnection: DatabaseConnectionSummary | null
  loadingDraft: boolean
  running: boolean
  durationMs: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  cursor: [value: number]
  run: []
  close: []
}>()

const editor = ref<HTMLTextAreaElement | null>(null)
const syntaxLayer = ref<HTMLElement | null>(null)
const segmentLayer = ref<HTMLElement | null>(null)

function syncScroll() {
  if (!editor.value) return
  for (const layer of [syntaxLayer.value, segmentLayer.value]) {
    if (!layer) continue
    layer.scrollTop = editor.value.scrollTop
    layer.scrollLeft = editor.value.scrollLeft
  }
}

function updateCursor() {
  emit('cursor', editor.value?.selectionStart ?? 0)
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    emit('run')
  }
}

defineExpose({
  selectionStart: () => editor.value?.selectionStart ?? 0,
  resetCursor: () => {
    editor.value?.setSelectionRange(0, 0)
    syncScroll()
  }
})
</script>

<template>
  <div class="flex items-center border-b border-black/40 bg-[var(--rg-editor-group)] px-3 text-xs">
    <span class="border-r border-black/30 px-3 py-2 text-[var(--rg-foreground)]">SQL Query</span>
    <span class="ml-3 truncate text-[10px] text-[var(--rg-muted)]">{{ activeConnection ? `${activeConnection.name} — ${activeConnection.database}` : 'No connection selected' }}</span>
    <span v-if="loadingDraft" class="ml-2 text-[10px] text-[var(--rg-muted)]">Loading draft…</span>
    <button class="ml-auto md:hidden" @click="emit('close')">×</button>
  </div>
  <div class="sql-editor relative min-h-0 overflow-hidden bg-[var(--rg-terminal)]">
    <pre ref="segmentLayer" class="sql-layer sql-segment-layer" aria-hidden="true" v-html="highlightedSegment" />
    <pre ref="syntaxLayer" class="sql-layer sql-syntax-layer" aria-hidden="true" v-html="highlightedSql" />
    <textarea
      ref="editor"
      :value="modelValue"
      spellcheck="false"
      class="sql-input absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent p-4 font-mono text-[13px] leading-6 outline-none"
      aria-label="SQL query editor"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value); updateCursor()"
      @keydown="handleKeydown"
      @keyup="updateCursor"
      @click="updateCursor"
      @select="updateCursor"
      @scroll="syncScroll"
    />
  </div>
  <div class="flex items-center gap-2 border-y border-[var(--rg-border)] bg-[var(--rg-editor-group)] px-3 text-[11px]">
    <button class="h-6 bg-[#16825d] px-3 font-bold text-white disabled:opacity-40" :disabled="!activeConnection || running || !modelValue.trim()" @click="emit('run')">{{ running ? 'Running…' : '▶ Run Current' }}</button>
    <span class="text-[var(--rg-muted)]">Current statement · Ctrl/⌘ + Enter</span><span v-if="durationMs !== null" class="ml-auto text-[var(--rg-muted)]">{{ durationMs }} ms</span>
  </div>
</template>

<style scoped>
.sql-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  margin: 0;
  padding: 1rem;
  white-space: pre;
  tab-size: 2;
  pointer-events: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  line-height: 1.5rem;
}
.sql-segment-layer { color: transparent; }
.sql-segment-layer :deep(mark) {
  border-radius: 2px;
  background: color-mix(in srgb, var(--rg-accent) 13%, transparent);
  color: transparent;
  box-shadow: inset 2px 0 color-mix(in srgb, var(--rg-accent) 65%, transparent);
}
.sql-syntax-layer { color: var(--rg-foreground); }
.sql-syntax-layer :deep(.sql-keyword) { color: #57a9f8; font-weight: 600; }
.sql-syntax-layer :deep(.sql-string) { color: #d7e67e; }
.sql-syntax-layer :deep(.sql-identifier) { color: #f7b83d; }
.sql-syntax-layer :deep(.sql-number) { color: #c792ea; }
.sql-syntax-layer :deep(.sql-comment) { color: #7f8c8d; font-style: italic; }
.sql-input { z-index: 2; tab-size: 2; color: transparent; caret-color: var(--rg-foreground); -webkit-text-fill-color: transparent; }
.sql-input::selection { background: color-mix(in srgb, var(--rg-selection) 65%, transparent); }
</style>
