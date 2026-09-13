<script setup lang="ts">
defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="sticky top-0 z-10 -mt-2 bg-[var(--rg-sidebar)] px-3 pb-2 pt-2">
    <input
      :value="modelValue"
      type="search"
      class="h-7 w-full border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 text-xs text-[var(--rg-foreground)] outline-none placeholder:text-[#88857c] focus:border-[var(--rg-accent)]"
      placeholder="Search conversations"
      aria-label="Search conversations"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
  </div>
</template>
