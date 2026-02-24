<script setup lang="ts">
/**
 * AutoModeSettings Component (T048-T050)
 * Settings section for Auto Mode concurrency control
 */
import { BoltIcon } from '@heroicons/vue/24/outline'
import { useSettingsStore } from '~/stores/settings'

const settingsStore = useSettingsStore()

// T049: Concurrency number input (range 1-10, default 3)
const concurrency = computed({
  get: () => settingsStore.autoModeConcurrency,
  set: (value: number) => {
    // T050: Connect to settings store
    settingsStore.setAutoModeConcurrency(value)
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Section header -->
    <div class="flex items-center gap-3">
      <BoltIcon class="w-6 h-6 text-retro-yellow" />
      <h3 class="text-lg font-mono text-retro-cyan">Auto Mode</h3>
    </div>

    <!-- Concurrency setting -->
    <div class="space-y-2">
      <label for="concurrency" class="block text-sm font-mono text-retro-text">
        Concurrent Features
      </label>
      <p class="text-xs text-retro-muted">
        Number of spec features to process simultaneously (1-10)
      </p>
      <div class="flex items-center gap-4">
        <input
          id="concurrency"
          type="range"
          min="1"
          max="10"
          step="1"
          v-model.number="concurrency"
          class="flex-1 h-2 bg-retro-panel rounded-lg appearance-none cursor-pointer slider-yellow"
        />
        <span class="text-sm font-mono text-retro-cyan w-8 text-center">
          {{ concurrency }}
        </span>
      </div>
    </div>

    <!-- Explanation -->
    <div class="text-xs text-retro-muted/80 space-y-1">
      <p>Higher values process more features at once but may impact system performance.</p>
      <p>Recommended: 3 features for most systems.</p>
    </div>
  </div>
</template>

<style scoped>
/* Custom range slider styling */
.slider-yellow::-webkit-slider-thumb {
  @apply appearance-none w-4 h-4 bg-retro-yellow rounded-full cursor-pointer;
  @apply hover:bg-retro-yellow/80 transition-colors;
}

.slider-yellow::-moz-range-thumb {
  @apply w-4 h-4 bg-retro-yellow rounded-full cursor-pointer border-0;
  @apply hover:bg-retro-yellow/80 transition-colors;
}

.slider-yellow::-webkit-slider-runnable-track {
  @apply bg-retro-border/50;
}

.slider-yellow::-moz-range-track {
  @apply bg-retro-border/50;
}
</style>