<script setup lang="ts">
import type { DatabaseConnectionSummary, DatabaseSchema } from '~/types/database'

defineProps<{
  connections: DatabaseConnectionSummary[]
  activeConnectionId: string
  schemas: DatabaseSchema[]
  expandedSchemas: Set<string>
  expandedObjects: Set<string>
  loadingConnections: boolean
  loadingSchema: boolean
}>()

const emit = defineEmits<{
  close: []
  create: []
  refresh: []
  select: [id: string]
  edit: [connection: DatabaseConnectionSummary]
  delete: [connection: DatabaseConnectionSummary]
  connect: [connection: DatabaseConnectionSummary]
  refreshSchema: []
  toggleSchema: [name: string]
  toggleObject: [key: string]
  insertObject: [schema: string, object: string]
}>()
</script>

<template>
  <aside class="grid min-h-0 grid-rows-[35px_44px_minmax(0,1fr)] border-r border-black/40 bg-[var(--rg-sidebar)] max-md:hidden">
    <div class="flex items-center justify-between border-b border-black/30 px-4 text-[11px] font-bold uppercase tracking-wide">
      <span>Connections</span><button title="Close Database" class="text-lg text-[var(--rg-muted)] hover:text-[var(--rg-foreground)]" @click="emit('close')">×</button>
    </div>
    <div class="flex items-center gap-2 border-b border-black/30 bg-[var(--rg-sidebar-header)] px-3">
      <button class="h-7 flex-1 bg-[var(--rg-button)] px-2 text-xs font-bold text-white" @click="emit('create')">+ New Connection</button>
      <button class="h-7 border border-[var(--rg-border)] px-2 text-xs" title="Refresh connections" @click="emit('refresh')">↻</button>
    </div>
    <div class="min-h-0 overflow-auto py-2 text-xs">
      <p v-if="loadingConnections" class="px-4 py-2 text-[var(--rg-muted)]">Loading connections...</p>
      <p v-else-if="!connections.length" class="px-4 py-2 text-[var(--rg-muted)]">No PostgreSQL connections.</p>
      <div v-for="connection in connections" :key="connection.id">
        <div class="group flex items-center gap-2 px-3 py-2 hover:bg-[var(--rg-editor-group)]" :class="activeConnectionId === connection.id ? 'bg-[var(--rg-editor-group)]' : ''">
          <button class="min-w-0 flex-1 text-left" @dblclick="emit('connect', connection)" @click="emit('select', connection.id)">
            <span class="block truncate font-semibold"><span :class="activeConnectionId === connection.id && schemas.length ? 'text-[#62c554]' : 'text-[var(--rg-muted)]'">●</span> {{ connection.name }}</span>
            <span class="block truncate font-mono text-[10px] text-[var(--rg-muted)]">{{ connection.user }}@{{ connection.host }}:{{ connection.port }}/{{ connection.database }}</span>
          </button>
          <button class="opacity-0 group-hover:opacity-100" title="Edit" @click="emit('edit', connection)">✎</button>
          <button class="opacity-0 group-hover:opacity-100 hover:text-[#f03e5f]" title="Delete" @click="emit('delete', connection)">×</button>
        </div>
        <DatabaseSchemaBrowser
          v-if="activeConnectionId === connection.id"
          :connection="connection"
          :schemas="schemas"
          :expanded-schemas="expandedSchemas"
          :expanded-objects="expandedObjects"
          :loading="loadingSchema"
          @connect="emit('connect', $event)"
          @refresh="emit('refreshSchema')"
          @toggle-schema="emit('toggleSchema', $event)"
          @toggle-object="emit('toggleObject', $event)"
          @insert-object="(schema, object) => emit('insertObject', schema, object)"
        />
      </div>
    </div>
  </aside>
</template>
