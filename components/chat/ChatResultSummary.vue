<script setup lang="ts">
import type { ResultSummaryBlock } from '~/types/chat'

const props = defineProps<{ block: ResultSummaryBlock }>()

const duration = computed(() => {
  const s = Math.round(props.block.durationMs / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
})

const cost = computed(() => `$${props.block.totalCostUsd.toFixed(4)}`)

const tokens = computed(() => {
  const { inputTokens, outputTokens } = props.block.usage
  return `${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`
})
</script>

<template>
  <div class="mt-2 pt-2 border-t border-retro-border/20 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-retro-muted">
    <span class="flex items-center gap-1">
      <span class="text-retro-muted/60">time</span>
      {{ duration }}
    </span>
    <span class="flex items-center gap-1">
      <span class="text-retro-muted/60">cost</span>
      {{ cost }}
    </span>
    <span>{{ tokens }}</span>
    <span>{{ block.numTurns }} turn{{ block.numTurns !== 1 ? 's' : '' }}</span>
  </div>
</template>
