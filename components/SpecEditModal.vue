<script setup lang="ts">
defineProps<{
  open: boolean
  selectedFile: { featureId: string; filename: string; label: string } | null
  saving: boolean
  themeVars: Record<string, string>
}>()

const content = defineModel<string>('content', { required: true })

defineEmits<{
  save: []
  close: []
}>()
</script>

<template>
  <div
    v-if="open && selectedFile"
    class="fixed inset-0 z-[105] flex items-center justify-center bg-black/70 p-4"
    :style="themeVars"
  >
    <form
      class="grid h-[min(760px,90vh)] w-full max-w-3xl grid-rows-[40px_minmax(0,1fr)_auto] border border-[var(--rg-border)] bg-[var(--rg-editor)] text-[var(--rg-foreground)] shadow-2xl"
      @submit.prevent="$emit('save')"
      @keydown.enter.meta.prevent="$emit('save')"
      @keydown.enter.ctrl.prevent="$emit('save')"
    >
      <div class="flex items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
        <span class="truncate">Edit {{ selectedFile.featureId }}/{{ selectedFile.filename }}</span>
        <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="$emit('close')">×</button>
      </div>
      <textarea
        v-model="content"
        class="min-h-0 resize-none border-0 bg-[var(--rg-input)] p-4 font-mono text-[12px] leading-5 text-[var(--rg-foreground)] outline-none"
        spellcheck="false"
      />
      <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
        <button type="button" class="border border-[var(--rg-border)] px-3 py-1.5 text-xs" :disabled="saving" @click="$emit('close')">Cancel</button>
        <button
          type="submit"
          class="bg-[var(--rg-button)] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          :disabled="saving"
        >
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </form>
  </div>
</template>
