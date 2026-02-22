<script setup lang="ts">
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/vue/24/outline";

interface Props {
  resultCount: number;
  currentIndex: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "search", query: string): void;
  (e: "next"): void;
  (e: "prev"): void;
  (e: "close"): void;
}>();

const searchInput = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function handleInput() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    emit("search", searchInput.value);
  }, 200);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (event.shiftKey) {
      emit("prev");
    } else {
      emit("next");
    }
  }
}

function clearSearch() {
  searchInput.value = "";
  emit("search", "");
  inputRef.value?.focus();
}

function focus() {
  inputRef.value?.focus();
  inputRef.value?.select();
}

defineExpose({ focus });
</script>

<template>
  <div class="flex items-center gap-1.5 px-2 py-1.5 bg-retro-panel border-b border-retro-border">
    <!-- Search icon -->
    <MagnifyingGlassIcon class="w-4 h-4 text-retro-muted flex-shrink-0" />

    <!-- Search input -->
    <div class="relative flex-1 min-w-0">
      <input
        ref="inputRef"
        v-model="searchInput"
        type="text"
        placeholder="Find in commits..."
        aria-label="Search commits"
        class="w-full px-2 py-1 text-sm bg-retro-dark border border-retro-border rounded text-retro-text placeholder-retro-muted focus:outline-none focus:border-retro-cyan"
        @input="handleInput"
        @keydown="handleKeydown"
      />
    </div>

    <!-- Result count -->
    <span
      v-if="searchInput"
      class="text-[11px] text-retro-muted flex-shrink-0 min-w-[60px] text-center"
    >
      <template v-if="resultCount > 0">
        {{ currentIndex + 1 }} of {{ resultCount }}
      </template>
      <template v-else>
        No results
      </template>
    </span>

    <!-- Navigation arrows -->
    <button
      class="p-0.5 text-retro-muted hover:text-retro-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      :disabled="resultCount === 0"
      aria-label="Previous result"
      title="Previous (Shift+Enter)"
      @click="emit('prev')"
    >
      <ChevronUpIcon class="w-4 h-4" />
    </button>
    <button
      class="p-0.5 text-retro-muted hover:text-retro-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      :disabled="resultCount === 0"
      aria-label="Next result"
      title="Next (Enter)"
      @click="emit('next')"
    >
      <ChevronDownIcon class="w-4 h-4" />
    </button>

    <!-- Close button -->
    <button
      class="p-0.5 text-retro-muted hover:text-retro-text transition-colors"
      aria-label="Close find widget"
      title="Close (Escape)"
      @click="emit('close')"
    >
      <XMarkIcon class="w-4 h-4" />
    </button>
  </div>
</template>
