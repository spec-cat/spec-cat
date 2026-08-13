<script setup lang="ts">
import type { ProviderId } from '~/server/utils/session-store'
import type { SessionProviderOption } from '~/types/app'

defineProps<{
  open: boolean
  providerOptions: SessionProviderOption[]
  appVersion: string
  themeVars: Record<string, string>
}>()

const provider = defineModel<ProviderId>('provider', { required: true })
const emit = defineEmits<{
  close: []
}>()

const doneEl = ref<HTMLButtonElement | null>(null)

defineExpose({
  focusDone: () => doneEl.value?.focus()
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
    :style="themeVars"
  >
    <form
      class="w-full max-w-md border border-[var(--rg-border)] bg-[var(--rg-editor)] text-xs text-[var(--rg-foreground)] shadow-2xl"
      @submit.prevent="emit('close')"
    >
      <div class="flex h-10 items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
        <span>Settings</span>
        <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="emit('close')">×</button>
      </div>
      <div class="grid gap-4 p-4 font-mono text-xs">
        <label class="grid gap-1.5">
          <span class="text-[var(--rg-muted)]">Default Provider</span>
          <select v-model="provider" class="h-9 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 outline-none focus:border-[var(--rg-accent)]">
            <option v-for="providerOption in providerOptions" :key="providerOption.id" :value="providerOption.id">{{ providerOption.name }}</option>
          </select>
          <span class="text-[var(--rg-muted)]">Pre-selected when you start a new conversation.</span>
        </label>
        <div class="flex items-center justify-between border-t border-[var(--rg-border)] pt-3 text-[var(--rg-muted)]">
          <span>Version</span>
          <span class="text-[var(--rg-foreground)]">v{{ appVersion }}</span>
        </div>
      </div>
      <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
        <button ref="doneEl" type="submit" class="bg-[var(--rg-button)] px-4 py-1.5 font-bold text-white">Done</button>
      </div>
    </form>
  </div>
</template>
