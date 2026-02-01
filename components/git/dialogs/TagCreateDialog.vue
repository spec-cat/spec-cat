<script setup lang="ts">
import GitDialog from '~/components/git/GitDialog.vue'

interface Props {
  visible: boolean
  commitHash: string
  remotes: string[]
  loading?: boolean
  error?: string | null
}

withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
})

const emit = defineEmits<{
  close: []
  confirm: [options: {
    name: string
    annotated: boolean
    message?: string
    pushToRemote?: string
  }]
}>()

const tagName = ref('')
const annotated = ref(false)
const message = ref('')
const pushToRemote = ref(false)
const selectedRemote = ref('')

const isValid = computed(() => tagName.value.trim().length > 0)

function handleConfirm() {
  if (!isValid.value) return

  const options: {
    name: string
    annotated: boolean
    message?: string
    pushToRemote?: string
  } = {
    name: tagName.value.trim(),
    annotated: annotated.value,
  }

  if (annotated.value && message.value.trim()) {
    options.message = message.value.trim()
  }

  if (pushToRemote.value && selectedRemote.value) {
    options.pushToRemote = selectedRemote.value
  }

  emit('confirm', options)
}

function handleClose() {
  tagName.value = ''
  annotated.value = false
  message.value = ''
  pushToRemote.value = false
  selectedRemote.value = ''
  emit('close')
}

watch(() => annotated.value, (val) => {
  if (!val) {
    message.value = ''
  }
})
</script>

<template>
  <GitDialog
    title="Create Tag"
    :visible="visible"
    :loading="loading"
    :error="error"
    confirm-label="Create Tag"
    @close="handleClose"
    @confirm="handleConfirm"
  >
    <!-- Commit info -->
    <div class="mb-4 p-3 bg-retro-panel border border-retro-border rounded">
      <div class="text-xs font-mono text-retro-muted mb-1">At commit</div>
      <div class="text-sm font-mono text-retro-cyan">{{ commitHash.slice(0, 7) }}</div>
    </div>

    <!-- Tag name -->
    <div class="mb-4">
      <label class="block text-xs font-mono text-retro-muted mb-1.5">Tag name</label>
      <input
        v-model="tagName"
        type="text"
        placeholder="v1.0.0"
        class="w-full px-3 py-2 text-sm bg-retro-panel border border-retro-border rounded text-retro-text placeholder-retro-muted focus:outline-none focus:border-retro-cyan"
      >
    </div>

    <!-- Annotated toggle -->
    <div class="mb-3">
      <label class="flex items-start gap-2 cursor-pointer group">
        <input
          v-model="annotated"
          type="checkbox"
          class="mt-0.5 accent-retro-cyan"
        >
        <div>
          <span class="text-sm font-mono text-retro-text group-hover:text-retro-cyan transition-colors">
            Annotated tag
          </span>
          <p class="text-xs font-mono text-retro-muted mt-0.5">
            Create a full tag object with message and tagger info
          </p>
        </div>
      </label>
    </div>

    <!-- Message (shown when annotated) -->
    <div v-if="annotated" class="mb-4">
      <label class="block text-xs font-mono text-retro-muted mb-1.5">Tag message</label>
      <textarea
        v-model="message"
        rows="3"
        placeholder="Release description..."
        class="w-full px-3 py-2 text-sm bg-retro-panel border border-retro-border rounded text-retro-text placeholder-retro-muted focus:outline-none focus:border-retro-cyan resize-none"
      />
    </div>

    <!-- Push to remote -->
    <div class="space-y-2">
      <label class="flex items-start gap-2 cursor-pointer group">
        <input
          v-model="pushToRemote"
          type="checkbox"
          class="mt-0.5 accent-retro-cyan"
          :disabled="remotes.length === 0"
        >
        <div>
          <span
            class="text-sm font-mono transition-colors"
            :class="remotes.length === 0 ? 'text-retro-muted' : 'text-retro-text group-hover:text-retro-cyan'"
          >
            Push to remote
          </span>
        </div>
      </label>

      <div v-if="pushToRemote && remotes.length > 0" class="ml-6">
        <select
          v-model="selectedRemote"
          class="w-full px-3 py-2 text-sm bg-retro-panel border border-retro-border rounded text-retro-text focus:outline-none focus:border-retro-cyan"
        >
          <option value="" disabled class="text-retro-muted">Select remote</option>
          <option v-for="remote in remotes" :key="remote" :value="remote">
            {{ remote }}
          </option>
        </select>
      </div>
    </div>
  </GitDialog>
</template>
