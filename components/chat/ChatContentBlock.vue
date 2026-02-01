<script setup lang="ts">
import type { ContentBlock, ToolResultBlock } from '~/types/chat'

const props = defineProps<{
  block: ContentBlock
  /** All blocks in the message, for pairing tool_use with tool_result */
  allBlocks: ContentBlock[]
}>()

/**
 * Find the matching ToolResultBlock for a ToolUseBlock
 */
const pairedResult = computed((): ToolResultBlock | undefined => {
  if (props.block.type !== 'tool_use') return undefined
  const toolUseId = props.block.toolUseId
  return props.allBlocks.find(
    (b): b is ToolResultBlock => b.type === 'tool_result' && b.toolUseId === toolUseId
  )
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
