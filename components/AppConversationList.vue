<script setup lang="ts">
import type { SessionListItem } from '~/types/session'

defineProps<{
  searchQuery: string
  limitWarning: string
  sessions: SessionListItem[]
  filteredSessions: SessionListItem[]
  loading: boolean
  activeId: string
  editingId: string
  editingTitle: string
  archivingId: string
  archivesExpanded: boolean
  archivedSessions: SessionListItem[]
  filteredArchivedSessions: SessionListItem[]
  loadingArchives: boolean
  selectedArchiveId: string
  restoringId: string
  deletingId: string
  sessionDisplayName: (session: SessionListItem) => string
}>()

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  'update:editingTitle': [value: string]
  select: [id: string]
  saveRename: []
  cancelRename: []
  startRename: [session: SessionListItem]
  archive: [session: SessionListItem]
  copy: [value: string]
  toggleArchives: []
  deleteAllArchives: []
  selectArchive: [session: SessionListItem]
  restoreArchive: [session: SessionListItem]
  deleteArchive: [session: SessionListItem]
}>()
</script>

<template>
  <div class="min-h-0 overflow-auto py-2">
    <AppConversationSearch :model-value="searchQuery" @update:model-value="emit('update:searchQuery', $event)" />
    <div class="mb-1 flex h-6 items-center px-3 text-[11px] font-bold uppercase text-[#a0988e]">
      CLI Conversations ({{ searchQuery.trim() ? `${filteredSessions.length}/${sessions.length}` : sessions.length }})
    </div>
    <p
      v-if="limitWarning"
      class="mx-3 mb-2 border border-[#f7b83d]/60 bg-[#f7b83d]/10 px-2 py-1.5 text-[11px] leading-4 text-[#f7b83d]"
    >
      {{ limitWarning }}
    </p>
    <AppConversationSessionRow
      v-for="session in filteredSessions"
      :key="session.id"
      :session="session"
      :active="session.id === activeId"
      :editing="editingId === session.id"
      :editing-title="editingTitle"
      :archiving="archivingId === session.id"
      :display-name="sessionDisplayName(session)"
      @select="emit('select', $event)"
      @update:editing-title="emit('update:editingTitle', $event)"
      @save-rename="emit('saveRename')"
      @cancel-rename="emit('cancelRename')"
      @start-rename="emit('startRename', $event)"
      @archive="emit('archive', $event)"
      @copy="emit('copy', $event)"
    />
    <p v-if="!sessions.length" class="px-4 py-3 text-[12px] text-[#88857c]">
      {{ loading ? 'Loading conversations...' : 'No saved conversations.' }}
    </p>
    <p v-else-if="!filteredSessions.length" class="px-4 py-3 text-[12px] text-[#88857c]">
      No conversations match "{{ searchQuery.trim() }}".
    </p>
    <AppArchiveList
      :expanded="archivesExpanded"
      :sessions="archivedSessions"
      :filtered-sessions="filteredArchivedSessions"
      :loading="loadingArchives"
      :selected-id="selectedArchiveId"
      :restoring-id="restoringId"
      :deleting-id="deletingId"
      :session-display-name="sessionDisplayName"
      @toggle="emit('toggleArchives')"
      @delete-all="emit('deleteAllArchives')"
      @select="emit('selectArchive', $event)"
      @restore="emit('restoreArchive', $event)"
      @delete="emit('deleteArchive', $event)"
    />
  </div>
</template>
