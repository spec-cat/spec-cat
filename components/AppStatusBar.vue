<script setup lang="ts">
import type { SessionListItem } from '~/server/utils/session-store'

defineProps<{
  themes: { name: string }[]
  mobile: boolean
  sessionId: string
  activeSession: SessionListItem | undefined
  sessionCount: number
  statusText: string
}>()

const selectedThemeName = defineModel<string>('selectedThemeName', { required: true })
</script>

<template>
  <footer
    class="grid min-w-0 items-center bg-[var(--rg-status)] px-2 font-mono text-[11px] text-white"
    :style="{ gridTemplateColumns: mobile ? 'minmax(0,1fr) auto' : '304px minmax(0,1fr) 260px' }"
  >
    <div class="flex min-w-0 items-center gap-2">
      <span class="truncate">Rainglow</span>
      <select
        v-model="selectedThemeName"
        class="h-[18px] max-w-[190px] border border-white/30 bg-black/20 px-1 text-[11px] text-white outline-none"
      >
        <option
          v-for="theme in themes"
          :key="theme.name"
          :value="theme.name"
          class="bg-[#262522] text-white"
        >
          {{ theme.name }}
        </option>
      </select>
    </div>
    <div v-show="!mobile" class="truncate text-center">{{ sessionId || 'no session selected' }}</div>
    <div class="flex min-w-0 justify-end gap-2 text-right">
      <span class="min-w-0 truncate" :title="activeSession?.tmuxName || ''">current: {{ activeSession?.tmuxName || '-' }}</span>
      <span class="shrink-0">{{ sessionCount }} conversations · {{ statusText }}</span>
    </div>
  </footer>
</template>
