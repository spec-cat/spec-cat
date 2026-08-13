<script setup lang="ts">
import type { ToastItem } from '~/types/app'

defineProps<{
  toasts: ToastItem[]
  themeVars: Record<string, string>
}>()

defineEmits<{
  dismiss: [id: number]
}>()

function toastClass(type: ToastItem['type']) {
  if (type === 'success') return 'border-[#26a6a6] text-[#59d9d9]'
  if (type === 'error') return 'border-[#e61f44] text-[#ffb4c4]'
  if (type === 'warning') return 'border-[#f7b83d] text-[#f7b83d]'
  return 'border-[var(--rg-border)] text-[var(--rg-foreground)]'
}
</script>

<template>
  <div
    v-if="toasts.length"
    class="pointer-events-none fixed bottom-8 right-4 z-[300] flex w-[320px] flex-col gap-2"
    :style="themeVars"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="pointer-events-auto flex items-start gap-2 border bg-[var(--rg-editor)] px-3 py-2 font-mono text-[12px] shadow-2xl"
      :class="toastClass(toast.type)"
      role="status"
    >
      <span class="min-w-0 flex-1 whitespace-pre-wrap break-words">{{ toast.message }}</span>
      <button
        type="button"
        class="shrink-0 text-sm font-bold leading-none opacity-60 hover:opacity-100"
        aria-label="Dismiss notification"
        @click="$emit('dismiss', toast.id)"
      >
        ×
      </button>
    </div>
  </div>
</template>
