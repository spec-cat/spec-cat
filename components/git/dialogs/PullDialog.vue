<script setup lang="ts">
import GitDialog from '~/components/git/GitDialog.vue'

interface Props {
  visible: boolean
  branchName: string
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
  confirm: [options: { remote: string; noFastForward: boolean; squash: boolean }]
}>()

const remote = ref('origin')
const noFastForward = ref(false)
const squash = ref(false)

function handleConfirm() {
  emit('confirm', {
    remote: remote.value,
    noFastForward: noFastForward.value,
    squash: squash.value,
  })
}

watch(() => props.visible, (open) => {
  if (open) {
    remote.value = props.remotes.includes('origin') ? 'origin' : (props.remotes[0] ?? 'origin')
    noFastForward.value = false
    squash.value = false
  }
})
</script>

<template>
  <GitDialog
    title="Pull Branch"
    :visible="visible"
    :loading="loading"
    :error="error"
    confirm-label="Pull"
    @close="emit('close')"
    @confirm="handleConfirm"
  >
    <p class="text-retro-text text-sm font-mono mb-4">
      Pull <span class="text-retro-cyan">{{ branchName }}</span> from remote
    </p>

    <div class="space-y-3">
      <div>
        <label class="text-retro-muted text-sm block mb-1">Remote</label>
        <select
          v-model="remote"
          class="w-full bg-retro-panel border border-retro-border rounded text-retro-text text-sm px-2 py-1.5 font-mono focus:outline-none focus:border-retro-cyan"
        >
          <option
            v-for="r in remotes"
            :key="r"
            :value="r"
          >
            {{ r }}
          </option>
        </select>
      </div>

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
