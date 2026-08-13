<script setup lang="ts">
defineProps<{
  sidebarCollapsed: boolean
  specPanelCollapsed: boolean
  activeSidebarPanel: 'conversations' | 'terminal'
  databaseOpen: boolean
}>()

defineEmits<{
  selectSidebarPanel: [panel: 'conversations' | 'terminal']
  openSpecPanel: []
  toggleDatabase: []
  refresh: []
  openSettings: []
}>()
</script>

<template>
  <nav class="relative z-[60] flex min-h-0 min-w-0 overflow-hidden flex-col items-center border-r border-black/40 bg-[var(--rg-activity)] py-2">
    <button
      class="grid h-12 w-full place-items-center border-l-2"
      :class="!sidebarCollapsed && activeSidebarPanel === 'conversations' ? 'border-[var(--rg-foreground)] text-[var(--rg-foreground)]' : 'border-transparent text-[#88857c] hover:text-[#ede0ce]'"
      title="Conversations"
      @click="$emit('selectSidebarPanel', 'conversations')"
    >
      <span class="text-xl">▦</span>
    </button>
    <button
      class="grid h-12 w-full place-items-center border-l-2"
      :class="!specPanelCollapsed ? 'border-[var(--rg-foreground)] text-[var(--rg-foreground)]' : 'border-transparent text-[#88857c] hover:text-[#ede0ce]'"
      title="Spec Browser"
      @click="$emit('openSpecPanel')"
    >
      <span class="text-xl">S</span>
    </button>
    <button
      class="grid h-12 w-full place-items-center border-l-2"
      :class="!sidebarCollapsed && activeSidebarPanel === 'terminal' ? 'border-[var(--rg-foreground)] text-[var(--rg-foreground)]' : 'border-transparent text-[#88857c] hover:text-[#ede0ce]'"
      title="Terminal"
      @click="$emit('selectSidebarPanel', 'terminal')"
    >
      <span class="font-mono text-lg leading-none">&gt;_</span>
    </button>
    <button
      class="grid h-12 w-full place-items-center border-l-2"
      :class="databaseOpen ? 'border-[var(--rg-foreground)] text-[var(--rg-foreground)]' : 'border-transparent text-[#88857c] hover:text-[#ede0ce]'"
      title="PostgreSQL Database"
      @click="$emit('toggleDatabase')"
    >
      <span class="text-xl leading-none">◉</span>
    </button>
    <div class="flex-1" />
    <button
      class="grid h-12 w-full place-items-center border-l-2 border-transparent text-[#88857c] hover:text-[#ede0ce]"
      title="Refresh"
      @click="$emit('refresh')"
    >
      <span class="text-lg">↻</span>
    </button>
    <button
      class="grid h-12 w-full place-items-center border-l-2 border-transparent text-[#88857c] hover:text-[#ede0ce]"
      title="Settings"
      @click="$emit('openSettings')"
    >
      <span class="text-xl">⚙</span>
    </button>
  </nav>
</template>
