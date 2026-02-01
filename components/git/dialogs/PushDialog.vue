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
  confirm: [options: { remote: string; force: boolean; forceWithLease: boolean }]
}>()

const remote = ref('origin')
const force = ref(false)
const forceWithLease = ref(false)

function handleForceChange(value: boolean) {
  force.value = value
  if (value) {
    forceWithLease.value = false
  }
}

function handleForceWithLeaseChange(value: boolean) {
  forceWithLease.value = value
  if (value) {
    force.value = false
  }
}

function handleConfirm() {
  emit('confirm', {
    remote: remote.value,
    force: force.value,
    forceWithLease: forceWithLease.value,
  })
}

watch(() => props.visible, (open) => {
  if (open) {
    remote.value = props.remotes.includes('origin') ? 'origin' : (props.remotes[0] ?? 'origin')
    force.value = false
    forceWithLease.value = false
  }
})
</script>

<template>
  <GitDialog
    title="Push Branch"
    :visible="visible"
    :loading="loading"
    :error="error"
    confirm-label="Push"
    @close="emit('close')"
    @confirm="handleConfirm"
  >
    <p class="text-retro-text text-sm font-mono mb-4">
      Push <span class="text-retro-cyan">{{ branchName }}</span> to remote
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
          :checked="force"
          type="checkbox"
          class="accent-retro-cyan"
          @change="handleForceChange(($event.target as HTMLInputElement).checked)"
        />
        <span class="text-retro-muted text-sm">Force push</span>
      </label>

      <label class="flex items-center gap-2 cursor-pointer">
        <input
          :checked="forceWithLease"
          type="checkbox"
          class="accent-retro-cyan"
          @change="handleForceWithLeaseChange(($event.target as HTMLInputElement).checked)"
        />
        <span class="text-retro-muted text-sm">Force with lease (safer force push)</span>
      </label>

      <div
        v-if="force || forceWithLease"
        class="p-2 text-xs font-mono text-retro-yellow bg-retro-yellow/10 border border-retro-yellow/30 rounded"
      >
        {{ force ? 'Force push will overwrite remote history. Use with caution.' : 'Force with lease will reject the push if the remote has been updated since your last fetch.' }}
      </div>
    </div>
  </GitDialog>
</template>
