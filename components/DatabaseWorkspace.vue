<script setup lang="ts">
import { currentSegmentMarkup, highlightSql, sqlSegmentAtCursor } from '~/utils/sql-segments'
import type { DatabaseConnectionSummary, DatabaseQueryEditorExpose, DatabaseQueryResult, DatabaseSchema } from '~/types/database'
import { extractFetchError } from '~/utils/fetch-error'

type Connection = DatabaseConnectionSummary
type DbSchema = DatabaseSchema
type QueryResult = DatabaseQueryResult
const requestError = (cause: unknown) => extractFetchError(cause, 'Request failed')

const emit = defineEmits<{ close: [] }>()
const connections = ref<Connection[]>([])
const activeConnectionId = ref('')
const schemas = ref<DbSchema[]>([])
const expandedSchemas = ref(new Set<string>())
const expandedObjects = ref(new Set<string>())
const sql = ref('select now() as server_time, current_database() as database;')
const queryEditor = ref<DatabaseQueryEditorExpose | null>(null)
const editorCursor = ref(0)
const results = ref<QueryResult[]>([])
const activeResult = ref(0)
const durationMs = ref<number | null>(null)
const message = ref('Ready')
const error = ref('')
const loadingConnections = ref(false)
const loadingSchema = ref(false)
const running = ref(false)
const loadingDraft = ref(false)
const showForm = ref(false)
const editingId = ref('')
const form = reactive({ name: '', host: 'localhost', port: 5432, database: 'postgres', user: 'postgres', password: '', ssl: false })
let draftSaveTimer: ReturnType<typeof setTimeout> | null = null
let draftRequestId = 0

const activeConnection = computed(() => connections.value.find((item) => item.id === activeConnectionId.value) || null)
const currentResult = computed(() => results.value[activeResult.value] || null)
const highlightedSql = computed(() => highlightSql(sql.value))
const highlightedSegment = computed(() => currentSegmentMarkup(sql.value, editorCursor.value))

onMounted(refreshConnections)
onBeforeUnmount(() => {
  if (draftSaveTimer) clearTimeout(draftSaveTimer)
  void saveDraft(activeConnectionId.value, sql.value)
})

watch(activeConnectionId, (id, previousId) => {
  if (previousId && connections.value.some((item) => item.id === previousId)) void saveDraft(previousId, sql.value)
  void loadDraft(id)
})
watch(sql, (value) => {
  const id = activeConnectionId.value
  if (!id || loadingDraft.value) return
  if (draftSaveTimer) clearTimeout(draftSaveTimer)
  draftSaveTimer = setTimeout(() => {
    draftSaveTimer = null
    void saveDraft(id, value)
  }, 500)
})

async function refreshConnections() {
  loadingConnections.value = true
  try {
    const response = await $fetch<{ connections: Connection[] }>('/api/database/connections')
    connections.value = response.connections
    if (activeConnectionId.value && !connections.value.some((item) => item.id === activeConnectionId.value)) activeConnectionId.value = ''
  } catch (cause) {
    error.value = requestError(cause)
  } finally {
    loadingConnections.value = false
  }
}

async function loadDraft(id: string) {
  const requestId = ++draftRequestId
  if (draftSaveTimer) { clearTimeout(draftSaveTimer); draftSaveTimer = null }
  if (!id) return
  loadingDraft.value = true
  try {
    const response = await $fetch<{ sql: string }>(`/api/database/connections/${encodeURIComponent(id)}/draft`)
    if (requestId !== draftRequestId || activeConnectionId.value !== id) return
    sql.value = response.sql || 'select now() as server_time, current_database() as database;'
    editorCursor.value = 0
    await nextTick()
    queryEditor.value?.resetCursor()
  } catch (cause) {
    if (requestId === draftRequestId) error.value = requestError(cause)
  } finally {
    if (requestId === draftRequestId) loadingDraft.value = false
  }
}

async function saveDraft(id: string, value: string) {
  if (!id) return
  try {
    await $fetch(`/api/database/connections/${encodeURIComponent(id)}/draft`, { method: 'PUT', body: { sql: value } })
  } catch (cause) {
    if (activeConnectionId.value === id) error.value = `Failed to save query draft: ${requestError(cause)}`
  }
}

