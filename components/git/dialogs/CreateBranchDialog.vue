<script setup lang="ts">
import GitDialog from '~/components/git/GitDialog.vue'

interface Props {
  visible: boolean
  fromCommit: string
  loading?: boolean
  error?: string | null
}

withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
})

const emit = defineEmits<{
  close: []
  confirm: [options: { name: string; checkout: boolean }]
}>()

const branchName = ref('')
const checkout = ref(true)

const isValid = computed(() => branchName.value.trim().length > 0)

function handleConfirm() {
  if (!isValid.value) return

  emit('confirm', {
    name: branchName.value.trim(),
    checkout: checkout.value,
  })
}

function handleClose() {
  branchName.value = ''
  checkout.value = true
  emit('close')
}
</script>

<template>
  <GitDialog
    title="Create Branch"
    :visible="visible"
    :loading="loading"
    :error="error"
    confirm-label="Create Branch"
    @close="handleClose"
    @confirm="handleConfirm"
  >
    <!-- From commit info -->
    <div class="mb-4 p-3 bg-retro-panel border border-retro-border rounded">
      <div class="text-xs font-mono text-retro-muted mb-1">From</div>
      <div class="text-sm font-mono text-retro-cyan">{{ fromCommit.slice(0, 7) }}</div>
    </div>

    <!-- Branch name -->
    <div class="mb-4">
      <label class="block text-xs font-mono text-retro-muted mb-1.5">Branch name</label>
      <input
        v-model="branchName"
        type="text"
        placeholder="feature/my-branch"
        class="w-full px-3 py-2 text-sm bg-retro-panel border border-retro-border rounded text-retro-text placeholder-retro-muted focus:outline-none focus:border-retro-cyan"
      >
    </div>

    <!-- Checkout option -->
    <label class="flex items-start gap-2 cursor-pointer group">
      <input
        v-model="checkout"
        type="checkbox"
        class="mt-0.5 accent-retro-cyan"
      >
      <div>
        <span class="text-sm font-mono text-retro-text group-hover:text-retro-cyan transition-colors">
          Switch to new branch
        </span>
        <p class="text-xs font-mono text-retro-muted mt-0.5">
          Checkout the branch after creating it
        </p>
      </div>
    </label>
  </GitDialog>
</template>
