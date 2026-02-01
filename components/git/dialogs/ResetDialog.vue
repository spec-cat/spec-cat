<script setup lang="ts">
import GitDialog from '~/components/git/GitDialog.vue'

type ResetMode = 'soft' | 'mixed' | 'hard'

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
  confirm: [options: { mode: ResetMode }]
}>()

const mode = ref<ResetMode>('mixed')

const modes: { value: ResetMode; label: string; description: string }[] = [
  {
    value: 'soft',
    label: 'Soft',
    description: 'Move HEAD, keep staged changes and working directory',
  },
  {
    value: 'mixed',
    label: 'Mixed',
    description: 'Move HEAD, reset staging area, keep working directory',
  },
  {
    value: 'hard',
    label: 'Hard',
    description: 'Move HEAD, reset staging area and working directory (DESTRUCTIVE)',
  },
]

function handleConfirm() {
  emit('confirm', { mode: mode.value })
}

function handleClose() {
  mode.value = 'mixed'
  emit('close')
}
</script>

<template>
  <GitDialog
    title="Reset to Commit"
    :visible="visible"
    :loading="loading"
    :error="error"
    confirm-label="Reset"
    :confirm-danger="mode === 'hard'"
    @close="handleClose"
    @confirm="handleConfirm"
  >
    <!-- Commit info -->
    <div class="mb-4 p-3 bg-retro-panel border border-retro-border rounded">
      <div class="text-xs font-mono text-retro-muted mb-1">Reset to</div>
      <div class="text-sm font-mono text-retro-cyan">{{ commitHash.slice(0, 7) }}</div>
      <div class="text-xs font-mono text-retro-text mt-1 truncate">{{ commitMessage.split('\n')[0] }}</div>
    </div>

    <!-- Mode selection -->
    <div class="space-y-2">
      <div class="text-xs font-mono text-retro-muted mb-2">Reset mode</div>

      <label
        v-for="opt in modes"
        :key="opt.value"
        class="flex items-start gap-2 p-2 rounded cursor-pointer group border transition-colors"
        :class="[
          mode === opt.value
            ? 'border-retro-cyan bg-retro-cyan/5'
            : 'border-transparent hover:bg-retro-panel',
        ]"
      >
        <input
          v-model="mode"
          type="radio"
          name="reset-mode"
          :value="opt.value"
          class="mt-0.5 accent-retro-cyan"
        >
        <div>
          <span
            class="text-sm font-mono transition-colors"
            :class="[
              opt.value === 'hard' ? 'text-retro-red' : 'text-retro-text',
              mode === opt.value ? 'text-retro-cyan' : '',
            ]"
          >
            {{ opt.label }}
          </span>
          <p
            class="text-xs font-mono mt-0.5"
            :class="opt.value === 'hard' ? 'text-retro-red/70' : 'text-retro-muted'"
          >
            {{ opt.description }}
          </p>
        </div>
      </label>
    </div>

    <!-- Hard mode warning -->
    <div
      v-if="mode === 'hard'"
      class="mt-3 p-2 text-xs font-mono text-retro-red bg-retro-red/10 border border-retro-red/30 rounded"
    >
      Warning: Hard reset will permanently discard all uncommitted changes in your working directory and staging area. This action cannot be undone.
    </div>
  </GitDialog>
</template>
