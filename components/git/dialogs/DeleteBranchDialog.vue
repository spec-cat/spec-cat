<script setup lang="ts">
import GitDialog from '~/components/git/GitDialog.vue'

interface Props {
  visible: boolean
  branchName: string
  isLocal: boolean
  loading?: boolean
  error?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
})

const emit = defineEmits<{
  close: []
  confirm: [options: { force: boolean }]
}>()

const forceDelete = ref(false)

function handleConfirm() {
  emit('confirm', {
    force: forceDelete.value,
  })
}

watch(() => props.visible, (open) => {
  if (open) {
    forceDelete.value = false
  }
})
</script>

<template>
  <GitDialog
    title="Delete Branch"
    :visible="visible"
    :loading="loading"
    :error="error"
    confirm-label="Delete"
    :confirm-danger="true"
    @close="emit('close')"
    @confirm="handleConfirm"
  >
    <div class="mb-4 p-2 text-xs font-mono text-retro-yellow bg-retro-yellow/10 border border-retro-yellow/30 rounded">
      This action is permanent and cannot be undone.
    </div>

    <p class="text-retro-text text-sm font-mono mb-2">
      Delete {{ isLocal ? 'local' : 'remote' }} branch <span class="text-retro-cyan">{{ branchName }}</span>?
    </p>

    <div class="space-y-3 mt-4">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          v-model="forceDelete"
          type="checkbox"
          class="accent-retro-cyan"
        />
        <span class="text-retro-muted text-sm">Force delete (even if not fully merged)</span>
      </label>
    </div>
  </GitDialog>
</template>
