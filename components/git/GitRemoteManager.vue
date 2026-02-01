<script setup lang="ts">
import type { GitRemote } from "~/types/git";
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
  CheckIcon,
} from "@heroicons/vue/24/outline";

interface Props {
  remotes: readonly GitRemote[];
  loading?: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: "add", data: { name: string; url: string }): void;
  (e: "edit", data: { name: string; newUrl: string }): void;
  (e: "delete", name: string): void;
  (e: "close"): void;
}>();

const showAddForm = ref(false);
const addName = ref("");
const addUrl = ref("");
const editingRemote = ref<string | null>(null);
const editUrl = ref("");

function startAdd() {
  showAddForm.value = true;
  addName.value = "";
  addUrl.value = "";
}

function confirmAdd() {
  if (!addName.value.trim() || !addUrl.value.trim()) return;
  emit("add", { name: addName.value.trim(), url: addUrl.value.trim() });
  showAddForm.value = false;
}

function startEdit(remote: GitRemote) {
  editingRemote.value = remote.name;
  editUrl.value = remote.fetchUrl;
}

function confirmEdit(name: string) {
  if (!editUrl.value.trim()) return;
  emit("edit", { name, newUrl: editUrl.value.trim() });
  editingRemote.value = null;
}

function cancelEdit() {
  editingRemote.value = null;
}
</script>

<template>
  <div class="flex flex-col bg-retro-dark border border-retro-border rounded shadow-lg max-w-md w-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-retro-border">
      <h3 class="text-sm font-semibold text-retro-text">Remote Repositories</h3>
      <button
        class="p-0.5 text-retro-muted hover:text-retro-text transition-colors"
        @click="emit('close')"
      >
        <XMarkIcon class="w-4 h-4" />
      </button>
    </div>

    <!-- Remote list -->
    <div class="flex-1 overflow-auto max-h-[300px]">
      <div
        v-for="remote in remotes"
        :key="remote.name"
        class="flex items-center gap-2 px-3 py-2 border-b border-retro-border/50 text-xs"
      >
        <span class="font-semibold text-retro-cyan flex-shrink-0 min-w-[60px]">{{ remote.name }}</span>

        <template v-if="editingRemote === remote.name">
          <input
            v-model="editUrl"
            type="text"
            class="flex-1 px-2 py-1 text-xs bg-retro-panel border border-retro-border rounded text-retro-text focus:outline-none focus:border-retro-cyan"
            @keyup.enter="confirmEdit(remote.name)"
            @keyup.escape="cancelEdit"
          />
          <button class="p-0.5 text-retro-green hover:text-retro-green/80" @click="confirmEdit(remote.name)">
            <CheckIcon class="w-3.5 h-3.5" />
          </button>
          <button class="p-0.5 text-retro-muted hover:text-retro-text" @click="cancelEdit">
            <XMarkIcon class="w-3.5 h-3.5" />
          </button>
        </template>

        <template v-else>
          <span class="text-retro-muted truncate flex-1 font-mono">{{ remote.fetchUrl }}</span>
          <button class="p-0.5 text-retro-muted hover:text-retro-text" title="Edit" @click="startEdit(remote)">
            <PencilSquareIcon class="w-3.5 h-3.5" />
          </button>
          <button class="p-0.5 text-retro-muted hover:text-retro-red" title="Delete" @click="emit('delete', remote.name)">
            <TrashIcon class="w-3.5 h-3.5" />
          </button>
        </template>
      </div>

      <div v-if="remotes.length === 0" class="px-3 py-4 text-center text-retro-muted text-xs">
        No remotes configured
      </div>
    </div>

    <!-- Add form -->
    <div v-if="showAddForm" class="px-3 py-2 border-t border-retro-border space-y-2">
      <input
        v-model="addName"
        type="text"
        placeholder="Remote name (e.g., origin)"
        class="w-full px-2 py-1 text-xs bg-retro-panel border border-retro-border rounded text-retro-text placeholder-retro-muted focus:outline-none focus:border-retro-cyan"
      />
      <input
        v-model="addUrl"
        type="text"
        placeholder="Remote URL"
        class="w-full px-2 py-1 text-xs bg-retro-panel border border-retro-border rounded text-retro-text placeholder-retro-muted focus:outline-none focus:border-retro-cyan"
        @keyup.enter="confirmAdd"
      />
      <div class="flex gap-2 justify-end">
        <button
          class="px-2 py-1 text-xs text-retro-muted hover:text-retro-text transition-colors"
          @click="showAddForm = false"
        >
          Cancel
        </button>
        <button
          class="px-2 py-1 text-xs bg-retro-cyan/20 text-retro-cyan border border-retro-cyan/40 rounded hover:bg-retro-cyan/30 transition-colors"
          :disabled="!addName.trim() || !addUrl.trim()"
          @click="confirmAdd"
        >
          Add Remote
        </button>
      </div>
    </div>

    <!-- Footer -->
    <div v-if="!showAddForm" class="px-3 py-2 border-t border-retro-border">
      <button
        class="flex items-center gap-1 text-xs text-retro-cyan hover:text-retro-cyan/80 transition-colors"
        @click="startAdd"
      >
        <PlusIcon class="w-3.5 h-3.5" />
        Add Remote
      </button>
    </div>
  </div>
</template>
