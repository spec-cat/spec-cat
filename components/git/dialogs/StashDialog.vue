<script setup lang="ts">
import GitDialog from '~/components/git/GitDialog.vue'

interface Props {
  visible: boolean
  loading?: boolean
  error?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
})

const emit = defineEmits<{
  close: []
  confirm: [options: { message?: string; includeUntracked: boolean }]
}>()

const message = ref('')
const includeUntracked = ref(false)

function handleConfirm() {
  emit('confirm', {
    message: message.value.trim() || undefined,
    includeUntracked: includeUntracked.value,
  })
}

watch(() => props.visible, (open) => {
  if (open) {
    message.value = ''
    includeUntracked.value = false
  }
})
</script>

<template>
  <GitDialog
    title="Stash Changes"
    :visible="visible"
    :loading="loading"
    :error="error"
    confirm-label="Stash"
    @close="emit('close')"
    @confirm="handleConfirm"
  >
    <p class="text-retro-text text-sm font-mono mb-4">
      Save uncommitted changes to the stash.
    </p>

    <div class="space-y-4">
      <!-- Message input -->
      <div>
        <label class="block text-retro-muted text-xs font-mono mb-1">Message (optional)</label>
        <input
          v-model="message"
          type="text"
          placeholder="Stash description..."
          class="w-full px-2 py-1.5 text-sm font-mono bg-retro-panel border border-retro-border rounded text-retro-text placeholder-retro-muted/50 focus:outline-none focus:border-retro-cyan"
        />
      </div>

      <!-- Include untracked checkbox -->
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          v-model="includeUntracked"
          type="checkbox"
          class="accent-retro-cyan"
        />
        <span class="text-retro-muted text-sm">Include untracked files</span>
      </label>
    </div>
  </GitDialog>
</template>
