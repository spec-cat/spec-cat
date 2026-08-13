<script setup lang="ts">
import type { GitRemoteDetail } from '~/types/app'

defineProps<{
  open: boolean
  remotes: GitRemoteDetail[]
  loading: boolean
  themeVars: Record<string, string>
}>()

defineEmits<{
  close: []
  add: []
  edit: [remote: GitRemoteDetail]
  remove: [remote: GitRemoteDetail]
}>()

const addEl = ref<HTMLButtonElement | null>(null)

defineExpose({
  focusAdd: () => addEl.value?.focus()
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[105] flex items-center justify-center bg-black/70 p-4"
    :style="themeVars"
  >
    <form class="w-full max-w-lg border border-[var(--rg-border)] bg-[var(--rg-editor)] text-[var(--rg-foreground)] shadow-2xl" @submit.prevent="$emit('add')">
      <div class="flex h-10 items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
        <span>Remotes</span>
        <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="$emit('close')">×</button>
      </div>
      <div class="grid gap-1 p-4 font-mono text-xs">
        <p v-if="loading" class="text-[var(--rg-muted)]">Loading remotes...</p>
        <p v-else-if="!remotes.length" class="text-[var(--rg-muted)]">No remotes configured.</p>
        <div
          v-for="remote in remotes"
          :key="remote.name"
          class="grid grid-cols-[90px_minmax(0,1fr)_auto] items-center gap-2 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 py-2"
        >
          <span class="truncate font-bold text-[var(--rg-accent)]">{{ remote.name }}</span>
          <span class="min-w-0">
            <span class="block truncate" :title="remote.fetchUrl">{{ remote.fetchUrl }}</span>
            <span
              v-if="remote.pushUrl && remote.pushUrl !== remote.fetchUrl"
              class="block truncate text-[10px] text-[var(--rg-muted)]"
              :title="remote.pushUrl"
            >
              push: {{ remote.pushUrl }}
            </span>
          </span>
          <span class="flex shrink-0 items-center gap-1">
            <button
              type="button"
              class="grid h-6 w-6 place-items-center border border-[var(--rg-border)] text-[11px] hover:border-[var(--rg-accent)]"
              title="Edit remote URL"
              @click="$emit('edit', remote)"
            >
              ✎
            </button>
            <button
              type="button"
              class="grid h-6 w-6 place-items-center border border-[var(--rg-border)] text-sm hover:border-[#f03e5f] hover:text-[#f03e5f]"
              title="Delete remote"
              @click="$emit('remove', remote)"
            >
              ×
            </button>
          </span>
        </div>
      </div>
      <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
        <button type="button" class="border border-[var(--rg-border)] px-3 py-1.5 text-xs" @click="$emit('close')">Close</button>
        <button
          ref="addEl"
          type="submit"
          class="bg-[var(--rg-button)] px-4 py-1.5 text-xs font-bold text-white hover:brightness-110"
        >
          Add Remote
        </button>
      </div>
    </form>
  </div>
</template>
