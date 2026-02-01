<script setup lang="ts">
import type { ThinkingBlock } from '~/types/chat'
import { ChevronRightIcon } from '@heroicons/vue/24/outline'

defineProps<{ block: ThinkingBlock }>()
const expanded = ref(false)
</script>

<template>
  <div class="my-1 border border-retro-border/30 rounded bg-retro-dark/30">
    <button
      class="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-mono text-retro-muted hover:text-retro-yellow transition-colors"
      @click="expanded = !expanded"
    >
      <ChevronRightIcon
        class="w-3 h-3 transition-transform flex-shrink-0"
        :class="{ 'rotate-90': expanded }"
      />
      <span class="text-retro-yellow">Thinking</span>
      <span class="ml-auto text-retro-muted/60 text-[10px]">
        {{ block.thinking.length }} chars
      </span>
    </button>
    <div
      v-if="expanded"
      class="px-3 pb-2 text-xs font-mono text-retro-muted whitespace-pre-wrap max-h-60 overflow-y-auto scrollbar-custom border-t border-retro-border/20"
    >
      {{ block.thinking }}
    </div>
  </div>
</template>
