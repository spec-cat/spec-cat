<script setup lang="ts">
import { currentSegmentMarkup, highlightSql, sqlSegmentAtCursor } from '~/utils/sql-segments'

type Connection = {
  id: string; name: string; host: string; port: number; database: string; user: string
  ssl: boolean; hasPassword: boolean; createdAt: string; updatedAt: string
}
type Column = { name: string; dataType: string; nullable: boolean }
type DbObject = { name: string; type: string; columns: Column[] }
type DbSchema = { name: string; objects: DbObject[] }
type QueryResult = {
  command: string; rowCount: number; fields: { name: string; dataTypeId: number }[]
  rows: Record<string, unknown>[]; truncated: boolean
}

const emit = defineEmits<{ close: [] }>()
const connections = ref<Connection[]>([])
const activeConnectionId = ref('')
const schemas = ref<DbSchema[]>([])
const expandedSchemas = ref(new Set<string>())
const expandedObjects = ref(new Set<string>())
const sql = ref('select now() as server_time, current_database() as database;')
const queryEditor = ref<HTMLTextAreaElement | null>(null)
const syntaxLayer = ref<HTMLElement | null>(null)
const segmentLayer = ref<HTMLElement | null>(null)
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
    error.value = fetchError(cause)
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
    queryEditor.value?.setSelectionRange(0, 0)
    syncEditorScroll()
  } catch (cause) {
    if (requestId === draftRequestId) error.value = fetchError(cause)
  } finally {
    if (requestId === draftRequestId) loadingDraft.value = false
  }
}

async function saveDraft(id: string, value: string) {
  if (!id) return
  try {
    await $fetch(`/api/database/connections/${encodeURIComponent(id)}/draft`, { method: 'PUT', body: { sql: value } })
  } catch (cause) {
    if (activeConnectionId.value === id) error.value = `Failed to save query draft: ${fetchError(cause)}`
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
    error.value = fetchError(cause)
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
  } catch (cause) { error.value = fetchError(cause) }
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
    error.value = fetchError(cause)
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
  } catch (cause) { error.value = fetchError(cause) } finally { loadingSchema.value = false }
}

async function executeQuery() {
  if (!activeConnectionId.value || !sql.value.trim() || running.value) return
  const segment = sqlSegmentAtCursor(sql.value, queryEditor.value?.selectionStart ?? 0)
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
    error.value = fetchError(cause)
    message.value = 'Query failed.'
  } finally { running.value = false }
}

function handleEditorKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void executeQuery() }
}

function updateEditorCursor() {
  editorCursor.value = queryEditor.value?.selectionStart ?? 0
}

function syncEditorScroll() {
  if (!queryEditor.value) return
  for (const layer of [syntaxLayer.value, segmentLayer.value]) {
    if (!layer) continue
    layer.scrollTop = queryEditor.value.scrollTop
    layer.scrollLeft = queryEditor.value.scrollLeft
  }
}

