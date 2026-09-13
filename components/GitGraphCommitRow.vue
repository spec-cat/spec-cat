<script setup lang="ts">
import type { GitCommit, GraphRowData } from '~/types/app'
import { GRAPH_NODE_RADIUS, GRAPH_ROW_HEIGHT, graphLaneX, graphSegmentPath } from '~/utils/git-graph'
import { formatCommitDate } from '~/utils/app-formatters'

type GroupedBranch = { displayName: string, originalBranches: string[], isLocal: boolean }

defineProps<{
  commit: GitCommit
  row: GraphRowData | undefined
  columnWidth: number
  selected: boolean
  findMatch: boolean
  previewLine: boolean
  featureLine: boolean
  muted: boolean
  mergeBase: boolean
  groupedBranches: GroupedBranch[]
  showAuthor: boolean
  showDate: boolean
}>()

const emit = defineEmits<{
  select: [hash: string]
  contextMenu: [event: MouseEvent | KeyboardEvent, commit: GitCommit]
  branchContextMenu: [event: MouseEvent, commit: GitCommit, branch: string]
  tagContextMenu: [event: MouseEvent, commit: GitCommit, tag: string]
}>()
</script>

<template>
  <button
    type="button"
    class="group grid w-full cursor-pointer items-center border-b border-black/20 text-left text-[12px]"
    :class="[
      selected
        ? 'bg-[var(--rg-selection)] text-[var(--rg-editor)]'
        : findMatch
          ? 'bg-[var(--rg-accent)]/15 text-[var(--rg-foreground)] hover:bg-[var(--rg-editor-group)]'
          : previewLine
            ? 'bg-[#f03e5f]/12 text-[var(--rg-foreground)] hover:bg-[var(--rg-editor-group)]'
            : featureLine
              ? 'bg-[#26a6a6]/12 text-[var(--rg-foreground)] hover:bg-[var(--rg-editor-group)]'
              : 'text-[var(--rg-foreground)] hover:bg-[var(--rg-editor-group)]',
      muted ? 'opacity-40' : ''
    ]"
    :style="{ gridTemplateColumns: `${columnWidth}px minmax(0,1fr)`, height: `${GRAPH_ROW_HEIGHT}px` }"
    :title="commit.hash"
    :data-commit-hash="commit.hash"
    aria-haspopup="menu"
    @click="emit('select', commit.hash)"
    @contextmenu="emit('contextMenu', $event, commit)"
    @keydown="emit('contextMenu', $event, commit)"
  >
    <span class="relative block overflow-hidden">
      <svg :width="columnWidth" :height="GRAPH_ROW_HEIGHT" class="block shrink-0" aria-hidden="true">
        <path
          v-for="(segment, index) in row?.connections || []"
          :key="index"
          :d="graphSegmentPath(segment)"
          :stroke="segment.color"
          :stroke-dasharray="segment.type.startsWith('merge') ? '4 3' : undefined"
          stroke-width="2"
          fill="none"
        />
        <circle v-if="row?.nodeType === 'head'" :cx="graphLaneX(row?.lane || 0)" :cy="GRAPH_ROW_HEIGHT / 2" :r="GRAPH_NODE_RADIUS + 2" fill="none" stroke="currentColor" stroke-width="2" class="text-[var(--rg-accent)]" />
        <circle v-if="mergeBase" :cx="graphLaneX(row?.lane || 0)" :cy="GRAPH_ROW_HEIGHT / 2" :r="GRAPH_NODE_RADIUS + 3" fill="none" stroke="#f7b83d" stroke-width="1.5" stroke-dasharray="3 2" />
        <circle v-if="row?.nodeType === 'merge'" :cx="graphLaneX(row?.lane || 0)" :cy="GRAPH_ROW_HEIGHT / 2" :r="GRAPH_NODE_RADIUS + 1" fill="none" :stroke="row?.color || commit.color" stroke-width="1.5" />
        <circle :cx="graphLaneX(row?.lane || 0)" :cy="GRAPH_ROW_HEIGHT / 2" :r="row?.nodeType === 'merge' ? GRAPH_NODE_RADIUS - 1 : GRAPH_NODE_RADIUS" :fill="row?.color || commit.color" />
      </svg>
    </span>
    <span class="flex min-w-0 items-center gap-2 rounded-r px-2 transition-colors" :class="selected ? '' : 'group-hover:bg-[var(--rg-panel)]/50'" :style="{ height: `${GRAPH_ROW_HEIGHT - 4}px`, alignSelf: 'center' }">
      <span class="shrink-0 font-mono text-[11px]" :class="row?.nodeType === 'head' ? 'font-semibold text-[var(--rg-accent)]' : 'text-[var(--rg-muted)]'">{{ commit.shortHash }}</span>
      <span class="flex min-w-0 shrink-0 items-center gap-1">
        <span
          v-for="grouped in groupedBranches.slice(0, 3)"
          :key="grouped.displayName"
          class="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none"
          :class="selected ? 'border-[#2b2a27]/40 text-[#2b2a27]' : grouped.isLocal ? 'border-[#26a6a6]/50 text-[#26a6a6]' : 'border-[#ff9d5c]/50 text-[#ff9d5c]'"
          :title="grouped.originalBranches.join(', ')"
          @contextmenu="emit('branchContextMenu', $event, commit, grouped.originalBranches[0]!)"
        >{{ grouped.displayName }}</span>
        <span
          v-for="tag in commit.tags.slice(0, 3)"
          :key="`tag:${tag}`"
          class="shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold leading-none"
          :class="selected ? 'border-[#2b2a27]/40 text-[#2b2a27]' : 'border-[#c58cff]/50 text-[#c58cff]'"
          :title="`tag: ${tag}`"
          @contextmenu="emit('tagContextMenu', $event, commit, tag)"
        >{{ tag }}</span>
        <span v-if="mergeBase" class="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none" :class="selected ? 'border-[#2b2a27]/40 text-[#2b2a27]' : 'border-[#f7b83d]/50 text-[#f7b83d]'" title="Merge base of a conversation/preview branch and HEAD">base</span>
      </span>
      <span class="min-w-0 flex-1 truncate text-xs">{{ commit.subject }}</span>
      <span v-if="showAuthor" class="hidden shrink-0 text-[10px] text-[var(--rg-muted)] sm:inline">{{ commit.author.name }}</span>
      <span v-if="showDate" class="shrink-0 text-[10px] text-[var(--rg-muted)]">{{ formatCommitDate(commit.date) }}</span>
    </span>
  </button>
</template>
