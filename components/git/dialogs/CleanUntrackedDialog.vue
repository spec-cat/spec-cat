<script setup lang="ts">
import GitDialog from '~/components/git/GitDialog.vue'

interface Props {
  visible: boolean
  loading?: boolean
  error?: string | null
}

withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
})

const emit = defineEmits<{
  close: []
  confirm: []
}>()
</script>

<template>
  <GitDialog
    title="Clean Untracked Files"
    :visible="visible"
    :loading="loading"
    :error="error"
    confirm-label="Clean"
    confirm-danger
    @close="emit('close')"
    @confirm="emit('confirm')"
  >
    <div class="space-y-3">
      <p class="text-retro-text text-sm font-mono">
        Remove all untracked files and directories from the working tree.
      </p>
      <p class="text-retro-muted text-xs font-mono">
        This runs <code>git clean -fd</code> and cannot be undone.
      </p>
    </div>
  </GitDialog>
</template>
