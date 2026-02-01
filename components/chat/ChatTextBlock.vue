<script setup lang="ts">
import type { TextBlock } from '~/types/chat'
import { useMarkdown } from '~/composables/useMarkdown'

const props = defineProps<{ block: TextBlock }>()
const { renderMarkdown } = useMarkdown()

const html = computed(() => renderMarkdown(props.block.text))
</script>

<template>
  <div
    v-if="block.text.trim()"
    class="text-sm font-mono text-retro-text break-words chat-markdown"
    v-html="html"
  />
</template>
