<script setup lang="ts">
import GitDialog from '~/components/git/GitDialog.vue'

interface Props {
  visible: boolean
  branchName: string
  loading?: boolean
  error?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
})

const emit = defineEmits<{
  close: []
  confirm: [options: { noCommit: boolean; noFastForward: boolean; squash: boolean }]
}>()

const noCommit = ref(false)
const noFastForward = ref(false)
const squash = ref(false)

function handleConfirm() {
  emit('confirm', {
    noCommit: noCommit.value,
    noFastForward: noFastForward.value,
    squash: squash.value,
  })
}

watch(() => props.visible, (open) => {
  if (open) {
    noCommit.value = false
    noFastForward.value = false
    squash.value = false
  }
})
</script>

<template>
  <GitDialog
    title="Merge Branch"
    :visible="visible"
    :loading="loading"
    :error="error"
    confirm-label="Merge"
    @close="emit('close')"
    @confirm="handleConfirm"
  >
    <p class="text-retro-text text-sm font-mono mb-4">
      Merge <span class="text-retro-cyan">{{ branchName }}</span> into current branch
    </p>

    <div class="space-y-3">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          v-model="noCommit"
          type="checkbox"
          class="accent-retro-cyan"
        />
        <span class="text-retro-muted text-sm">No commit (stage changes only)</span>
      </label>

      <label class="flex items-center gap-2 cursor-pointer">
        <input
          v-model="noFastForward"
          type="checkbox"
          class="accent-retro-cyan"
        />
        <span class="text-retro-muted text-sm">No fast-forward (always create merge commit)</span>
      </label>

      <label class="flex items-center gap-2 cursor-pointer">
        <input
          v-model="squash"
          type="checkbox"
          class="accent-retro-cyan"
        />
        <span class="text-retro-muted text-sm">Squash (combine all commits into one)</span>
      </label>
    </div>
  </GitDialog>
</template>
