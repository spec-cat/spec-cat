<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { CheckIcon, XMarkIcon, SparklesIcon, ChevronUpDownIcon } from '@heroicons/vue/24/outline'

interface Props {
  baseBranch: string
  worktreeBranch: string
  worktreePath: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  confirm: [message: string, targetBranch: string]
  cancel: []
}>()

const commitMessage = ref('')
const commitCount = ref<number | null>(null)
const loading = ref(false)
const generating = ref(false)
const targetBranch = ref(props.baseBranch)
const branches = ref<string[]>([])
const branchesLoading = ref(false)

async function generateMessage() {
  generating.value = true
  try {
    const res = await $fetch<{ success: boolean; message?: string; error?: string }>('/api/chat/generate-commit-message', {
      method: 'POST',
      body: { conversationId: props.worktreePath.split('/').pop()?.replace('br-', '') || '', worktreePath: props.worktreePath },
    })
    if (res.success && res.message) {
      commitMessage.value = res.message
    }
  } catch {
    // silently fail — user can still type manually
  } finally {
    generating.value = false
  }
}

onMounted(async () => {
  // Fetch commit count and branches in parallel
  const commitCountPromise = (async () => {
    try {
      const worktreeName = props.worktreePath.split('/').pop() || ''
      const res = await $fetch<{ aheadCount: number }>(`/api/commits/${encodeURIComponent(worktreeName)}`, {
        params: { workingDirectory: props.worktreePath },
      })
      commitCount.value = res.aheadCount
    } catch {
      commitCount.value = null
    }
  })()

  const branchesPromise = (async () => {
    branchesLoading.value = true
    try {
      const res = await $fetch<{ branches: Array<{ name: string; isRemote: boolean }> }>('/api/git/branches')
      branches.value = res.branches
        .filter(b => !b.isRemote && !b.name.startsWith('br/') && !b.name.startsWith('br/p-'))
        .map(b => b.name)

      // If the stored baseBranch was filtered out (e.g. a br/conv-xxx branch),
      // reset targetBranch to a valid branch from the list
      if (branches.value.length > 0 && !branches.value.includes(targetBranch.value)) {
        targetBranch.value = branches.value.includes('main')
          ? 'main'
          : branches.value.includes('master')
            ? 'master'
            : branches.value[0]
      }
    } catch {
      branches.value = []
    } finally {
      branchesLoading.value = false
    }
  })()

  await Promise.all([commitCountPromise, branchesPromise])
})

function handleConfirm() {
  if (!commitMessage.value.trim()) return
  loading.value = true
  emit('confirm', commitMessage.value.trim(), targetBranch.value)
}
</script>

<template>
  <div class="px-4 py-3 border-b border-retro-border bg-retro-dark/80 space-y-3">
    <div class="flex items-center justify-between">
      <span class="text-xs font-mono text-retro-text font-semibold uppercase tracking-wide">
        Finalize
      </span>
      <button
        type="button"
        class="p-0.5 text-retro-muted hover:text-retro-text transition-colors"
        title="Cancel"
        @click="emit('cancel')"
      >
        <XMarkIcon class="w-4 h-4" />
      </button>
    </div>

    <!-- Info -->
    <div class="space-y-1 text-xs font-mono">
      <div class="flex items-center gap-2">
        <span class="text-retro-muted">target:</span>
        <div class="relative">
          <select
            v-model="targetBranch"
            :disabled="loading || branchesLoading"
            class="appearance-none bg-retro-black border border-retro-border rounded px-2 py-0.5 pr-6 text-xs font-mono text-retro-cyan focus:outline-none focus:border-retro-cyan cursor-pointer disabled:opacity-40"
          >
            <option v-if="branchesLoading" :value="baseBranch">{{ baseBranch }}</option>
            <option
              v-for="branch in branches"
              :key="branch"
              :value="branch"
            >
              {{ branch }}
            </option>
          </select>
          <ChevronUpDownIcon class="absolute right-1 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-retro-muted pointer-events-none" />
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-retro-muted">commits:</span>
        <span class="text-retro-text">
          {{ commitCount !== null ? commitCount : '...' }}
        </span>
      </div>
    </div>

    <!-- Commit message -->
    <div class="relative">
      <textarea
        v-model="commitMessage"
        placeholder="Squash commit message..."
        rows="2"
        class="w-full px-2 py-1.5 pr-8 text-xs font-mono bg-retro-black border border-retro-border rounded text-retro-text placeholder-retro-subtle focus:outline-none focus:border-retro-cyan resize-none"
        :disabled="loading || generating"
      />
      <button
        type="button"
        :disabled="loading || generating"
        class="absolute right-1.5 top-1.5 p-0.5 rounded text-retro-muted hover:text-retro-cyan transition-colors disabled:opacity-40"
        title="Generate commit message"
        @click="generateMessage"
      >
        <SparklesIcon class="w-4 h-4" :class="{ 'animate-spin': generating }" />
      </button>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        :disabled="!commitMessage.trim() || loading"
        class="flex items-center gap-1 px-3 py-1 text-xs font-mono rounded border transition-colors
          bg-retro-green/10 border-retro-green/50 text-retro-green
          hover:bg-retro-green/20 disabled:opacity-40 disabled:cursor-not-allowed"
        @click="handleConfirm"
      >
        <CheckIcon class="w-3.5 h-3.5" />
        {{ loading ? 'Finalizing...' : 'Confirm' }}
      </button>
      <button
        type="button"
        :disabled="loading"
        class="px-3 py-1 text-xs font-mono rounded border border-retro-border text-retro-muted
          hover:text-retro-text hover:border-retro-text/30 transition-colors disabled:opacity-40"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </div>
</template>
