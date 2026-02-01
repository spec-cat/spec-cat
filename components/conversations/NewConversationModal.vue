<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronUpDownIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import type { BranchResponse } from '~/types/git'

const props = defineProps<{
  show: boolean
  creating?: boolean
}>()

const emit = defineEmits<{
  close: []
  create: [baseBranch: string]
}>()

const branches = ref<string[]>([])
const selectedBranch = ref('')
const loading = ref(false)
const error = ref('')

const canCreate = computed(() =>
  !loading.value &&
  !props.creating &&
  selectedBranch.value.length > 0 &&
  branches.value.length > 0
)

async function loadBranches() {
  loading.value = true
  error.value = ''
  try {
    const res = await $fetch<BranchResponse>('/api/git/branches')
    const localBranches = res.branches
      .filter(b => !b.isRemote && !b.name.startsWith('br/') && !b.name.startsWith('br/p-'))
      .map(b => b.name)

    branches.value = localBranches
    if (!localBranches.length) {
      selectedBranch.value = ''
      error.value = 'No local branches available for chat creation.'
      return
    }

    const preferred =
      (res.current && localBranches.includes(res.current) ? res.current : '') ||
      (localBranches.includes('main') ? 'main' : '') ||
      (localBranches.includes('master') ? 'master' : '') ||
      localBranches[0]

    selectedBranch.value = preferred
  } catch (e) {
    branches.value = []
    selectedBranch.value = ''
    error.value = e instanceof Error ? e.message : 'Failed to load branches'
  } finally {
    loading.value = false
  }
}

watch(() => props.show, (show) => {
  if (show) {
    loadBranches()
  }
})

function handleCreate() {
  if (!canCreate.value) return
  emit('create', selectedBranch.value)
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        @click.self="emit('close')"
      >
        <div class="w-full max-w-md mx-4 bg-retro-dark border border-retro-border rounded-lg shadow-xl">
          <div class="px-4 py-3 border-b border-retro-border flex items-center justify-between">
            <h3 class="text-sm font-mono text-retro-text font-semibold">New Conversation</h3>
            <button
              type="button"
              class="p-1 text-retro-muted hover:text-retro-text transition-colors"
              :disabled="creating"
              @click="emit('close')"
            >
              <XMarkIcon class="w-4 h-4" />
            </button>
          </div>

          <div class="px-4 py-4 space-y-3">
            <label class="block text-xs font-mono text-retro-muted">Base Branch</label>
            <div class="relative">
              <select
                v-model="selectedBranch"
                :disabled="loading || creating || branches.length === 0"
                class="w-full appearance-none bg-retro-black border border-retro-border rounded px-2 py-1.5 pr-7 text-xs font-mono text-retro-cyan focus:outline-none focus:border-retro-cyan disabled:opacity-40"
              >
                <option v-if="loading" value="">Loading branches...</option>
                <option
                  v-for="branch in branches"
                  :key="branch"
                  :value="branch"
                >
                  {{ branch }}
                </option>
              </select>
              <ChevronUpDownIcon class="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-retro-muted pointer-events-none" />
            </div>

            <p v-if="error" class="text-xs font-mono text-retro-red">{{ error }}</p>
            <p v-else class="text-xs font-mono text-retro-muted">
              The conversation worktree will be created from the selected branch.
            </p>
          </div>

          <div class="px-4 py-3 border-t border-retro-border flex items-center gap-2 justify-end">
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-mono rounded border border-retro-border text-retro-muted hover:text-retro-text hover:border-retro-text/30 transition-colors disabled:opacity-40"
              :disabled="creating"
              @click="emit('close')"
            >
              Cancel
            </button>
            <button
              type="button"
              :disabled="!canCreate"
              class="px-3 py-1.5 text-xs font-mono rounded border bg-retro-cyan/10 border-retro-cyan/50 text-retro-cyan hover:bg-retro-cyan/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              @click="handleCreate"
            >
              {{ creating ? 'Creating...' : 'Create' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
