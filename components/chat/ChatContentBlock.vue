<script setup lang="ts">
import type { ContentBlock, ToolResultBlock } from '~/types/chat'

const props = defineProps<{
  block: ContentBlock
  /** Pre-indexed tool results by toolUseId for O(1) pairing */
  toolResultsByUseId: ReadonlyMap<string, ToolResultBlock>
}>()

/**
 * Find the matching ToolResultBlock for a ToolUseBlock
 */
const pairedResult = computed((): ToolResultBlock | undefined => {
  if (props.block.type !== 'tool_use') return undefined
  return props.toolResultsByUseId.get(props.block.toolUseId)
})
</script>

<template>
  <ChatTextBlock v-if="block.type === 'text'" :block="block" />
  <ChatThinkingBlock v-else-if="block.type === 'thinking'" :block="block" />
  <ChatToolBlock v-else-if="block.type === 'tool_use'" :block="block" :result="pairedResult" />
  <!-- tool_result blocks are rendered inside ChatToolBlock, skip standalone rendering -->
  <ChatResultSummary v-else-if="block.type === 'result_summary'" :block="block" />
  <ChatSessionInit v-else-if="block.type === 'session_init'" :block="block" />
</template>
