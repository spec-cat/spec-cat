<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { SunIcon, MoonIcon } from '@heroicons/vue/24/outline'
import ConversationItem from '~/components/chat/ConversationItem.vue'
import type { Conversation, ChatMessage } from '~/types/chat'
import { useTheme } from '~/composables/useTheme'
import { useSettingsStore } from '~/stores/settings'

definePageMeta({ layout: false })

const { isDark, toggleTheme } = useTheme()
const settingsStore = useSettingsStore()

onMounted(async () => {
  await settingsStore.hydrate()
})

const mockMessages: ChatMessage[] = [
  { id: 'm1', role: 'user', content: 'Design System Validation Message', timestamp: new Date().toISOString() }
]

const combinations = computed(() => {
  const results = []
  for (const active of [true, false]) {
    results.push({
      id: `finalized-${active}`,
      label: `Finalized | ${active ? 'Active' : 'Inactive'}`,
      state: { isActive: active, isFinalized: true, isPreviewing: false, isStreaming: false },
      conversation: {
        id: `c-f-${active}`,
        title: `Finalized Case (${active ? 'Active' : 'Idle'})`,
        messages: mockMessages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cwd: '/repo',
        finalized: true
      } as Conversation
    })
  }
  for (const active of [true, false]) {
    for (const preview of [true, false]) {
      for (const stream of [true, false]) {
        results.push({
          id: `normal-${active}-${preview}-${stream}`,
          label: `${active ? 'Active' : 'Idle'} | ${preview ? 'Preview' : 'Normal'} | ${stream ? 'Streaming' : 'Static'}`,
          state: { isActive: active, isFinalized: false, isPreviewing: preview, isStreaming: stream },
          conversation: {
            id: `c-n-${active}-${preview}-${stream}`,
            title: `${preview ? 'Preview' : 'Normal'} (${active ? 'Active' : 'Idle'})`,
            messages: mockMessages,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            cwd: '/repo',
            finalized: false,
            worktreeBranch: preview ? 'feature/ui-fix' : undefined,
            hasWorktree: preview
          } as Conversation
        })
      }
    }
  }
  return results
})
</script>

<template>
  <div class="min-h-screen bg-retro-black text-retro-text font-mono">
    <header class="h-14 border-b border-retro-border bg-retro-panel/50 px-8 flex items-center justify-between">
      <h1 class="text-lg font-bold text-retro-cyan uppercase tracking-widest">Design Guide</h1>
      <button @click="toggleTheme" class="p-2 rounded border border-retro-border hover:border-retro-cyan transition-colors bg-retro-black">
        <SunIcon v-if="isDark" class="w-5 h-5 text-retro-yellow" />
        <MoonIcon v-else class="w-5 h-5 text-retro-cyan" />
      </button>
    </header>

    <div class="grid grid-cols-2 gap-8 p-12">
      <div v-for="item in combinations" :key="item.id" class="space-y-2 p-4 border border-retro-border rounded-lg">
        <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">
          {{ item.label }}
        </span>
        <ConversationItem
          :conversation="item.conversation"
          :is-active="item.state.isActive"
          :is-streaming="item.state.isStreaming"
          :is-previewing="item.state.isPreviewing"
        />
      </div>
    </div>
  </div>
</template>
