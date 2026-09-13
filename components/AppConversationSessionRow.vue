<script setup lang="ts">
import type { SessionListItem } from '~/types/session'
import { formatBytes, formatRuntimeState, formatSessionTime, runtimeStateClass } from '~/utils/app-formatters'

const props = defineProps<{
  session: SessionListItem
  active: boolean
  editing: boolean
  editingTitle: string
  archiving: boolean
  displayName: string
}>()

const emit = defineEmits<{
  select: [id: string]
  'update:editingTitle': [value: string]
  saveRename: []
  cancelRename: []
  startRename: [session: SessionListItem]
  archive: [session: SessionListItem]
  copy: [value: string]
}>()
</script>

<template>
  <div
    class="group grid w-full grid-cols-[18px_minmax(0,1fr)] gap-2 px-3 py-1.5 text-left text-[12px]"
    :class="active
      ? 'bg-[var(--rg-selection)] text-[var(--rg-editor)]'
      : session.previewBranch
        ? 'border-l-2 border-[var(--rg-accent)] bg-[var(--rg-editor-group)] text-[var(--rg-foreground)]'
        : 'text-[var(--rg-foreground)] hover:bg-[var(--rg-editor-group)]'"
    :title="session.id"
    role="button"
    tabindex="0"
    @click="emit('select', session.id)"
    @keydown.enter="emit('select', session.id)"
  >
    <span :class="active ? 'text-[var(--rg-editor)]' : 'text-[var(--rg-accent)]'">●</span>
    <span class="min-w-0">
      <span class="flex min-w-0 items-center gap-2">
        <input
          v-if="editing"
          :value="editingTitle"
          type="text"
          class="h-5 min-w-0 flex-1 border border-[var(--rg-accent)] bg-[var(--rg-input)] px-1 font-mono text-[12px] text-[var(--rg-foreground)] outline-none"
          placeholder="Conversation title"
          autofocus
          @input="emit('update:editingTitle', ($event.target as HTMLInputElement).value)"
          @click.stop
          @keydown.enter.prevent="emit('saveRename')"
          @keydown.esc.stop="emit('cancelRename')"
          @blur="emit('saveRename')"
        >
        <span
          v-else
          class="block min-w-0 flex-1 truncate font-mono font-semibold"
          :title="session.title ? `${session.title} · ${session.id}` : session.id"
          @dblclick.stop="emit('startRename', session)"
        >
          {{ displayName }}
        </span>
        <button
          type="button"
          class="shrink-0 px-1 text-[11px] leading-none opacity-0 hover:!opacity-100 group-hover:opacity-60"
          title="Rename conversation"
          @click.stop="emit('startRename', session)"
        >
          ✎
        </button>
        <button
          type="button"
          class="shrink-0 px-1 text-sm font-bold leading-none opacity-60 hover:opacity-100"
          :class="archiving ? 'cursor-wait' : ''"
          title="Archive conversation (tmux session and worktree are removed, branch is kept)"
          @click.stop="emit('archive', session)"
        >
          ×
        </button>
      </span>
      <span class="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
        <span class="shrink-0 text-[9px] font-bold uppercase opacity-70">{{ session.provider }}</span>
        <span class="shrink-0 px-1.5 py-0.5 text-[10px] font-bold" :class="runtimeStateClass(session)">
          {{ formatRuntimeState(session) }}
        </span>
        <span
          v-if="session.previewBranch"
          class="shrink-0 border border-[var(--rg-accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase"
          :class="active ? 'text-[var(--rg-editor)]' : 'text-[var(--rg-accent)]'"
        >
          preview
        </span>
      </span>
      <span
        v-if="session.worktreeBranch || session.baseBranch || session.cwd"
        class="mt-0.5 flex min-w-0 flex-wrap items-center gap-1"
        @click.stop
      >
        <button
          v-if="session.worktreeBranch"
          type="button"
          class="inline-flex min-w-0 max-w-full items-center gap-1 border border-[var(--rg-accent)] px-1.5 py-0.5 font-mono text-[9px] hover:bg-[var(--rg-accent)]/10"
          :class="active ? 'text-[var(--rg-editor)]' : 'text-[var(--rg-accent)]'"
          title="Click to copy current branch"
          @click.stop="emit('copy', session.worktreeBranch!)"
        >
          <span class="shrink-0 opacity-70">⑂</span>
          <span class="truncate">{{ session.worktreeBranch }}</span>
        </button>
        <button
          v-if="session.baseBranch"
          type="button"
          class="inline-flex min-w-0 max-w-full items-center gap-1 border px-1.5 py-0.5 font-mono text-[9px] hover:bg-black/5"
          :class="active ? 'border-[#2b2a27]/40 text-[#2b2a27]/80' : 'border-[#88857c]/50 text-[#88857c]'"
          title="Click to copy base branch"
          @click.stop="emit('copy', session.baseBranch!)"
        >
          <span class="truncate">base: {{ session.baseBranch }}</span>
        </button>
        <button
          v-if="session.cwd"
          type="button"
          class="inline-flex min-w-0 max-w-full items-center gap-1 border px-1.5 py-0.5 font-mono text-[9px] hover:bg-black/5"
          :class="active ? 'border-[#2b2a27]/40 text-[#2b2a27]/80' : 'border-[#88857c]/50 text-[#88857c]'"
          :title="`Click to copy worktree path: ${session.cwd}`"
          @click.stop="emit('copy', session.cwd)"
        >
          <span class="shrink-0 opacity-70">▚</span>
          <span class="truncate">{{ session.cwd }}</span>
        </button>
      </span>
      <span class="block truncate font-mono text-[11px]" :class="active ? 'text-[#2b2a27]/80' : 'text-[#88857c]'">
        {{ formatSessionTime(session.updatedAt) }} · {{ formatBytes(session.logBytes) }}
      </span>
      <span
        v-if="session.preview"
        class="block truncate text-[11px]"
        :class="active ? 'text-[#2b2a27]/70' : 'text-[#7a7267]'"
        :title="session.preview"
      >
        {{ session.preview }}
      </span>
    </span>
  </div>
</template>
