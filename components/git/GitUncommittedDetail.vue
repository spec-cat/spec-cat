<script setup lang="ts">
import type { GitStatusFile } from "~/types/git";
import { FILE_STATUS_CONFIG } from "~/types/git";
import {
  XMarkIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
  PlusIcon,
  MinusIcon,
} from "@heroicons/vue/24/outline";

const props = withDefaults(defineProps<{
  stagedFiles?: readonly GitStatusFile[];
  unstagedFiles?: readonly GitStatusFile[];
  isStaging?: boolean;
  isCommitting?: boolean;
}>(), {
  stagedFiles: () => [],
  unstagedFiles: () => [],
  isStaging: false,
  isCommitting: false,
});

const emit = defineEmits<{
  (e: "close"): void;
  (e: "stageFiles", files: string[]): void;
  (e: "unstageFiles", files: string[]): void;
  (e: "stageAll"): void;
  (e: "unstageAll"): void;
  (e: "commit", message: string): void;
}>();

const commitMessage = ref("");
const isCommitting = ref(false);

const canCommit = computed(() => {
  return commitMessage.value.trim().length > 0 && props.stagedFiles.length > 0 && !isCommitting.value && !props.isCommitting;
});

function getStatusConfig(status: GitStatusFile["status"]) {
  return FILE_STATUS_CONFIG[status] || { label: status, colorClass: "text-retro-muted" };
}

function handleClose() {
  emit("close");
}

function handleStageFile(file: GitStatusFile) {
  emit("stageFiles", [file.path]);
}

function handleUnstageFile(file: GitStatusFile) {
  emit("unstageFiles", [file.path]);
}

function handleStageAll() {
  emit("stageAll");
}

function handleUnstageAll() {
  emit("unstageAll");
}

async function handleCommit() {
  if (!canCommit.value) return;
  isCommitting.value = true;
  emit("commit", commitMessage.value.trim());
  commitMessage.value = "";
  isCommitting.value = false;
}

function handleCommitKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    handleCommit();
  }
}
</script>

<template>
  <section
    class="flex-1 min-h-0 flex flex-col border-t border-retro-border bg-retro-dark"
    aria-label="Uncommitted changes details"
  >
    <!-- Header -->
    <div class="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-retro-border bg-retro-panel">
      <div class="flex items-center gap-2 min-w-0">
        <ExclamationCircleIcon class="w-4 h-4 text-retro-yellow" />
        <span class="text-retro-yellow font-semibold text-sm">Uncommitted Changes</span>
        <span class="text-retro-muted text-sm">({{ stagedFiles.length + unstagedFiles.length }} files)</span>
        <div
          v-if="props.isStaging"
          class="w-3 h-3 border-2 border-retro-muted border-t-retro-cyan rounded-full animate-spin"
          title="Staging..."
        />
      </div>
      <button
        @click="handleClose"
        class="p-1 hover:bg-retro-dark rounded transition-colors focus:outline-none focus:ring-2 focus:ring-retro-cyan"
        aria-label="Close uncommitted changes details"
      >
        <XMarkIcon class="w-4 h-4 text-retro-muted hover:text-retro-text" />
      </button>
    </div>

    <!-- Content (scrollable) -->
    <div class="flex-1 overflow-auto p-4 space-y-3">
      <!-- Commit Message + Button -->
      <div class="space-y-2">
        <textarea
          v-model="commitMessage"
          placeholder="Commit message..."
          rows="3"
          class="w-full px-3 py-2 text-sm bg-retro-panel border border-retro-border rounded text-retro-text placeholder-retro-muted focus:outline-none focus:border-retro-cyan resize-none font-mono"
          @keydown="handleCommitKeydown"
        />
        <button
          :disabled="!canCommit"
          class="w-full px-3 py-1.5 text-sm font-semibold rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :class="canCommit
            ? 'bg-retro-green text-retro-dark hover:bg-retro-green/90'
            : 'bg-retro-green/30 text-retro-dark'"
          @click="handleCommit"
        >
          {{ (isCommitting || props.isCommitting) ? "Committing..." : `Commit (${stagedFiles.length} staged)` }}
        </button>
      </div>

      <!-- Staged Changes Section -->
      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <h4 class="text-retro-green text-xs uppercase tracking-wide font-semibold">
            Staged Changes ({{ stagedFiles.length }})
          </h4>
          <button
            v-if="stagedFiles.length > 0"
            class="text-[11px] text-retro-muted hover:text-retro-text transition-colors"
            @click="handleUnstageAll"
          >
            Unstage All
          </button>
        </div>

        <div v-if="stagedFiles.length === 0" class="text-retro-muted text-xs py-1">
          No staged files. Stage files below to commit.
        </div>

        <ul v-else class="space-y-0.5">
          <li
            v-for="file in stagedFiles"
            :key="'staged-' + file.path"
            class="flex items-center gap-2 text-sm py-1 px-2 hover:bg-retro-panel rounded group"
          >
            <!-- Unstage button -->
            <button
              class="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-retro-red/20 transition-colors opacity-60 group-hover:opacity-100"
              title="Unstage file"
              :aria-label="`Unstage ${file.path}`"
              @click="handleUnstageFile(file)"
            >
              <MinusIcon class="w-3.5 h-3.5 text-retro-red" />
            </button>

            <!-- Status badge -->
            <span
              class="flex-shrink-0 w-4 text-center text-xs font-bold"
              :class="getStatusConfig(file.status).colorClass"
            >
              {{ file.status }}
            </span>

            <!-- File icon -->
            <DocumentTextIcon class="w-3.5 h-3.5 text-retro-muted flex-shrink-0" />

            <!-- File path -->
            <span class="text-retro-text font-mono text-xs truncate">
              {{ file.oldPath ? `${file.oldPath} → ${file.path}` : file.path }}
            </span>
          </li>
        </ul>
      </div>

      <!-- Unstaged Changes Section -->
      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <h4 class="text-retro-yellow text-xs uppercase tracking-wide font-semibold">
            Unstaged Changes ({{ unstagedFiles.length }})
          </h4>
          <button
            v-if="unstagedFiles.length > 0"
            class="text-[11px] text-retro-muted hover:text-retro-text transition-colors"
            @click="handleStageAll"
          >
            Stage All
          </button>
        </div>

        <div v-if="unstagedFiles.length === 0" class="text-retro-muted text-xs py-1">
          No unstaged changes.
        </div>

        <ul v-else class="space-y-0.5">
          <li
            v-for="file in unstagedFiles"
            :key="'unstaged-' + file.path"
            class="flex items-center gap-2 text-sm py-1 px-2 hover:bg-retro-panel rounded group"
          >
            <!-- Stage button -->
            <button
              class="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-retro-green/20 transition-colors opacity-60 group-hover:opacity-100"
              title="Stage file"
              :aria-label="`Stage ${file.path}`"
              @click="handleStageFile(file)"
            >
              <PlusIcon class="w-3.5 h-3.5 text-retro-green" />
            </button>

            <!-- Status badge -->
            <span
              class="flex-shrink-0 w-4 text-center text-xs font-bold"
              :class="getStatusConfig(file.status).colorClass"
            >
              {{ file.status }}
            </span>

            <!-- File icon -->
            <DocumentTextIcon class="w-3.5 h-3.5 text-retro-muted flex-shrink-0" />

            <!-- File path -->
            <span class="text-retro-text font-mono text-xs truncate">
              {{ file.oldPath ? `${file.oldPath} → ${file.path}` : file.path }}
            </span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
