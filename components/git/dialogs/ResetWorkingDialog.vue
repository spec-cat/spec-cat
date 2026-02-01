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
  confirm: [options: { mode: 'mixed' | 'hard' }]
}>()

const mode = ref<'mixed' | 'hard'>('mixed')

const isHardMode = computed(() => mode.value === 'hard')

function handleConfirm() {
  emit('confirm', {
    mode: mode.value,
  })
}

watch(() => props.visible, (open) => {
  if (open) {
    mode.value = 'mixed'
  }
})
</script>

<template>
  <GitDialog
    title="Reset Working Directory"
    :visible="visible"
    :loading="loading"
    :error="error"
    confirm-label="Reset"
    :confirm-danger="isHardMode"
    @close="emit('close')"
    @confirm="handleConfirm"
  >
    <p class="text-retro-text text-sm font-mono mb-4">
      Reset the working directory to HEAD.
    </p>

    <div class="space-y-3">
      <!-- Mixed mode radio -->
      <label class="flex items-start gap-2 cursor-pointer">
        <input
          v-model="mode"
          type="radio"
          value="mixed"
          name="reset-mode"
          class="accent-retro-cyan mt-0.5"
        />
        <div>
          <span class="text-retro-text text-sm font-mono">Mixed</span>
          <p class="text-retro-muted text-xs font-mono mt-0.5">
            Reset staging area, keep working directory
          </p>
        </div>
      </label>

      <!-- Hard mode radio -->
      <label class="flex items-start gap-2 cursor-pointer">
        <input
          v-model="mode"
          type="radio"
          value="hard"
          name="reset-mode"
          class="accent-retro-cyan mt-0.5"
        />
        <div>
          <span class="text-retro-text text-sm font-mono">Hard</span>
          <p class="text-retro-muted text-xs font-mono mt-0.5">
            Reset staging area AND working directory (DESTRUCTIVE)
          </p>
        </div>
      </label>
    </div>

    <!-- Hard mode warning -->
    <div
      v-if="isHardMode"
      class="mt-4 p-2 text-xs font-mono text-retro-red bg-retro-red/10 border border-retro-red/30 rounded"
    >
      WARNING: Hard reset will permanently discard all uncommitted changes. This cannot be undone.
    </div>
  </GitDialog>
</template>
