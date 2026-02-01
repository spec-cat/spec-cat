<script setup lang="ts">
import type { WorktreeStatus } from '~/types/worktree'

interface Props {
  status: WorktreeStatus
}

const props = defineProps<Props>()

const statusConfig = computed(() => {
  const configs: Record<WorktreeStatus, { label: string; color: string }> = {
    clean: { label: 'clean', color: 'text-retro-green bg-retro-green/20' },
    dirty: { label: 'dirty', color: 'text-retro-yellow bg-retro-yellow/20' },
    ahead: { label: 'ahead', color: 'text-retro-cyan bg-retro-cyan/20' },
    behind: { label: 'behind', color: 'text-retro-orange bg-retro-orange/20' },
    diverged: { label: 'diverged', color: 'text-retro-red bg-retro-red/20' },
  }
  return configs[props.status]
})
</script>

<template>
  <span
    class="px-1.5 py-0.5 text-[10px] font-mono uppercase rounded"
    :class="statusConfig.color"
  >
    {{ statusConfig.label }}
  </span>
</template>
