<script setup lang="ts">
import type { DatabaseConnectionSummary, DatabaseSchema } from '~/types/database'

defineProps<{
  connection: DatabaseConnectionSummary
  schemas: DatabaseSchema[]
  expandedSchemas: Set<string>
  expandedObjects: Set<string>
  loading: boolean
}>()

const emit = defineEmits<{
  connect: [connection: DatabaseConnectionSummary]
  refresh: []
  toggleSchema: [name: string]
  toggleObject: [key: string]
  insertObject: [schema: string, object: string]
}>()
</script>

<template>
  <div class="border-b border-black/20 pb-1">
    <div class="flex gap-1 px-7 py-1"><button class="border border-[var(--rg-border)] px-2 py-0.5 text-[10px] hover:border-[var(--rg-accent)]" @click="emit('connect', connection)">Connect</button><button class="border border-[var(--rg-border)] px-2 py-0.5 text-[10px] hover:border-[var(--rg-accent)]" @click="emit('refresh')">Refresh schema</button></div>
    <p v-if="loading" class="px-7 py-1 text-[var(--rg-muted)]">Loading objects...</p>
    <div v-for="schema in schemas" :key="schema.name">
      <button class="w-full px-7 py-1 text-left hover:bg-black/10" @click="emit('toggleSchema', schema.name)">{{ expandedSchemas.has(schema.name) ? '▾' : '▸' }} ◫ {{ schema.name }}</button>
      <div v-if="expandedSchemas.has(schema.name)">
        <div v-for="object in schema.objects" :key="object.name">
          <button class="w-full truncate py-1 pl-11 pr-2 text-left hover:bg-black/10" title="Double-click to create a SELECT query" @click="emit('toggleObject', `${schema.name}.${object.name}`)" @dblclick="emit('insertObject', schema.name, object.name)">{{ expandedObjects.has(`${schema.name}.${object.name}`) ? '▾' : '▸' }} {{ object.type === 'table' ? '▦' : '◇' }} {{ object.name }}</button>
          <div v-if="expandedObjects.has(`${schema.name}.${object.name}`)" class="pl-16 text-[10px] text-[var(--rg-muted)]">
            <div v-for="column in object.columns" :key="column.name" class="truncate py-0.5" :title="`${column.name} ${column.dataType}`">└ {{ column.name }} <span class="opacity-70">{{ column.dataType }}</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
