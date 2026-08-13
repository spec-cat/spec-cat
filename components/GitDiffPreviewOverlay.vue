<script setup lang="ts">
import type { GitDiffLine, GitFileDiff } from '~/types/app'

defineProps<{
  diff: GitFileDiff | null
  lines: GitDiffLine[]
  loading: boolean
  error: string
  titleHash: string
  selectedPath: string
  lineClass: (line: GitDiffLine) => string
}>()

defineEmits<{
  close: []
}>()
</script>

<template>
  <section
    v-if="diff || loading || error"
    class="brick-diff-preview absolute inset-y-0 left-12 right-0 z-30 grid min-h-0 min-w-0 grid-rows-[36px_minmax(0,1fr)] border-l border-[var(--rg-border)] bg-[var(--rg-editor)] shadow-2xl"
  >
    <div class="flex min-w-0 items-center justify-between gap-3 border-b border-black/40 bg-[var(--rg-editor-group)] px-3 font-mono text-[11px]">
      <div class="flex min-w-0 items-center gap-2">
        <span class="bg-[var(--rg-accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
          {{ titleHash || diff?.hash.slice(0, 8) || 'diff' }}
        </span>
        <span class="min-w-0 truncate text-[var(--rg-foreground)]" :title="diff?.oldPath ? `${diff.oldPath} → ${diff.path}` : diff?.path">
          {{ diff?.oldPath ? `${diff.oldPath} → ${diff.path}` : diff?.path || selectedPath || 'Loading diff...' }}
        </span>
        <span v-if="diff?.truncated" class="shrink-0 bg-[#f7b83d] px-1.5 py-0.5 text-[10px] font-bold text-[#2b2a27]">
          truncated
        </span>
      </div>
      <button
        type="button"
        class="grid h-6 w-6 shrink-0 place-items-center border border-[var(--rg-border)] bg-[var(--rg-input)] text-[14px] text-[var(--rg-foreground)] hover:border-[var(--rg-accent)]"
        title="Close Preview"
        @click="$emit('close')"
      >
        ×
      </button>
    </div>
    <div class="min-h-0 overflow-auto bg-[#1b1a18] font-mono text-[12px] leading-5">
      <p v-if="loading" class="p-4 text-[#88857c]">Loading diff...</p>
      <p v-else-if="error" class="p-4 text-[#f03e5f]">{{ error }}</p>
      <div v-else-if="diff?.binary" class="p-4 text-[#f7b83d]">
        Binary file
      </div>
      <div v-else-if="diff">
        <div
          v-for="line in lines"
          :key="line.key"
          class="grid min-w-max grid-cols-[56px_56px_minmax(680px,1fr)] border-b border-black/10"
          :class="lineClass(line)"
        >
          <span class="select-none border-r border-black/20 px-2 text-right text-[#88857c]">{{ line.oldLine ?? '' }}</span>
          <span class="select-none border-r border-black/20 px-2 text-right text-[#88857c]">{{ line.newLine ?? '' }}</span>
          <span class="whitespace-pre px-3">{{ line.content || ' ' }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
