<script setup lang="ts">
defineProps<{
  open: boolean
  report: string
  themeVars: Record<string, string>
}>()

defineEmits<{
  close: []
}>()

const closeEl = ref<HTMLButtonElement | null>(null)

defineExpose({
  focusClose: () => closeEl.value?.focus()
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
    :style="themeVars"
  >
    <form class="flex max-h-[80vh] w-full max-w-lg flex-col border border-[var(--rg-border)] bg-[var(--rg-editor)] text-xs text-[var(--rg-foreground)] shadow-2xl" @submit.prevent="$emit('close')">
      <div class="flex h-10 items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
        <span>Conflict Resolution Report</span>
        <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="$emit('close')">×</button>
      </div>
      <div class="overflow-auto p-4">
        <p class="mb-3 text-[var(--rg-muted)]">Rebase conflicts were resolved automatically by the conversation's agent. This report is shown once and not stored.</p>
        <pre class="whitespace-pre-wrap break-words font-mono text-[var(--rg-foreground)]">{{ report }}</pre>
      </div>
      <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
        <button ref="closeEl" type="submit" class="bg-[var(--rg-button)] px-4 py-1.5 font-bold text-white">Close</button>
      </div>
    </form>
  </div>
</template>
