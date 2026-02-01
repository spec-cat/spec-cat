<script setup lang="ts">
import { XMarkIcon } from '@heroicons/vue/24/outline'

interface Props {
  title: string
  visible: boolean
  loading?: boolean
  error?: string | null
  confirmLabel?: string
  confirmDanger?: boolean
  cancelLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
  confirmLabel: 'Confirm',
  confirmDanger: false,
  cancelLabel: 'Cancel',
})

const emit = defineEmits<{
  close: []
  confirm: []
}>()

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
  if (event.key === 'Enter' && !props.loading) {
    event.preventDefault()
    emit('confirm')
  }
}

watch(() => props.visible, (open) => {
  if (open) {
    document.addEventListener('keydown', handleKeydown)
  } else {
    document.removeEventListener('keydown', handleKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        @click.self="emit('close')"
      >
        <div class="w-full max-w-md mx-4 bg-retro-dark border border-retro-border rounded-lg shadow-xl">
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-3 border-b border-retro-border">
            <h3 class="text-sm font-mono text-retro-text">{{ title }}</h3>
            <button
              type="button"
              class="p-1 rounded text-retro-muted hover:text-retro-text hover:bg-retro-panel transition-colors"
              title="Close"
              @click="emit('close')"
            >
              <XMarkIcon class="h-4 w-4" />
            </button>
          </div>

          <!-- Body -->
          <div class="p-4">
            <!-- Error -->
            <div
              v-if="error"
              class="mb-3 p-2 text-xs font-mono text-retro-red bg-retro-red/10 border border-retro-red/30 rounded"
            >
              {{ error }}
            </div>

            <slot />
          </div>

          <!-- Footer -->
          <div class="flex justify-end gap-2 px-4 py-3 border-t border-retro-border">
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-mono text-retro-muted hover:text-retro-text bg-retro-panel hover:bg-retro-border rounded transition-colors"
              :disabled="loading"
              @click="emit('close')"
            >
              {{ cancelLabel }}
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-mono rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :class="[
                confirmDanger
                  ? 'text-retro-red bg-retro-red/10 border border-retro-red/30 hover:bg-retro-red/20'
                  : 'text-retro-black bg-retro-cyan hover:bg-retro-cyan/80'
              ]"
              :disabled="loading"
              @click="emit('confirm')"
            >
              {{ loading ? 'Loading...' : confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
