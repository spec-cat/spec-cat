<script setup lang="ts">
import type { PendingFeatureAction, SessionOptions } from '~/types/app'
import type { ProviderId } from '~/server/utils/session-store'

defineProps<{
  open: boolean
  pendingAction: PendingFeatureAction | null
  pendingActionLabel: string
  sessionOptions: SessionOptions
  loading: boolean
  creating: boolean
  error: string
  themeVars: Record<string, string>
}>()

const baseBranch = defineModel<string>('baseBranch', { required: true })
const provider = defineModel<ProviderId>('provider', { required: true })
const emit = defineEmits<{
  create: []
  close: []
}>()

const baseBranchEl = ref<HTMLSelectElement | null>(null)

defineExpose({
  focusBaseBranch: () => baseBranchEl.value?.focus()
})

function handleEnter(event: KeyboardEvent) {
  const target = event.target
  if (target instanceof HTMLElement && target.closest('button')) return
  event.preventDefault()
  emit('create')
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
    :style="themeVars"
  >
    <form
      class="w-full max-w-md border border-[var(--rg-border)] bg-[var(--rg-editor)] text-xs text-[var(--rg-foreground)] shadow-2xl"
      @submit.prevent="$emit('create')"
      @keydown.enter.exact="handleEnter"
    >
      <div class="flex h-10 items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
        <span>New Conversation</span>
        <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="$emit('close')">×</button>
      </div>
      <div class="grid gap-4 p-4 font-mono text-xs">
        <p
          v-if="pendingAction"
          class="border border-[var(--rg-accent)]/60 bg-[var(--rg-accent)]/10 px-3 py-2 leading-5 text-[var(--rg-accent)]"
        >
          No conversation is on <span class="font-bold">{{ pendingAction.featureId }}</span>.
          Creating a linked conversation from its spec branch, then running {{ pendingActionLabel }}.
        </p>
        <label class="grid gap-1.5">
          <span class="text-[var(--rg-muted)]">Base Branch</span>
          <select ref="baseBranchEl" v-model="baseBranch" class="h-9 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 outline-none focus:border-[var(--rg-accent)]">
            <option v-for="branch in sessionOptions.branches" :key="branch" :value="branch">{{ branch }}</option>
          </select>
        </label>
        <label class="grid gap-1.5">
          <span class="text-[var(--rg-muted)]">Provider</span>
          <select v-model="provider" class="h-9 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 outline-none focus:border-[var(--rg-accent)]">
            <option v-for="providerOption in sessionOptions.providers" :key="providerOption.id" :value="providerOption.id">{{ providerOption.name }}</option>
          </select>
        </label>
        <p v-if="error" class="text-[#f03e5f]">{{ error }}</p>
        <p v-else class="text-[var(--rg-muted)]">The provider uses its own configured default model. Provider and base branch are fixed when the managed worktree is created.</p>
      </div>
      <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
        <button type="button" class="border border-[var(--rg-border)] px-3 py-1.5" @click="$emit('close')">Cancel</button>
        <button
          type="submit"
          class="bg-[var(--rg-button)] px-4 py-1.5 font-bold text-white disabled:opacity-40"
          :disabled="loading || creating || !baseBranch"
        >
          {{ creating ? 'Creating...' : 'Create' }}
        </button>
      </div>
    </form>
  </div>
</template>
