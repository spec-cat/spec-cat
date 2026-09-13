<script setup lang="ts">
import type { DatabaseQueryResult } from '~/types/database'

defineProps<{
  results: DatabaseQueryResult[]
  activeResult: number
  currentResult: DatabaseQueryResult | null
}>()

const emit = defineEmits<{ 'update:activeResult': [value: number] }>()

function displayValue(value: unknown) {
  if (value === null) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
</script>

<template>
  <section class="grid min-h-0 grid-rows-[34px_minmax(0,1fr)] bg-[var(--rg-panel)]">
    <div class="flex items-end gap-1 border-b border-[var(--rg-border)] px-2 text-[11px]">
      <button
        v-for="(result, index) in results"
        :key="index"
        class="h-8 border-b-2 px-3"
        :class="activeResult === index ? 'border-[var(--rg-accent)] text-[var(--rg-foreground)]' : 'border-transparent text-[var(--rg-muted)]'"
        @click="emit('update:activeResult', index)"
      >
        Results {{ results.length > 1 ? index + 1 : '' }} ({{ result.rowCount }})
      </button>
      <span v-if="!results.length" class="px-3 py-2 text-[var(--rg-muted)]">Results</span>
    </div>
    <div class="min-h-0 overflow-auto">
      <table v-if="currentResult?.fields.length" class="min-w-full border-collapse font-mono text-[11px]">
        <thead class="sticky top-0 z-10 bg-[var(--rg-sidebar-header)]">
          <tr>
            <th class="border border-[var(--rg-border)] px-2 py-1 text-right text-[var(--rg-muted)]">#</th>
            <th v-for="field in currentResult.fields" :key="field.name" class="border border-[var(--rg-border)] px-3 py-1 text-left font-semibold">{{ field.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in currentResult.rows" :key="rowIndex" class="hover:bg-black/10">
            <td class="border border-[var(--rg-border)] px-2 py-1 text-right text-[var(--rg-muted)]">{{ rowIndex + 1 }}</td>
            <td
              v-for="field in currentResult.fields"
              :key="field.name"
              class="max-w-[420px] truncate border border-[var(--rg-border)] px-3 py-1"
              :class="row[field.name] === null ? 'italic text-[var(--rg-muted)]' : ''"
              :title="displayValue(row[field.name])"
            >
              {{ displayValue(row[field.name]) }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="currentResult" class="p-4 text-xs text-[var(--rg-muted)]">{{ currentResult.command }} completed. {{ currentResult.rowCount }} row(s) affected.</p>
      <p v-else class="p-4 text-xs text-[var(--rg-muted)]">Run a query to view results.</p>
      <p v-if="currentResult?.truncated" class="sticky bottom-0 bg-[#8a6400] px-3 py-1 text-xs text-white">Showing the first 1,000 rows.</p>
    </div>
  </section>
</template>
