<script setup lang="ts">
import type { SpecFeature, SpecFile } from '~/types/app'

defineProps<{
  feature: SpecFeature | null
  selectedFile: { featureId: string; filename: string; label: string } | null
  loadingContent: boolean
  renderedHtml: string
  content: string
  themeVars: Record<string, string>
}>()

defineEmits<{
  close: []
  edit: []
  selectFile: [featureId: string, file: SpecFile]
}>()
</script>

<template>
  <div
    v-if="feature"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
    :style="themeVars"
    @click.self="$emit('close')"
  >
    <div class="grid h-[94vh] w-[min(1100px,96vw)] grid-rows-[40px_auto_minmax(0,1fr)] border border-[var(--rg-border)] bg-[var(--rg-editor)] text-[var(--rg-foreground)] shadow-2xl">
      <div class="flex min-w-0 items-center justify-between gap-3 border-b border-[var(--rg-border)] bg-[var(--rg-editor-group)] px-4">
        <div class="flex min-w-0 items-center gap-2">
          <span class="shrink-0 bg-[var(--rg-accent)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">spec</span>
          <span class="min-w-0 truncate font-mono text-xs font-bold">{{ feature.id }}</span>
          <span class="hidden min-w-0 truncate text-[11px] text-[var(--rg-muted)] sm:block">{{ feature.name }}</span>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          <button
            v-if="selectedFile"
            type="button"
            class="h-6 border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 text-[10px] font-bold uppercase text-[var(--rg-foreground)] hover:border-[var(--rg-accent)] hover:text-[var(--rg-accent)] disabled:opacity-50"
            :disabled="loadingContent"
            @click="$emit('edit')"
          >
            Edit
          </button>
          <button
            type="button"
            class="text-lg text-[var(--rg-muted)] hover:text-white"
            title="Close (Esc)"
            @click="$emit('close')"
          >
            ×
          </button>
        </div>
      </div>
      <div class="flex min-w-0 items-stretch overflow-x-auto border-b border-[var(--rg-border)] bg-[var(--rg-editor-group)]">
        <button
          v-for="file in feature.files"
          :key="file.filename"
          type="button"
          class="shrink-0 border-b-2 px-4 py-2 text-[11px] font-mono"
          :class="selectedFile?.filename === file.filename
            ? 'border-[var(--rg-accent)] bg-[var(--rg-editor)] text-[var(--rg-accent)]'
            : 'border-transparent text-[#a0988e] hover:text-[var(--rg-foreground)]'"
          :title="file.filename"
          @click="$emit('selectFile', feature.id, file)"
        >
          {{ file.label }}
        </button>
      </div>
      <div class="min-h-0 overflow-auto px-6 py-5 text-[13px] leading-6 text-[#c8bdaf]">
        <p v-if="!feature.files.length" class="text-[#88857c]">This spec directory has no files.</p>
        <p v-else-if="loadingContent" class="text-[#88857c]">Loading...</p>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-else-if="renderedHtml" class="spec-markdown" v-html="renderedHtml" />
        <pre v-else class="whitespace-pre-wrap break-words font-mono text-[12px]">{{ content }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spec-markdown {
  word-break: break-word;
}

.spec-markdown :deep(h1),
.spec-markdown :deep(h2),
.spec-markdown :deep(h3),
.spec-markdown :deep(h4) {
  margin: 10px 0 4px;
  font-weight: 700;
  color: var(--rg-foreground);
}

.spec-markdown :deep(h1) {
  font-size: 13px;
  color: var(--rg-accent);
}

.spec-markdown :deep(h2) {
  font-size: 12px;
  color: var(--rg-accent);
}

.spec-markdown :deep(h3),
.spec-markdown :deep(h4) {
  font-size: 11px;
}

.spec-markdown :deep(p) {
  margin: 4px 0;
}

.spec-markdown :deep(ul),
.spec-markdown :deep(ol) {
  margin: 4px 0;
  padding-left: 16px;
  list-style: disc;
}

.spec-markdown :deep(ol) {
  list-style: decimal;
}

.spec-markdown :deep(li) {
  margin: 2px 0;
}

.spec-markdown :deep(code) {
  padding: 0 3px;
  background: rgba(0, 0, 0, 0.3);
  color: var(--rg-accent);
}

.spec-markdown :deep(pre) {
  margin: 6px 0;
  padding: 6px 8px;
  overflow-x: auto;
  background: rgba(0, 0, 0, 0.3);
}

.spec-markdown :deep(pre code) {
  padding: 0;
  background: none;
  color: inherit;
}

.spec-markdown :deep(blockquote) {
  margin: 4px 0;
  padding-left: 8px;
  border-left: 2px solid var(--rg-border);
  color: var(--rg-muted);
}

.spec-markdown :deep(table) {
  margin: 6px 0;
  border-collapse: collapse;
}

.spec-markdown :deep(th),
.spec-markdown :deep(td) {
  padding: 2px 6px;
  border: 1px solid var(--rg-border);
}

.spec-markdown :deep(a) {
  color: var(--rg-accent);
  text-decoration: underline;
}

.spec-markdown :deep(hr) {
  margin: 8px 0;
  border-color: var(--rg-border);
}

.spec-markdown :deep(input[type='checkbox']) {
  margin-right: 4px;
}
</style>
