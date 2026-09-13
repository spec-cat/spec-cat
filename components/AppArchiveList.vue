<script setup lang="ts">
import type { SessionListItem } from '~/types/session'

defineProps<{
  expanded: boolean
  sessions: SessionListItem[]
  filteredSessions: SessionListItem[]
  loading: boolean
  selectedId: string
  restoringId: string
  deletingId: string
  sessionDisplayName: (session: SessionListItem) => string
}>()

const emit = defineEmits<{
  toggle: []
  deleteAll: []
  select: [session: SessionListItem]
  restore: [session: SessionListItem]
  delete: [session: SessionListItem]
}>()
</script>

<template>
  <div class="mt-3 border-t border-black/20 pt-1">
    <div class="flex h-6 items-center justify-between px-3 text-[11px] font-bold uppercase text-[#a0988e]">
      <button type="button" class="flex items-center gap-1 hover:text-[var(--rg-foreground)]" @click="emit('toggle')">
        <span>{{ expanded ? '▾' : '▸' }}</span>
        <span>Archived ({{ sessions.length }})</span>
      </button>
      <button
        v-if="expanded && sessions.length"
        type="button"
        class="text-[10px] normal-case text-[#88857c] hover:text-[#f03e5f]"
        title="Permanently delete all archived conversations"
        @click="emit('deleteAll')"
      >
        Delete All
      </button>
    </div>
    <template v-if="expanded">
      <AppArchivedSessionRow
        v-for="session in filteredSessions"
        :key="session.id"
        :session="session"
        :selected="selectedId === session.id"
        :restoring="restoringId === session.id"
        :deleting="deletingId === session.id"
        :display-name="sessionDisplayName(session)"
        @select="emit('select', $event)"
        @restore="emit('restore', $event)"
        @delete="emit('delete', $event)"
      />
      <p v-if="!sessions.length" class="px-4 py-2 text-[12px] text-[#88857c]">
        {{ loading ? 'Loading archives...' : 'No archived conversations.' }}
      </p>
    </template>
  </div>
</template>
