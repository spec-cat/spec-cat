<script setup lang="ts">
import type { WorktreeItem } from '~/types/app'

defineProps<{
  open: boolean
  worktrees: WorktreeItem[]
  loading: boolean
  actionRunning: boolean
  themeVars: Record<string, string>
}>()

defineEmits<{
  close: []
  create: []
  remove: [worktree: WorktreeItem]
}>()

const createEl = ref<HTMLButtonElement | null>(null)

defineExpose({
  focusCreate: () => createEl.value?.focus()
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[105] flex items-center justify-center bg-black/70 p-4"
    :style="themeVars"
  >
    <form class="w-full max-w-2xl border border-[var(--rg-border)] bg-[var(--rg-editor)] text-[var(--rg-foreground)] shadow-2xl" @submit.prevent="$emit('create')">
      <div class="flex h-10 items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
        <span>Worktrees</span>
        <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="$emit('close')">×</button>
      </div>
      <div class="grid max-h-[60vh] gap-1 overflow-auto p-4 font-mono text-xs">
        <p v-if="loading" class="text-[var(--rg-muted)]">Loading worktrees...</p>
        <p v-else-if="!worktrees.length" class="text-[var(--rg-muted)]">No worktrees found.</p>
        <div
          v-for="worktree in worktrees"
          :key="worktree.path"
          class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 py-2"
        >
          <span class="min-w-0">
            <span class="flex min-w-0 items-center gap-2">
              <span class="min-w-0 truncate font-bold" :title="worktree.path">{{ worktree.path }}</span>
              <span v-if="worktree.isMain" class="shrink-0 border border-[var(--rg-accent)] px-1 text-[9px] font-bold uppercase text-[var(--rg-accent)]">main</span>
              <span v-if="worktree.managed" class="shrink-0 border border-[var(--rg-border)] px-1 text-[9px] font-bold uppercase text-[var(--rg-muted)]">managed</span>
              <span v-if="worktree.locked" class="shrink-0 border border-[#f7b83d] px-1 text-[9px] font-bold uppercase text-[#f7b83d]">locked</span>
              <span v-if="worktree.prunable" class="shrink-0 border border-[#f03e5f] px-1 text-[9px] font-bold uppercase text-[#f03e5f]">prunable</span>
            </span>
            <span class="block truncate text-[10px] text-[var(--rg-muted)]">
              {{ worktree.branch || 'detached' }} · {{ worktree.head.slice(0, 8) }}
            </span>
          </span>
          <button
            v-if="!worktree.isMain && worktree.managed"
            type="button"
            class="grid h-6 w-6 shrink-0 place-items-center border border-[var(--rg-border)] text-sm hover:border-[#f03e5f] hover:text-[#f03e5f] disabled:opacity-40"
            title="Remove worktree"
            :disabled="actionRunning"
            @click="$emit('remove', worktree)"
          >
            ×
          </button>
        </div>
      </div>
      <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
        <button type="button" class="border border-[var(--rg-border)] px-3 py-1.5 text-xs" @click="$emit('close')">Close</button>
        <button
          ref="createEl"
          type="submit"
          class="bg-[var(--rg-button)] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          :disabled="actionRunning"
        >
          Create Worktree
        </button>
      </div>
    </form>
  </div>
</template>