function openCreate() {
  editingId.value = ''
  Object.assign(form, { name: '', host: 'localhost', port: 5432, database: 'postgres', user: 'postgres', password: '', ssl: false })
  showForm.value = true
}

function openEdit(connection: Connection) {
  editingId.value = connection.id
  Object.assign(form, { ...connection, password: '' })
  showForm.value = true
}

async function saveConnection() {
  error.value = ''
  try {
    const url = editingId.value ? `/api/database/connections/${encodeURIComponent(editingId.value)}` : '/api/database/connections'
    await $fetch(url, { method: editingId.value ? 'PATCH' : 'POST', body: form })
    showForm.value = false
    await refreshConnections()
    message.value = editingId.value ? 'Connection updated.' : 'Connection saved.'
  } catch (cause) {
    error.value = requestError(cause)
  }
}

async function removeConnection(connection: Connection) {
  if (!window.confirm(`Delete connection “${connection.name}”?`)) return
  try {
    await $fetch(`/api/database/connections/${encodeURIComponent(connection.id)}`, { method: 'DELETE' })
    connections.value = connections.value.filter((item) => item.id !== connection.id)
    if (activeConnectionId.value === connection.id) { activeConnectionId.value = ''; schemas.value = []; results.value = [] }
    await refreshConnections()
    message.value = 'Connection deleted.'
  } catch (cause) { error.value = requestError(cause) }
}

async function connect(connection: Connection) {
  activeConnectionId.value = connection.id
  schemas.value = []
  results.value = []
  error.value = ''
  message.value = `Connecting to ${connection.name}...`
  try {
    const response = await $fetch<{ latencyMs: number }>(`/api/database/connections/${encodeURIComponent(connection.id)}/test`, { method: 'POST' })
    message.value = `Connected to ${connection.name} (${response.latencyMs} ms).`
    await loadSchema()
  } catch (cause) {
    error.value = requestError(cause)
    message.value = 'Connection failed.'
  }
}

async function loadSchema() {
  if (!activeConnectionId.value) return
  loadingSchema.value = true
  error.value = ''
  try {
    const response = await $fetch<{ schemas: DbSchema[] }>(`/api/database/connections/${encodeURIComponent(activeConnectionId.value)}/schema`)
    schemas.value = response.schemas
    expandedSchemas.value = new Set(response.schemas.map((item) => item.name))
    message.value = `Loaded ${response.schemas.length} schemas.`
  } catch (cause) { error.value = requestError(cause) } finally { loadingSchema.value = false }
}

async function executeQuery() {
  if (!activeConnectionId.value || !sql.value.trim() || running.value) return
  const segment = sqlSegmentAtCursor(sql.value, queryEditor.value?.selectionStart() ?? 0)
  if (!segment) {
    error.value = 'Place the cursor inside a SQL statement.'
    return
  }
  running.value = true
  error.value = ''
  message.value = 'Executing query...'
  try {
    const response = await $fetch<{ results: QueryResult[]; durationMs: number }>(`/api/database/connections/${encodeURIComponent(activeConnectionId.value)}/query`, { method: 'POST', body: { sql: segment.sql } })
    results.value = response.results
    activeResult.value = 0
    durationMs.value = response.durationMs
    const affected = response.results.reduce((sum, item) => sum + item.rowCount, 0)
    message.value = `Current statement completed in ${response.durationMs} ms. ${affected} row${affected === 1 ? '' : 's'}.`
  } catch (cause) {
    error.value = requestError(cause)
    message.value = 'Query failed.'
  } finally { running.value = false }
}

function toggleSchema(name: string) {
  const next = new Set(expandedSchemas.value); next.has(name) ? next.delete(name) : next.add(name); expandedSchemas.value = next
}
function toggleObject(key: string) {
  const next = new Set(expandedObjects.value); next.has(key) ? next.delete(key) : next.add(key); expandedObjects.value = next
}
function insertObject(schema: string, object: string) { sql.value += `\nselect * from "${schema.replaceAll('"', '""')}"."${object.replaceAll('"', '""')}" limit 100;` }
</script>

