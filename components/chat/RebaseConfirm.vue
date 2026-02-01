<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { CheckIcon, XMarkIcon, ChevronUpDownIcon } from '@heroicons/vue/24/outline'

interface Props {
  baseBranch: string
  worktreeBranch: string
  worktreePath: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  confirm: [targetBranch: string]
  cancel: []
}>()

const commitCount = ref<number | null>(null)
const loading = ref(false)
const targetBranch = ref(props.baseBranch)
const branches = ref<string[]>([])
const branchesLoading = ref(false)

async function fetchCommitCount(targetBranchName: string) {
  try {
    const res = await $fetch<{ ahead: number; behind: number }>('/api/chat/compare', {
      params: {
        worktreePath: props.worktreePath,
        baseBranch: targetBranchName,
      },
    })
    commitCount.value = res.ahead
  } catch {
    commitCount.value = null
  }
}

onMounted(async () => {
  // Fetch commit count and branches in parallel
  const commitCountPromise = fetchCommitCount(targetBranch.value)

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

// Update commit count when target branch changes
watch(targetBranch, (newBranch) => {
  fetchCommitCount(newBranch)
})

function handleConfirm() {
  loading.value = true
  emit('confirm', targetBranch.value)
}
</script>

<template>
  <div class="px-4 py-3 border-b border-retro-border bg-retro-dark/80 space-y-3">
    <div class="flex items-center justify-between">
      <span class="text-xs font-mono text-retro-text font-semibold uppercase tracking-wide">
        Rebase Worktree
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
        <span class="text-retro-muted">worktree:</span>
        <span class="text-retro-cyan">{{ worktreeBranch }}</span>
      </div>
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
        <span class="text-retro-muted">commits ahead:</span>
        <span class="text-retro-text">
          {{ commitCount !== null ? commitCount : '...' }}
        </span>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        :disabled="loading"
        class="flex items-center gap-1 px-3 py-1 text-xs font-mono rounded border transition-colors
          bg-retro-cyan/10 border-retro-cyan/50 text-retro-cyan
          hover:bg-retro-cyan/20 disabled:opacity-40 disabled:cursor-not-allowed"
        @click="handleConfirm"
      >
        <CheckIcon class="w-3.5 h-3.5" />
        {{ loading ? 'Rebasing...' : 'Confirm' }}
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
