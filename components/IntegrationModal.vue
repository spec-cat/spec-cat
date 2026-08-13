<script setup lang="ts">
import type { SessionListItem } from '~/server/utils/session-store'
import type { SessionOptions } from '~/types/app'

defineProps<{
  open: boolean
  mode: 'rebase' | 'finalize' | 'squash'
  activeSession: SessionListItem | undefined
  sessionOptions: SessionOptions
  running: boolean
  error: string
  previewError: string
  generatingCommitMessage: boolean
  commitQueryScreen: string
  themeVars: Record<string, string>
}>()

const baseBranch = defineModel<string>('baseBranch', { required: true })
const commitMessage = defineModel<string>('commitMessage', { required: true })

defineEmits<{
  close: []
  run: []
  generateCommitMessage: []
}>()

const baseBranchEl = ref<HTMLSelectElement | null>(null)

defineExpose({
  focusBaseBranch: () => baseBranchEl.value?.focus()
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
    :style="themeVars"
  >
    <form
      class="flex max-h-[85vh] w-full max-w-2xl flex-col border border-[var(--rg-border)] bg-[var(--rg-editor)] text-xs text-[var(--rg-foreground)] shadow-2xl"
      @submit.prevent="$emit('run')"
    >
      <div class="flex h-10 items-center justify-between border-b border-[var(--rg-border)] px-4 text-xs font-bold uppercase">
        <span>{{ mode === 'finalize' ? 'Finalize Conversation' : mode === 'squash' ? 'Squash Worktree' : 'Rebase Worktree' }}</span>
        <button type="button" class="text-lg text-[var(--rg-muted)] hover:text-white" @click="$emit('close')">×</button>
      </div>
      <div class="grid min-h-0 gap-4 overflow-y-auto p-4 font-mono text-xs">
        <div class="grid grid-cols-[90px_minmax(0,1fr)] gap-2 text-[var(--rg-muted)]">
          <span>worktree</span><span class="truncate text-[var(--rg-accent)]">{{ activeSession?.worktreeBranch }}</span>
          <span>current base</span><span>{{ activeSession?.baseBranch }}</span>
        </div>
        <label class="grid gap-1.5">
          <span class="text-[var(--rg-muted)]">Target Base Branch</span>
          <select ref="baseBranchEl" v-model="baseBranch" class="h-9 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 outline-none focus:border-[var(--rg-accent)]">
            <option v-for="branch in sessionOptions.branches" :key="branch" :value="branch">{{ branch }}</option>
          </select>
        </label>
        <label v-if="mode === 'finalize'" class="grid gap-1.5">
          <span class="flex items-center justify-between gap-2">
            <span class="text-[var(--rg-muted)]">Squash Commit Message</span>
            <button
              type="button"
              class="shrink-0 border border-[var(--rg-border)] px-2 py-0.5 text-[10px] font-bold text-[var(--rg-foreground)] hover:border-[var(--rg-accent)] disabled:opacity-40"
              :disabled="generatingCommitMessage || running"
              title="Draft the message from the merge-base diff using the conversation's provider"
              @click="$emit('generateCommitMessage')"
            >
              {{ generatingCommitMessage ? 'Generating...' : 'AI Generate' }}
            </button>
          </span>
          <textarea v-model="commitMessage" rows="8" class="border border-[var(--rg-border)] bg-[var(--rg-input)] p-3 outline-none focus:border-[var(--rg-accent)]" :disabled="generatingCommitMessage" />
        </label>
        <div v-if="generatingCommitMessage || commitQueryScreen" class="grid gap-1.5">
          <span class="text-[var(--rg-muted)]">Provider terminal (live)</span>
          <pre class="max-h-72 overflow-auto whitespace-pre border border-[var(--rg-border)] bg-black/50 p-3 text-[10px] leading-4 text-[var(--rg-foreground)]">{{ commitQueryScreen || 'Starting the provider CLI...' }}</pre>
        </div>
        <p v-if="previewError" class="whitespace-pre-wrap text-[#f03e5f]">{{ previewError }}</p>
        <p v-if="error" class="whitespace-pre-wrap text-[#f03e5f]">{{ error }}</p>
        <p v-else-if="mode === 'finalize'" class="text-[var(--rg-muted)]">Commits will be rebased and squashed, the target branch will be fast-forwarded, then the tmux session and worktree will be removed.</p>
        <p v-else-if="mode === 'squash'" class="text-[var(--rg-muted)]">Commits will be rebased onto the target base branch, then rewritten as one temporary commit. The conversation stays active.</p>
        <p v-else class="text-[var(--rg-muted)]">The worktree remains active after rebase so the conversation can continue.</p>
      </div>
      <div class="flex justify-end gap-2 border-t border-[var(--rg-border)] p-3">
        <button type="button" class="border border-[var(--rg-border)] px-3 py-1.5" :disabled="running" @click="$emit('close')">Cancel</button>
        <button
          type="submit"
          class="bg-[var(--rg-button)] px-4 py-1.5 font-bold text-white disabled:opacity-40"
          :disabled="running || !baseBranch || (mode === 'finalize' && !commitMessage.trim())"
        >
          {{ running ? 'Working...' : mode === 'finalize' ? 'Finalize' : mode === 'squash' ? 'Squash' : 'Rebase' }}
        </button>
      </div>
    </form>
  </div>
</template>
