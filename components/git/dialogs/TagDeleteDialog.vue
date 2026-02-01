<script setup lang="ts">
import GitDialog from '~/components/git/GitDialog.vue'

interface Props {
  visible: boolean
  tagName: string
  remotes: string[]
  loading?: boolean
  error?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
})

const emit = defineEmits<{
  close: []
  confirm: [options: { deleteFromRemote: boolean; remote?: string }]
}>()

const deleteFromRemote = ref(false)
const selectedRemote = ref('origin')

function handleConfirm() {
  emit('confirm', {
    deleteFromRemote: deleteFromRemote.value,
    remote: deleteFromRemote.value ? selectedRemote.value : undefined,
  })
}

watch(() => props.visible, (open) => {
  if (open) {
    deleteFromRemote.value = false
    selectedRemote.value = props.remotes.includes('origin') ? 'origin' : (props.remotes[0] ?? 'origin')
  }
})
</script>

<template>
  <GitDialog
    title="Delete Tag"
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
      Delete tag <span class="text-retro-cyan">{{ tagName }}</span>?
    </p>

    <div class="space-y-3 mt-4">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          v-model="deleteFromRemote"
          type="checkbox"
          class="accent-retro-cyan"
        />
        <span class="text-retro-muted text-sm">Also delete from remote</span>
      </label>

      <div v-if="deleteFromRemote" class="ml-6">
        <label class="block text-retro-muted text-xs font-mono mb-1">Remote</label>
        <select
          v-model="selectedRemote"
          class="w-full px-2 py-1.5 text-sm font-mono bg-retro-panel border border-retro-border rounded text-retro-text focus:outline-none focus:border-retro-cyan"
        >
          <option
            v-for="remote in remotes"
            :key="remote"
            :value="remote"
          >
            {{ remote }}
          </option>
        </select>
      </div>
    </div>
  </GitDialog>
</template>
