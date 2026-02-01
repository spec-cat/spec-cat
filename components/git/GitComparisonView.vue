<script setup lang="ts">
import type { GitLogCommit } from "~/types/git";
import { FILE_STATUS_CONFIG } from "~/types/git";
import { XMarkIcon } from "@heroicons/vue/24/outline";
import { normalizeFileStatusKey } from "~/utils/gitGraphHelpers";

interface ComparisonFile {
  path: string;
  oldPath?: string;
  status: string;
  additions: number;
  deletions: number;
  binary: boolean;
}

interface Props {
  fromCommit: GitLogCommit;
  toCommit: GitLogCommit;
  files: readonly ComparisonFile[] | null;
  stats: { filesChanged: number; additions: number; deletions: number } | null;
  loading: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

function getStatusConfig(status: string) {
  const statusKey = normalizeFileStatusKey(status)
  return FILE_STATUS_CONFIG[statusKey] || FILE_STATUS_CONFIG['M'];
}
</script>

<template>
  <div class="flex flex-col h-full border-t border-retro-border bg-retro-dark">
    <!-- Header -->
    <div class="flex items-center justify-between p-2 border-b border-retro-border flex-shrink-0">
      <div class="flex items-center gap-2 text-xs min-w-0">
        <span class="text-retro-muted">Comparing</span>
        <span class="font-mono text-retro-cyan">{{ fromCommit.shortHash }}</span>
        <span class="text-retro-muted">&rarr;</span>
        <span class="font-mono text-retro-cyan">{{ toCommit.shortHash }}</span>
      </div>
      <button
        class="p-1 text-retro-muted hover:text-retro-text transition-colors flex-shrink-0"
        aria-label="Close comparison"
        @click="emit('close')"
      >
        <XMarkIcon class="w-4 h-4" />
      </button>
    </div>

    <!-- Stats summary -->
    <div v-if="stats" class="px-3 py-1.5 text-xs text-retro-muted border-b border-retro-border flex-shrink-0">
      {{ stats.filesChanged }} file{{ stats.filesChanged !== 1 ? 's' : '' }} changed,
      <span class="text-retro-green">+{{ stats.additions }}</span>
      <span class="text-retro-red"> -{{ stats.deletions }}</span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <div class="flex items-center gap-2 text-retro-muted text-sm">
        <div class="w-4 h-4 border-2 border-retro-muted border-t-retro-cyan rounded-full animate-spin" />
        Loading comparison...
      </div>
    </div>

    <!-- File list -->
    <div v-else-if="files && files.length > 0" class="flex-1 overflow-auto">
      <div
        v-for="file in files"
        :key="file.path"
        class="flex items-center gap-2 px-3 py-1.5 hover:bg-retro-panel/50 text-xs border-b border-retro-border/50"
      >
        <!-- Status badge -->
        <span
          class="flex-shrink-0 w-4 text-center font-semibold text-[10px]"
          :class="getStatusConfig(file.status).colorClass"
        >
          {{ file.status.charAt(0) }}
        </span>

        <!-- File path -->
        <span class="text-retro-text truncate flex-1">
          <template v-if="file.oldPath && file.status.startsWith('R')">
            <span class="text-retro-muted">{{ file.oldPath }}</span>
            <span class="text-retro-muted mx-1">&rarr;</span>
          </template>
          {{ file.path }}
        </span>

        <!-- Stats -->
        <span v-if="!file.binary" class="flex-shrink-0 text-[10px] font-mono">
          <span v-if="file.additions > 0" class="text-retro-green">+{{ file.additions }}</span>
          <span v-if="file.deletions > 0" class="text-retro-red ml-1">-{{ file.deletions }}</span>
        </span>
        <span v-else class="flex-shrink-0 text-[10px] text-retro-muted italic">binary</span>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="files && files.length === 0" class="flex-1 flex items-center justify-center text-retro-muted text-sm">
      No differences between these commits
    </div>
  </div>
</template>
