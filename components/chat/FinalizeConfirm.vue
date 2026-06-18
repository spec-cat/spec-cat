<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { CheckIcon, XMarkIcon, SparklesIcon, ChevronUpDownIcon, StopCircleIcon } from '@heroicons/vue/24/outline'
import LiveTerminalView from './LiveTerminalView.vue'
import {
  getSelectableBaseBranchNameFromBranch,
  getSelectableBaseBranchLabel,
  isSelectableBaseBranchName,
  resolveSelectableBaseBranch,
} from '~/utils/baseBranchSelection'

interface Props {
  conversationId: string
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
const generateStatus = ref<'idle' | 'running' | 'done' | 'error' | 'aborted'>('idle')
const generateError = ref('')
const generateAbortController = ref<AbortController | null>(null)
const previewSessionId = ref('')
const targetBranch = ref(isSelectableBaseBranchName(props.baseBranch) ? props.baseBranch : '')
const branches = ref<string[]>([])
const branchesLoading = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const loadingTargetLabel = computed(() => getSelectableBaseBranchLabel(targetBranch.value || props.baseBranch))

async function generateMessage() {
  if (generating.value) return
  generating.value = true
  generateStatus.value = 'running'
  generateError.value = ''
  // Unique per run so the live viewer and the server PTY share one id without
  // colliding with a prior (possibly still-disposing) generation.
  previewSessionId.value = `commitgen:${props.conversationId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const controller = new AbortController()
  generateAbortController.value = controller
  try {
    const res = await $fetch<{ success: boolean; message?: string; error?: string }>('/api/chat/generate-commit-message', {
      method: 'POST',
      signal: controller.signal,
      body: {
        conversationId: props.conversationId,
        worktreePath: props.worktreePath,
        worktreeBranch: props.worktreeBranch,
        baseBranch: targetBranch.value || props.baseBranch,
        previewSessionId: previewSessionId.value,
      },
    })
    if (res.success && res.message) {
      commitMessage.value = res.message
      generateStatus.value = 'done'
    } else {
      generateStatus.value = 'error'
      generateError.value = res.error || 'Failed to generate commit message'
    }
  } catch (err) {
    if (controller.signal.aborted) {
      generateStatus.value = 'aborted'
    } else {
      generateStatus.value = 'error'
      generateError.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    generating.value = false
    if (generateAbortController.value === controller) {
      generateAbortController.value = null
    }
  }
}

function abortGenerateMessage() {
  generateAbortController.value?.abort()
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
  nextTick(() => textareaRef.value?.focus())
})

function handleConfirm() {
  if (!commitMessage.value.trim() || !targetBranch.value) return
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
        <span class="text-retro-muted">commits:</span>
        <span class="text-retro-text">
          {{ commitCount !== null ? commitCount : '...' }}
        </span>
      </div>
    </div>

    <!-- Commit message -->
    <div class="relative">
      <textarea
        ref="textareaRef"
        v-model="commitMessage"
        placeholder="Squash commit message..."
        rows="2"
        class="w-full px-2 py-1.5 pr-8 text-xs font-mono bg-retro-black border border-retro-border rounded text-retro-text placeholder-retro-subtle focus:outline-none focus:border-retro-cyan resize-none"
        :disabled="loading || generating"
      />
      <button
        type="button"
        :disabled="loading || generating || branchesLoading || !targetBranch"
        class="absolute right-1.5 top-1.5 p-0.5 rounded text-retro-muted hover:text-retro-cyan transition-colors disabled:opacity-40"
        title="Generate commit message"
        @click="generateMessage"
      >
        <SparklesIcon class="w-4 h-4" :class="{ 'animate-spin': generating }" />
      </button>
    </div>

    <div
      v-if="generateStatus !== 'idle'"
      class="flex items-center justify-between gap-3 rounded border border-retro-border bg-retro-black px-2 py-1.5 text-xs font-mono"
    >
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <SparklesIcon
            class="w-3.5 h-3.5 text-retro-cyan shrink-0"
            :class="{ 'animate-spin': generateStatus === 'running' }"
          />
          <span class="text-retro-text truncate">
            {{
              generateStatus === 'running'
                ? `Generating from ${targetBranch}...`
                : generateStatus === 'done'
                  ? 'Commit message generated'
                  : generateStatus === 'aborted'
                    ? 'Generation stopped'
                    : 'Generation failed'
            }}
          </span>
        </div>
        <div v-if="generateError" class="mt-0.5 text-retro-red truncate">
          {{ generateError }}
        </div>
      </div>
      <button
        v-if="generateStatus === 'running'"
        type="button"
        class="shrink-0 p-0.5 rounded text-retro-muted hover:text-retro-red transition-colors"
        title="Stop generation"
        @click="abortGenerateMessage"
      >
        <StopCircleIcon class="w-4 h-4" />
      </button>
    </div>

    <!-- Live PTY preview while generating -->
    <div
      v-if="generateStatus === 'running' && previewSessionId"
      class="h-48 rounded border border-retro-border bg-retro-black overflow-hidden"
    >
      <LiveTerminalView :key="previewSessionId" :session-id="previewSessionId" />
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        :disabled="!commitMessage.trim() || !targetBranch || loading"
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