<template>
  <section class="absolute inset-0 z-50 grid min-h-0 grid-cols-[300px_minmax(0,1fr)] bg-[var(--rg-editor)] max-md:grid-cols-1">
    <DatabaseConnectionsPanel
      :connections="connections"
      :active-connection-id="activeConnectionId"
      :schemas="schemas"
      :expanded-schemas="expandedSchemas"
      :expanded-objects="expandedObjects"
      :loading-connections="loadingConnections"
      :loading-schema="loadingSchema"
      @close="emit('close')"
      @create="openCreate"
      @refresh="refreshConnections"
      @select="activeConnectionId = $event"
      @edit="openEdit"
      @delete="removeConnection"
      @connect="connect"
      @refresh-schema="loadSchema"
      @toggle-schema="toggleSchema"
      @toggle-object="toggleObject"
      @insert-object="insertObject"
    />

    <main class="grid min-h-0 grid-rows-[36px_minmax(180px,45%)_36px_minmax(0,1fr)_24px]">
      <DatabaseQueryEditor
        ref="queryEditor"
        v-model="sql"
        :highlighted-sql="highlightedSql"
        :highlighted-segment="highlightedSegment"
        :active-connection="activeConnection"
        :loading-draft="loadingDraft"
        :running="running"
        :duration-ms="durationMs"
        @cursor="editorCursor = $event"
        @run="executeQuery"
        @close="emit('close')"
      />
      <DatabaseResultsPanel v-model:active-result="activeResult" :results="results" :current-result="currentResult" />
      <div class="truncate bg-[var(--rg-status)] px-3 text-[11px] leading-6 text-white" :title="error || message"><span v-if="error" class="font-semibold">Error: {{ error }}</span><span v-else>{{ message }}</span></div>
    </main>

    <div v-if="showForm" class="absolute inset-0 z-50 grid place-items-center bg-black/55 p-4" @click.self="showForm = false">
      <form class="w-full max-w-lg border border-[var(--rg-border)] bg-[var(--rg-sidebar)] shadow-2xl" @submit.prevent="saveConnection">
        <header class="flex items-center justify-between border-b border-[var(--rg-border)] px-4 py-3 text-sm font-bold"><span>{{ editingId ? 'Edit PostgreSQL Connection' : 'New PostgreSQL Connection' }}</span><button type="button" @click="showForm = false">×</button></header>
        <div class="grid grid-cols-2 gap-3 p-4 text-xs">
          <label class="col-span-2 grid gap-1">Connection name<input v-model="form.name" required maxlength="100" class="h-8 border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 outline-none focus:border-[var(--rg-accent)]"></label>
          <label class="grid gap-1">Host<input v-model="form.host" required class="h-8 border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 outline-none focus:border-[var(--rg-accent)]"></label>
          <label class="grid gap-1">Port<input v-model.number="form.port" required type="number" min="1" max="65535" class="h-8 border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 outline-none focus:border-[var(--rg-accent)]"></label>
          <label class="grid gap-1">Database<input v-model="form.database" required class="h-8 border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 outline-none focus:border-[var(--rg-accent)]"></label>
          <label class="grid gap-1">User<input v-model="form.user" required class="h-8 border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 outline-none focus:border-[var(--rg-accent)]"></label>
          <label class="col-span-2 grid gap-1">Password <span v-if="editingId" class="text-[10px] text-[var(--rg-muted)]">Leave blank to keep the saved password.</span><input v-model="form.password" type="password" autocomplete="new-password" class="h-8 border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 outline-none focus:border-[var(--rg-accent)]"></label>
          <label class="col-span-2 flex items-center gap-2"><input v-model="form.ssl" type="checkbox"> Use SSL (certificate verification disabled for local development)</label>
        </div>
        <footer class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3"><button type="button" class="border border-[var(--rg-border)] px-3 py-1.5" @click="showForm = false">Cancel</button><button class="bg-[var(--rg-button)] px-3 py-1.5 font-bold text-white">Save Connection</button></footer>
      </form>
    </div>
  </section>
</template>
