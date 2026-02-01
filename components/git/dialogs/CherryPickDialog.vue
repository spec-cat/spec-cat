<script setup lang="ts">
import GitDialog from '~/components/git/GitDialog.vue'

interface Props {
  visible: boolean
  commitHash: string
  commitMessage: string
  loading?: boolean
  error?: string | null
}

withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
})

const emit = defineEmits<{
  close: []
  confirm: [options: { recordOrigin: boolean; noCommit: boolean }]
}>()

const recordOrigin = ref(false)
const noCommit = ref(false)

function handleConfirm() {
  emit('confirm', {
    recordOrigin: recordOrigin.value,
    noCommit: noCommit.value,
  })
}

function handleClose() {
  recordOrigin.value = false
  noCommit.value = false
  emit('close')
}
</script>

<template>
  <GitDialog
    title="Cherry-Pick Commit"
    :visible="visible"
    :loading="loading"
    :error="error"
    confirm-label="Cherry-Pick"
    @close="handleClose"
    @confirm="handleConfirm"
  >
    <!-- Commit info -->
    <div class="mb-4 p-3 bg-retro-panel border border-retro-border rounded">
      <div class="text-xs font-mono text-retro-muted mb-1">Commit</div>
      <div class="text-sm font-mono text-retro-cyan">{{ commitHash.slice(0, 7) }}</div>
      <div class="text-xs font-mono text-retro-text mt-1 truncate">{{ commitMessage.split('\n')[0] }}</div>
    </div>

    <!-- Options -->
    <div class="space-y-3">
      <label class="flex items-start gap-2 cursor-pointer group">
        <input
          v-model="recordOrigin"
          type="checkbox"
          class="mt-0.5 accent-retro-cyan"
        >
        <div>
          <span class="text-sm font-mono text-retro-text group-hover:text-retro-cyan transition-colors">
            Record origin (-x)
          </span>
          <p class="text-xs font-mono text-retro-muted mt-0.5">
            Append "(cherry picked from commit ...)" to the commit message
          </p>
        </div>
      </label>

      <label class="flex items-start gap-2 cursor-pointer group">
        <input
          v-model="noCommit"
          type="checkbox"
          class="mt-0.5 accent-retro-cyan"
        >
        <div>
          <span class="text-sm font-mono text-retro-text group-hover:text-retro-cyan transition-colors">
            No commit
          </span>
          <p class="text-xs font-mono text-retro-muted mt-0.5">
            Apply changes to the working directory without committing
          </p>
        </div>
      </label>
    </div>
  </GitDialog>
</template>
