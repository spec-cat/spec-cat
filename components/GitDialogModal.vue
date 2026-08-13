<script setup lang="ts">
import type { GitDialogState } from '~/types/app'

defineProps<{
  dialog: GitDialogState | null
  themeVars: Record<string, string>
}>()

defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <div
    v-if="dialog"
    class="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4"
    :style="themeVars"
  >
    <form
      class="w-full max-w-md border border-[var(--rg-border)] bg-[var(--rg-editor)] text-xs text-[var(--rg-foreground)] shadow-2xl"
      @submit.prevent="$emit('confirm')"
    >
      <div class="flex h-10 items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
        <span :class="dialog.danger ? 'text-[#f03e5f]' : ''">{{ dialog.title }}</span>
        <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="$emit('cancel')">×</button>
      </div>
      <div class="grid gap-4 p-4 font-mono text-xs">
        <p v-if="dialog.message" class="whitespace-pre-wrap text-[var(--rg-muted)]">{{ dialog.message }}</p>
        <template v-for="(field, index) in dialog.fields" :key="field.key">
          <label v-if="field.kind === 'text'" class="grid gap-1.5">
            <span class="text-[var(--rg-muted)]">{{ field.label }}</span>
            <input
              v-model="field.value"
              type="text"
              class="h-9 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 outline-none focus:border-[var(--rg-accent)]"
              :placeholder="field.placeholder || ''"
              :autofocus="index === 0"
            >
          </label>
          <label v-else-if="field.kind === 'select'" class="grid gap-1.5">
            <span class="text-[var(--rg-muted)]">{{ field.label }}</span>
            <select
              v-model="field.value"
              class="h-9 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 outline-none focus:border-[var(--rg-accent)]"
            >
              <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
          <label v-else class="flex items-center gap-2">
            <input v-model="field.value" type="checkbox" class="accent-[var(--rg-accent)]">
            <span>{{ field.label }}</span>
          </label>
        </template>
      </div>
      <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
        <button type="button" class="border border-[var(--rg-border)] px-3 py-1.5" @click="$emit('cancel')">Cancel</button>
        <button
          type="submit"
          class="px-4 py-1.5 font-bold text-white"
          :class="dialog.danger ? 'bg-[#ba0e2e] hover:brightness-110' : 'bg-[var(--rg-button)] hover:brightness-110'"
        >
          {{ dialog.confirmLabel }}
        </button>
      </div>
    </form>
  </div>
</template>
