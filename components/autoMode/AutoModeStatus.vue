<script setup lang="ts">
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  ForwardIcon,
} from '@heroicons/vue/24/outline'
import { useAutoModeStore } from '~/stores/autoMode'

const autoModeStore = useAutoModeStore()

const stateIcons: Record<string, any> = {
  queued: ClockIcon,
  running: ArrowPathIcon,
  completed: CheckCircleIcon,
  failed: ExclamationCircleIcon,
  skipped: ForwardIcon,
}

const stateColors: Record<string, string> = {
  queued: 'text-retro-muted',
  running: 'text-retro-cyan',
  completed: 'text-retro-green',
  failed: 'text-retro-red',
  skipped: 'text-retro-muted',
}
</script>

<template>
  <div
    v-if="autoModeStore.enabled && autoModeStore.totalCount > 0"
    class="border-t border-retro-border"
  >
    <!-- Summary bar -->
    <div class="flex items-center justify-between px-3 py-2 bg-retro-dark/50">
      <span class="text-[10px] font-mono uppercase tracking-wider text-retro-yellow">
        Auto Mode
      </span>
      <span class="text-[10px] font-mono text-retro-muted">
        {{ autoModeStore.completedCount }}/{{ autoModeStore.totalCount }}
        <template v-if="autoModeStore.failedCount > 0">
          ({{ autoModeStore.failedCount }} failed)
        </template>
      </span>
    </div>

    <!-- Progress bar -->
    <div class="h-0.5 bg-retro-dark">
      <div
        class="h-full transition-all duration-500"
        :class="autoModeStore.failedCount > 0 ? 'bg-retro-red' : 'bg-retro-green'"
        :style="{ width: `${autoModeStore.totalCount > 0 ? ((autoModeStore.completedCount / autoModeStore.totalCount) * 100) : 0}%` }"
      />
    </div>

    <!-- Task list -->
    <div class="max-h-48 overflow-y-auto">
      <div
        v-for="task in autoModeStore.tasks"
        :key="task.featureId"
        class="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border-b border-retro-border/50 last:border-b-0"
      >
        <component
          :is="stateIcons[task.state]"
          class="h-3.5 w-3.5 flex-shrink-0"
          :class="[
            stateColors[task.state],
            { 'animate-spin': task.state === 'running' },
          ]"
        />
        <span class="truncate flex-1" :class="stateColors[task.state]">
          {{ task.featureId }}
        </span>
        <span
          v-if="task.currentStep"
          class="text-[9px] text-retro-cyan"
        >
          {{ task.currentStep }}
        </span>
        <span
          v-if="task.error && task.state === 'failed'"
          class="text-[9px] text-retro-red truncate max-w-[150px]"
          :title="task.error"
        >
          {{ task.error }}
        </span>
      </div>
      <!-- Expanded error detail for failed tasks -->
      <div
        v-for="task in autoModeStore.tasks.filter(t => t.state === 'failed' && t.error)"
        :key="`error-${task.featureId}`"
        class="px-3 py-2 bg-retro-red/10 border-b border-retro-border/50"
      >
        <div class="text-[10px] font-mono text-retro-red font-bold mb-1">
          {{ task.featureId }} failed:
        </div>
        <pre class="text-[9px] font-mono text-retro-red/80 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{{ task.error }}</pre>
      </div>
    </div>
  </div>
</template>
