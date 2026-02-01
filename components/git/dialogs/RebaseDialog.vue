<script setup lang="ts">
import GitDialog from '~/components/git/GitDialog.vue'

interface Props {
  visible: boolean
  branchName: string
  ontoBranch: string
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
    title="Rebase Branch"
    :visible="visible"
    :loading="loading"
    :error="error"
    confirm-label="Rebase"
    @close="emit('close')"
    @confirm="emit('confirm')"
  >
    <p class="text-retro-text text-sm font-mono mb-4">
      Rebase <span class="text-retro-cyan">{{ branchName }}</span> onto <span class="text-retro-cyan">{{ ontoBranch }}</span>
    </p>

    <div class="p-2 text-xs font-mono text-retro-yellow bg-retro-yellow/10 border border-retro-yellow/30 rounded">
      This will rewrite commit history. Commits from <span class="text-retro-cyan">{{ branchName }}</span> will be replayed on top of <span class="text-retro-cyan">{{ ontoBranch }}</span>.
    </div>
  </GitDialog>
</template>
