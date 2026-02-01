<script setup lang="ts">
import { XMarkIcon } from '@heroicons/vue/24/outline'
import { useWorktreeStore } from '~/stores/worktree'

const modelValue = defineModel<boolean>({ default: false })

const worktreeStore = useWorktreeStore()

const description = ref('')
const shortName = ref('')
const isSubmitting = ref(false)
const error = ref('')

const handleSubmit = async () => {
  if (!description.value.trim()) {
    error.value = 'Description is required'
    return
  }

  isSubmitting.value = true
  error.value = ''

  try {
    const result = await worktreeStore.createWorktree({
      description: description.value.trim(),
      shortName: shortName.value.trim() || undefined,
    })

    if (result.success) {
      description.value = ''
      shortName.value = ''
      modelValue.value = false
    } else {
      error.value = result.error || 'Failed to create worktree'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create worktree'
  } finally {
    isSubmitting.value = false
  }
}

const handleClose = () => {
  modelValue.value = false
  description.value = ''
  shortName.value = ''
  error.value = ''
}

// Close on escape
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    handleClose()
  }
}

watch(modelValue, (open) => {
  if (open) {
    document.addEventListener('keydown', handleKeydown)
  } else {
    document.removeEventListener('keydown', handleKeydown)
  }
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
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="handleClose"
      >
        <div class="w-full max-w-md mx-4 bg-retro-dark border border-retro-border rounded-lg shadow-xl">
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-3 border-b border-retro-border">
            <h3 class="text-sm font-mono text-retro-text">Create Worktree</h3>
            <button
              type="button"
              class="p-1 rounded text-retro-muted hover:text-retro-text hover:bg-retro-panel transition-colors"
              @click="handleClose"
            >
              <XMarkIcon class="h-4 w-4" />
            </button>
          </div>

          <!-- Form -->
          <form class="p-4 space-y-4" @submit.prevent="handleSubmit">
            <!-- Error -->
            <div v-if="error" class="p-2 text-xs font-mono text-retro-red bg-retro-red/10 border border-retro-red/30 rounded">
              {{ error }}
            </div>

            <!-- Description -->
            <div>
              <label class="block text-xs font-mono text-retro-muted mb-1">
                Feature Description <span class="text-retro-red">*</span>
              </label>
              <input
                v-model="description"
                type="text"
                placeholder="e.g., Add user authentication"
                class="w-full px-3 py-2 text-sm font-mono bg-retro-black border border-retro-border rounded text-retro-text placeholder-retro-subtle focus:outline-none focus:border-retro-cyan"
                :disabled="isSubmitting"
              />
              <p class="mt-1 text-[10px] font-mono text-retro-subtle">
                A brief description of what this feature does
              </p>
            </div>

            <!-- Short name (optional) -->
            <div>
              <label class="block text-xs font-mono text-retro-muted mb-1">
                Short Name <span class="text-retro-subtle">(optional)</span>
              </label>
              <input
                v-model="shortName"
                type="text"
                placeholder="e.g., auth"
                class="w-full px-3 py-2 text-sm font-mono bg-retro-black border border-retro-border rounded text-retro-text placeholder-retro-subtle focus:outline-none focus:border-retro-cyan"
                :disabled="isSubmitting"
              />
              <p class="mt-1 text-[10px] font-mono text-retro-subtle">
                Override the auto-generated branch name (e.g., 001-auth instead of 001-add-user-authentication)
              </p>
            </div>

            <!-- Actions -->
            <div class="flex justify-end gap-2 pt-2">
              <button
                type="button"
                class="px-3 py-1.5 text-xs font-mono text-retro-muted hover:text-retro-text bg-retro-panel hover:bg-retro-border rounded transition-colors"
                :disabled="isSubmitting"
                @click="handleClose"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="px-3 py-1.5 text-xs font-mono text-retro-black bg-retro-cyan hover:bg-retro-cyan/80 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isSubmitting || !description.trim()"
              >
                {{ isSubmitting ? 'Creating...' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
