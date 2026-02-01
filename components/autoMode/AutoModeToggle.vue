<script setup lang="ts">
import { BoltIcon } from '@heroicons/vue/24/outline'
import { useAutoModeStore } from '~/stores/autoMode'

const autoModeStore = useAutoModeStore()

onMounted(() => {
  autoModeStore.initialize()
})
</script>

<template>
  <button
    type="button"
    class="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono transition-colors"
    :class="autoModeStore.enabled
      ? 'bg-retro-yellow/20 text-retro-yellow hover:bg-retro-yellow/30'
      : 'text-retro-muted hover:text-retro-text hover:bg-retro-panel'"
    :disabled="autoModeStore.loading"
    title="Toggle Auto Mode — background spec processing"
    @click="autoModeStore.toggle()"
  >
    <BoltIcon
      class="h-4 w-4"
      :class="{ 'animate-pulse': autoModeStore.isActive }"
    />
    <span>Auto</span>
    <span
      v-if="autoModeStore.enabled"
      class="inline-block w-1.5 h-1.5 rounded-full bg-retro-yellow"
      :class="{ 'animate-pulse': autoModeStore.isActive }"
    />
  </button>
</template>
