<script setup lang="ts">
import type { ToolUseBlock } from '~/types/chat'
import {
  ChevronRightIcon,
  ClockIcon,
} from '@heroicons/vue/24/outline'

const props = defineProps<{
  tools: ToolUseBlock[]
}>()

const expanded = ref(false)

const runningCount = computed(() => props.tools.filter(tool => tool.status === 'running').length)
const pendingCount = computed(() => props.tools.filter(tool => tool.status === 'pending').length)
const completeCount = computed(() => props.tools.filter(tool => tool.status === 'complete').length)

const latestTool = computed(() => {
  return [...props.tools].reverse().find(tool => tool.status !== 'complete') ?? props.tools[props.tools.length - 1]
})

function toolLabel(tool: ToolUseBlock): string {
  const summary = tool.inputSummary.trim()
  return summary ? `${tool.name} ${summary}` : tool.name
}

const summaryText = computed(() => {
  const latest = latestTool.value
  if (!latest) return 'Tools'

  const latestLabel = toolLabel(latest)

  if (props.tools.length === 1) {
    return latestLabel
  }

  if (runningCount.value > 0 || pendingCount.value > 0) {
    return `${props.tools.length} tools · latest ${latestLabel}`
  }

  return `${props.tools.length} tools · ${latestLabel}`
})

const statusText = computed(() => {
  if (runningCount.value > 0) return '[RUN]'
  if (pendingCount.value > 0) return '[WAIT]'
  return '[TOOLS]'
})

const hasActiveTools = computed(() => runningCount.value > 0 || pendingCount.value > 0)
</script>

<template>
  <div
    class="my-2 rounded border"
    :class="hasActiveTools ? 'border-retro-border/40 bg-retro-dark/30' : 'border-retro-border/20 bg-retro-panel/20'"
    data-testid="tool-group-summary"
  >
    <button
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-mono transition-colors hover:bg-retro-dark/30"
      @click="expanded = !expanded"
    >
      <span
        v-if="runningCount > 0"
        class="h-3 w-3 flex-shrink-0 rounded-full border-2 border-retro-yellow border-t-transparent animate-spin"
      />
      <ClockIcon
        v-else-if="pendingCount > 0"
        class="h-3.5 w-3.5 flex-shrink-0 animate-pulse text-retro-muted"
      />
      <span v-else class="h-2 w-2 flex-shrink-0 rounded-full bg-retro-muted/70" />

      <span class="text-retro-muted">{{ statusText }}</span>
      <span class="font-bold text-retro-cyan">Tools</span>
      <span class="truncate text-retro-muted">{{ summaryText }}</span>
      <span
        v-if="hasActiveTools && completeCount > 0"
        class="hidden flex-shrink-0 text-retro-muted/70 sm:inline"
      >
        · {{ completeCount }} done
      </span>
      <ChevronRightIcon
        class="ml-auto h-3 w-3 flex-shrink-0 text-retro-muted transition-transform"
        :class="{ 'rotate-90': expanded }"
      />
    </button>

    <div v-if="expanded" class="space-y-1 border-t border-retro-border/20 px-3 pb-2 pt-2">
      <div
        v-for="tool in tools"
        :key="tool.id"
        class="flex items-start gap-2 text-xs font-mono text-retro-muted"
      >
        <span class="min-w-14 flex-shrink-0">
          {{ tool.status === 'running' ? '[RUN]' : tool.status === 'pending' ? '[WAIT]' : '[OK]' }}
        </span>
        <span class="flex-shrink-0 text-retro-cyan">{{ tool.name }}</span>
        <span class="break-all">{{ tool.inputSummary || 'No summary available' }}</span>
      </div>
    </div>
  </div>
</template>
