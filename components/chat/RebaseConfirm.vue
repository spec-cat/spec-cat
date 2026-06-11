<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { CheckIcon, XMarkIcon, ChevronUpDownIcon } from '@heroicons/vue/24/outline'
import {
  getSelectableBaseBranchNameFromBranch,
  getSelectableBaseBranchLabel,
  isSelectableBaseBranchName,
  resolveSelectableBaseBranch,
} from '~/utils/baseBranchSelection'

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
const targetBranch = ref(isSelectableBaseBranchName(props.baseBranch) ? props.baseBranch : '')
const branches = ref<string[]>([])
const branchesLoading = ref(false)
const loadingTargetLabel = computed(() => getSelectableBaseBranchLabel(targetBranch.value || props.baseBranch))

let commitCountSeq = 0
async function fetchCommitCount(targetBranchName: string) {
  if (!targetBranchName) {
    commitCountSeq++
    commitCount.value = null
    return
  }
  const seq = ++commitCountSeq
  try {
    const res = await $fetch<{ ahead: number; behind: number }>('/api/chat/compare', {
      params: {
        worktreePath: props.worktreePath,
        baseBranch: targetBranchName,
      },
    })
    // Ignore responses for a branch that is no longer selected.
    if (seq !== commitCountSeq) return
    commitCount.value = res.ahead
  } catch {
    if (seq !== commitCountSeq) return
    commitCount.value = null
  }
}

onMounted(async () => {
  // Fetch commit count and branches in parallel
  const commitCountPromise = fetchCommitCount(targetBranch.value)

  const branchesPromise = (async () => {
    branchesLoading.value = true
    try {
      const branchQueryCwd = props.worktreePath || (await $fetch<{ cwd: string }>('/api/cwd')).cwd
      const res = await $fetch<{ branches: Array<{ name: string; isRemote: boolean }> }>('/api/git/branches', {
        query: { workingDirectory: branchQueryCwd }
      })
      branches.value = res.branches
        .filter(b => !b.isRemote && !b.name.startsWith('sc/'))
        .map(getSelectableBaseBranchNameFromBranch)
        .filter((branch): branch is string => !!branch)

      const resolvedBranch = resolveSelectableBaseBranch(targetBranch.value || props.baseBranch, branches.value)
      if (resolvedBranch) {
        targetBranch.value = resolvedBranch
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
  if (!targetBranch.value) return
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
            <option v-if="branchesLoading" :value="targetBranch">
              {{ loadingTargetLabel }}
            </option>
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
        :disabled="loading || !targetBranch"
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