function toggleSchema(name: string) {
  const next = new Set(expandedSchemas.value); next.has(name) ? next.delete(name) : next.add(name); expandedSchemas.value = next
}
function toggleObject(key: string) {
  const next = new Set(expandedObjects.value); next.has(key) ? next.delete(key) : next.add(key); expandedObjects.value = next
}
function insertObject(schema: string, object: string) { sql.value += `\nselect * from "${schema.replaceAll('"', '""')}"."${object.replaceAll('"', '""')}" limit 100;` }
function displayValue(value: unknown) {
  if (value === null) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
function fetchError(cause: unknown) {
  const value = cause as { data?: { statusMessage?: string; message?: string }; message?: string }
  return value?.data?.statusMessage || value?.data?.message || value?.message || 'Request failed'
}
</script>

<template>
  <section class="absolute inset-0 z-50 grid min-h-0 grid-cols-[300px_minmax(0,1fr)] bg-[var(--rg-editor)] max-md:grid-cols-1">
    <aside class="grid min-h-0 grid-rows-[35px_44px_minmax(0,1fr)] border-r border-black/40 bg-[var(--rg-sidebar)] max-md:hidden">
      <div class="flex items-center justify-between border-b border-black/30 px-4 text-[11px] font-bold uppercase tracking-wide">
        <span>Connections</span><button title="Close Database" class="text-lg text-[var(--rg-muted)] hover:text-[var(--rg-foreground)]" @click="emit('close')">×</button>
      </div>
      <div class="flex items-center gap-2 border-b border-black/30 bg-[var(--rg-sidebar-header)] px-3">
        <button class="h-7 flex-1 bg-[var(--rg-button)] px-2 text-xs font-bold text-white" @click="openCreate">+ New Connection</button>
        <button class="h-7 border border-[var(--rg-border)] px-2 text-xs" title="Refresh connections" @click="refreshConnections">↻</button>
      </div>
      <div class="min-h-0 overflow-auto py-2 text-xs">
        <p v-if="loadingConnections" class="px-4 py-2 text-[var(--rg-muted)]">Loading connections...</p>
        <p v-else-if="!connections.length" class="px-4 py-2 text-[var(--rg-muted)]">No PostgreSQL connections.</p>
        <div v-for="connection in connections" :key="connection.id">
          <div class="group flex items-center gap-2 px-3 py-2 hover:bg-[var(--rg-editor-group)]" :class="activeConnectionId === connection.id ? 'bg-[var(--rg-editor-group)]' : ''">
            <button class="min-w-0 flex-1 text-left" @dblclick="connect(connection)" @click="activeConnectionId = connection.id">
              <span class="block truncate font-semibold"><span :class="activeConnectionId === connection.id && schemas.length ? 'text-[#62c554]' : 'text-[var(--rg-muted)]'">●</span> {{ connection.name }}</span>
              <span class="block truncate font-mono text-[10px] text-[var(--rg-muted)]">{{ connection.user }}@{{ connection.host }}:{{ connection.port }}/{{ connection.database }}</span>
            </button>
            <button class="opacity-0 group-hover:opacity-100" title="Edit" @click="openEdit(connection)">✎</button>
            <button class="opacity-0 group-hover:opacity-100 hover:text-[#f03e5f]" title="Delete" @click="removeConnection(connection)">×</button>
          </div>
          <div v-if="activeConnectionId === connection.id" class="border-b border-black/20 pb-1">
            <div class="flex gap-1 px-7 py-1"><button class="border border-[var(--rg-border)] px-2 py-0.5 text-[10px] hover:border-[var(--rg-accent)]" @click="connect(connection)">Connect</button><button class="border border-[var(--rg-border)] px-2 py-0.5 text-[10px] hover:border-[var(--rg-accent)]" @click="loadSchema">Refresh schema</button></div>
            <p v-if="loadingSchema" class="px-7 py-1 text-[var(--rg-muted)]">Loading objects...</p>
            <div v-for="schema in schemas" :key="schema.name">
              <button class="w-full px-7 py-1 text-left hover:bg-black/10" @click="toggleSchema(schema.name)">{{ expandedSchemas.has(schema.name) ? '▾' : '▸' }} ◫ {{ schema.name }}</button>
              <div v-if="expandedSchemas.has(schema.name)">
                <div v-for="object in schema.objects" :key="object.name">
                  <button class="w-full truncate py-1 pl-11 pr-2 text-left hover:bg-black/10" :title="'Double-click to create a SELECT query'" @click="toggleObject(`${schema.name}.${object.name}`)" @dblclick="insertObject(schema.name, object.name)">{{ expandedObjects.has(`${schema.name}.${object.name}`) ? '▾' : '▸' }} {{ object.type === 'table' ? '▦' : '◇' }} {{ object.name }}</button>
                  <div v-if="expandedObjects.has(`${schema.name}.${object.name}`)" class="pl-16 text-[10px] text-[var(--rg-muted)]">
                    <div v-for="column in object.columns" :key="column.name" class="truncate py-0.5" :title="`${column.name} ${column.dataType}`">└ {{ column.name }} <span class="opacity-70">{{ column.dataType }}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <main class="grid min-h-0 grid-rows-[36px_minmax(180px,45%)_36px_minmax(0,1fr)_24px]">
      <div class="flex items-center border-b border-black/40 bg-[var(--rg-editor-group)] px-3 text-xs">
        <span class="border-r border-black/30 px-3 py-2 text-[var(--rg-foreground)]">SQL Query</span>
        <span class="ml-3 truncate text-[10px] text-[var(--rg-muted)]">{{ activeConnection ? `${activeConnection.name} — ${activeConnection.database}` : 'No connection selected' }}</span>
        <span v-if="loadingDraft" class="ml-2 text-[10px] text-[var(--rg-muted)]">Loading draft…</span>
        <button class="ml-auto md:hidden" @click="emit('close')">×</button>
      </div>
      <div class="sql-editor relative min-h-0 overflow-hidden bg-[var(--rg-terminal)]">
        <pre ref="segmentLayer" class="sql-layer sql-segment-layer" aria-hidden="true" v-html="highlightedSegment" />
        <pre ref="syntaxLayer" class="sql-layer sql-syntax-layer" aria-hidden="true" v-html="highlightedSql" />
        <textarea ref="queryEditor" v-model="sql" spellcheck="false" class="sql-input absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent p-4 font-mono text-[13px] leading-6 outline-none" aria-label="SQL query editor" @keydown="handleEditorKeydown" @keyup="updateEditorCursor" @click="updateEditorCursor" @select="updateEditorCursor" @input="updateEditorCursor" @scroll="syncEditorScroll" />
      </div>
      <div class="flex items-center gap-2 border-y border-[var(--rg-border)] bg-[var(--rg-editor-group)] px-3 text-[11px]">
        <button class="h-6 bg-[#16825d] px-3 font-bold text-white disabled:opacity-40" :disabled="!activeConnectionId || running || !sql.trim()" @click="executeQuery">{{ running ? 'Running…' : '▶ Run Current' }}</button>
        <span class="text-[var(--rg-muted)]">Current statement · Ctrl/⌘ + Enter</span><span v-if="durationMs !== null" class="ml-auto text-[var(--rg-muted)]">{{ durationMs }} ms</span>
      </div>
      <section class="grid min-h-0 grid-rows-[34px_minmax(0,1fr)] bg-[var(--rg-panel)]">
        <div class="flex items-end gap-1 border-b border-[var(--rg-border)] px-2 text-[11px]">
          <button v-for="(result, index) in results" :key="index" class="h-8 border-b-2 px-3" :class="activeResult === index ? 'border-[var(--rg-accent)] text-[var(--rg-foreground)]' : 'border-transparent text-[var(--rg-muted)]'" @click="activeResult = index">Results {{ results.length > 1 ? index + 1 : '' }} ({{ result.rowCount }})</button>
          <span v-if="!results.length" class="px-3 py-2 text-[var(--rg-muted)]">Results</span>
        </div>
        <div class="min-h-0 overflow-auto">
          <table v-if="currentResult?.fields.length" class="min-w-full border-collapse font-mono text-[11px]">
            <thead class="sticky top-0 z-10 bg-[var(--rg-sidebar-header)]"><tr><th class="border border-[var(--rg-border)] px-2 py-1 text-right text-[var(--rg-muted)]">#</th><th v-for="field in currentResult.fields" :key="field.name" class="border border-[var(--rg-border)] px-3 py-1 text-left font-semibold">{{ field.name }}</th></tr></thead>
            <tbody><tr v-for="(row, rowIndex) in currentResult.rows" :key="rowIndex" class="hover:bg-black/10"><td class="border border-[var(--rg-border)] px-2 py-1 text-right text-[var(--rg-muted)]">{{ rowIndex + 1 }}</td><td v-for="field in currentResult.fields" :key="field.name" class="max-w-[420px] truncate border border-[var(--rg-border)] px-3 py-1" :class="row[field.name] === null ? 'italic text-[var(--rg-muted)]' : ''" :title="displayValue(row[field.name])">{{ displayValue(row[field.name]) }}</td></tr></tbody>
          </table>
          <p v-else-if="currentResult" class="p-4 text-xs text-[var(--rg-muted)]">{{ currentResult.command }} completed. {{ currentResult.rowCount }} row(s) affected.</p>
          <p v-else class="p-4 text-xs text-[var(--rg-muted)]">Run a query to view results.</p>
          <p v-if="currentResult?.truncated" class="sticky bottom-0 bg-[#8a6400] px-3 py-1 text-xs text-white">Showing the first 1,000 rows.</p>
        </div>
      </section>
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

<style scoped>
.sql-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  margin: 0;
  padding: 1rem;
  white-space: pre;
  tab-size: 2;
  pointer-events: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  line-height: 1.5rem;
}

.sql-segment-layer {
  color: transparent;
}

.sql-segment-layer :deep(mark) {
  border-radius: 2px;
  background: color-mix(in srgb, var(--rg-accent) 13%, transparent);
  color: transparent;
  box-shadow: inset 2px 0 color-mix(in srgb, var(--rg-accent) 65%, transparent);
}

.sql-syntax-layer {
  color: var(--rg-foreground);
}

.sql-syntax-layer :deep(.sql-keyword) { color: #57a9f8; font-weight: 600; }
.sql-syntax-layer :deep(.sql-string) { color: #d7e67e; }
.sql-syntax-layer :deep(.sql-identifier) { color: #f7b83d; }
.sql-syntax-layer :deep(.sql-number) { color: #c792ea; }
.sql-syntax-layer :deep(.sql-comment) { color: #7f8c8d; font-style: italic; }

.sql-input {
  z-index: 2;
  tab-size: 2;
  color: transparent;
  caret-color: var(--rg-foreground);
  -webkit-text-fill-color: transparent;
}

.sql-input::selection {
  background: color-mix(in srgb, var(--rg-selection) 65%, transparent);
}
</style>
