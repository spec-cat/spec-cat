<script setup lang="ts">
import type { SessionListItem } from '~/types/session'
import { formatSessionTime } from '~/utils/app-formatters'

defineProps<{
  session: SessionListItem
  selected: boolean
  restoring: boolean
  deleting: boolean
  displayName: string
}>()

const emit = defineEmits<{
  select: [session: SessionListItem]
  restore: [session: SessionListItem]
  delete: [session: SessionListItem]
}>()
</script>

<template>
  <div
    class="group grid w-full grid-cols-[18px_minmax(0,1fr)] gap-2 px-3 py-1.5 text-left text-[12px] text-[#a0988e] hover:bg-[var(--rg-editor-group)]"
    :class="selected ? 'bg-[var(--rg-selection)] text-[var(--rg-editor)]' : ''"
    :title="session.id"
    role="button"
    tabindex="0"
    @click="emit('select', session)"
    @keydown.enter.prevent="emit('select', session)"
  >
    <span class="opacity-50">◌</span>
    <span class="min-w-0">
      <span class="flex min-w-0 items-center gap-2">
        <span class="block min-w-0 flex-1 truncate font-mono font-semibold">{{ displayName }}</span>
        <span class="shrink-0 text-[9px] font-bold uppercase opacity-70">{{ session.provider }}</span>
        <button
          type="button"
          class="shrink-0 px-1 text-[12px] leading-none opacity-60 hover:opacity-100 hover:text-[var(--rg-accent)]"
          :class="restoring ? 'cursor-wait' : ''"
          title="Restore conversation (recreates the worktree)"
          @click.stop="emit('restore', session)"
        >
          ↩
        </button>
        <button
          type="button"
          class="shrink-0 px-1 text-sm font-bold leading-none opacity-60 hover:opacity-100 hover:text-[#f03e5f]"
          :class="deleting ? 'cursor-wait' : ''"
          title="Permanently delete archived conversation"
          @click.stop="emit('delete', session)"
        >
          ×
        </button>
      </span>
      <span class="block truncate font-mono text-[11px] text-[#88857c]">
        archived {{ session.archivedAt ? formatSessionTime(session.archivedAt) : '' }}{{ session.branchKept === false ? ' · branch removed' : '' }}
      </span>
    </span>
  </div>
</template>
