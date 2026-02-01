<script setup lang="ts">
import type { SessionInitBlock } from '~/types/chat'

defineProps<{ block: SessionInitBlock }>()
</script>

<template>
  <div class="px-2 py-1 text-[10px] font-mono text-retro-muted border-b border-retro-border/20 mb-1 flex items-center gap-2">
    <span class="text-retro-cyan">{{ block.model }}</span>
    <span class="text-retro-border">|</span>
    <span>{{ block.tools.length }} tools</span>
    <span v-if="block.permissionMode" class="text-retro-border">|</span>
    <span v-if="block.permissionMode">{{ block.permissionMode }}</span>
  </div>
</template>
