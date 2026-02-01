<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from "vue";
import { XMarkIcon } from "@heroicons/vue/24/outline";
import { FILE_STATUS_CONFIG } from "~/types/git";
import type { FileDiffResponse, FileChange } from "~/types/git";

// =============================================================================
// Props / Emits
// =============================================================================

interface Props {
  file: FileChange;
  commitHash: string;
  content: FileDiffResponse | null;
  loading: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

// =============================================================================
// State
// =============================================================================

const containerRef = ref<HTMLElement | null>(null);

// =============================================================================
// Computed
// =============================================================================

const shortHash = computed(() => props.commitHash.substring(0, 7));

const statusConfig = computed(() => {
  return (
    FILE_STATUS_CONFIG[props.file.status as keyof typeof FILE_STATUS_CONFIG] || {
      label: props.file.status,
      colorClass: "text-retro-muted",
    }
  );
});

const isRename = computed(() => props.file.status === "R" && props.file.oldPath);

const headerFilePath = computed(() => {
  if (isRename.value && props.file.oldPath) {
    return `${props.file.oldPath} → ${props.file.path}`;
  }
  return props.file.path;
});

// =============================================================================
// Keyboard handling (FR-091)
// =============================================================================

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    emit("close");
  }
}

onMounted(() => {
  containerRef.value?.focus();
});

onUnmounted(() => {
  // cleanup if needed
});
</script>

<template>
  <div
    ref="containerRef"
    :tabindex="0"
    @keydown="handleKeydown"
    class="flex flex-col h-full bg-retro-dark focus:outline-none"
    aria-label="File diff viewer"
    role="region"
  >
    <!-- Header (FR-090) -->
    <div
      class="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-retro-border bg-retro-panel"
    >
      <div class="flex items-center gap-2 min-w-0">
        <!-- Status badge -->
        <span
          class="flex-shrink-0 w-5 h-5 flex items-center justify-center text-xs font-bold rounded"
          :class="statusConfig.colorClass"
          :title="statusConfig.label"
        >
          {{ file.status }}
        </span>

        <!-- File path (T128: rename display) -->
        <span class="text-retro-text font-mono text-sm truncate">
          <template v-if="isRename && file.oldPath">
            <span class="text-retro-muted">{{ file.oldPath }}</span>
            <span class="text-retro-yellow mx-1">&rarr;</span>
            <span class="text-retro-text">{{ file.path }}</span>
          </template>
          <template v-else>
            {{ file.path }}
          </template>
        </span>

        <!-- Commit short hash -->
        <span class="text-retro-muted font-mono text-xs flex-shrink-0">
          @ {{ shortHash }}
        </span>
      </div>

      <!-- Close button (FR-091) -->
      <button
        @click="emit('close')"
        class="p-1 hover:bg-retro-dark rounded transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-retro-cyan"
        aria-label="Close diff viewer"
        title="Close (Esc)"
      >
        <XMarkIcon class="w-5 h-5 text-retro-muted hover:text-retro-text" />
      </button>
    </div>

    <!-- Content area -->
    <div class="flex-1 overflow-auto">
      <!-- Loading state -->
      <div
        v-if="loading"
        class="flex items-center justify-center gap-2 text-retro-muted text-sm py-8"
      >
        <div
          class="w-4 h-4 border-2 border-retro-muted border-t-retro-cyan rounded-full animate-spin"
        />
        Loading diff...
      </div>

      <!-- Binary file indicator (FR-093) -->
      <div
        v-else-if="content && content.binary"
        class="flex items-center justify-center text-retro-muted text-sm py-8"
      >
        <span class="bg-retro-panel px-4 py-2 rounded font-mono">
          Binary file — cannot display diff
        </span>
      </div>

      <!-- No content / empty diff -->
      <div
        v-else-if="content && content.lines.length === 0"
        class="flex items-center justify-center text-retro-muted text-sm py-8"
      >
        <span class="bg-retro-panel px-4 py-2 rounded font-mono">
          No changes in this file
        </span>
      </div>

      <!-- Diff content (FR-089) -->
      <table
        v-else-if="content"
        class="w-full text-xs font-mono border-collapse diff-table"
      >
        <tbody>
          <!-- Truncation warning -->
          <tr v-if="content.truncated" class="diff-warning">
            <td colspan="3" class="px-4 py-2 text-retro-yellow bg-retro-panel text-center">
              Diff truncated — file has more than 10,000 lines
            </td>
          </tr>

          <tr
            v-for="(line, index) in content.lines"
            :key="index"
            :class="{
              'diff-add': line.type === 'add',
              'diff-delete': line.type === 'delete',
              'diff-context': line.type === 'context',
              'diff-header': line.type === 'header',
            }"
          >
            <!-- Hunk header row -->
            <template v-if="line.type === 'header'">
              <td colspan="3" class="diff-hunk-header px-4 py-1">
                {{ line.content }}
              </td>
            </template>

            <!-- Normal diff line -->
            <template v-else>
              <!-- Old line number -->
              <td class="diff-line-num select-none text-right px-2 w-12">
                {{ line.oldLineNumber ?? '' }}
              </td>
              <!-- New line number -->
              <td class="diff-line-num select-none text-right px-2 w-12 border-r border-retro-border">
                {{ line.newLineNumber ?? '' }}
              </td>
              <!-- Line content -->
              <td class="diff-line-content px-3 whitespace-pre-wrap break-all">
                <span v-if="line.type === 'add'" class="diff-sign">+</span>
                <span v-else-if="line.type === 'delete'" class="diff-sign">-</span>
                <span v-else class="diff-sign">&nbsp;</span>
                {{ line.content }}
              </td>
            </template>
          </tr>
        </tbody>
      </table>

      <!-- Error fallback -->
      <div
        v-else
        class="flex items-center justify-center text-retro-muted text-sm py-8"
      >
        Failed to load diff content.
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff-table {
  line-height: 1.5;
}

/* Line number columns */
.diff-line-num {
  color: var(--retro-muted, #64748b);
  user-select: none;
  vertical-align: top;
  min-width: 3rem;
}

/* Sign prefix (+/-/ ) */
.diff-sign {
  display: inline-block;
  width: 1ch;
  user-select: none;
}

/* Add lines (FR-089: green background) */
.diff-add {
  background-color: rgba(16, 185, 129, 0.12);
}
.diff-add .diff-line-num {
  background-color: rgba(16, 185, 129, 0.18);
}
.diff-add .diff-line-content {
  color: var(--retro-green, #10b981);
}
.diff-add .diff-sign {
  color: var(--retro-green, #10b981);
}

/* Delete lines (FR-089: red background) */
.diff-delete {
  background-color: rgba(239, 68, 68, 0.12);
}
.diff-delete .diff-line-num {
  background-color: rgba(239, 68, 68, 0.18);
}
.diff-delete .diff-line-content {
  color: var(--retro-red, #ef4444);
}
.diff-delete .diff-sign {
  color: var(--retro-red, #ef4444);
}

/* Context lines */
.diff-context .diff-line-content {
  color: var(--retro-text, #e2e8f0);
}

/* Hunk headers */
.diff-hunk-header {
  color: var(--retro-cyan, #06b6d4);
  background-color: rgba(6, 182, 212, 0.08);
  font-style: italic;
}

/* Truncation warning */
.diff-warning td {
  border-bottom: 1px solid var(--retro-border, #334155);
}
</style>
