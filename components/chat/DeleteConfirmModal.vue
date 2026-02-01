<script setup lang="ts">
/**
 * DeleteConfirmModal Component (T044)
 * Confirmation dialog for deleting a conversation
 */
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/vue/24/outline'

defineProps<{
  show: boolean
  title: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

function handleBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    emit('cancel')
  }
}
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
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        @click="handleBackdropClick"
      >
        <Transition
          enter-active-class="transition-all duration-200"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition-all duration-200"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="show"
            class="w-full max-w-md mx-4 bg-retro-dark border border-retro-border rounded-lg shadow-xl"
          >
            <!-- Header -->
            <div class="flex items-center justify-between p-4 border-b border-retro-border">
              <div class="flex items-center gap-2">
                <ExclamationTriangleIcon class="w-5 h-5 text-retro-red" />
                <h3 class="text-lg font-mono text-retro-text">Delete Conversation</h3>
              </div>
              <button
                @click="emit('cancel')"
                class="p-1 hover:bg-retro-panel rounded transition-colors"
              >
                <XMarkIcon class="w-5 h-5 text-retro-muted" />
              </button>
            </div>

            <!-- Content -->
            <div class="p-4">
              <p class="text-sm text-retro-muted font-mono">
                Are you sure you want to delete this conversation?
              </p>
              <p class="mt-2 text-sm text-retro-text font-mono truncate">
                "{{ title }}"
              </p>
              <p class="mt-3 text-xs text-retro-muted">
                This action cannot be undone.
              </p>
            </div>

            <!-- Actions -->
            <div class="flex justify-end gap-3 p-4 border-t border-retro-border">
              <button
                @click="emit('cancel')"
                class="px-4 py-2 text-sm font-mono text-retro-muted border border-retro-border rounded hover:bg-retro-panel transition-colors"
              >
                Cancel
              </button>
              <button
                @click="emit('confirm')"
                class="px-4 py-2 text-sm font-mono text-white bg-retro-red/80 border border-retro-red rounded hover:bg-retro-red transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
