<script setup lang="ts">
import type { GitContextMenu } from '~/types/app'
import { stashName } from '~/utils/app-formatters'

defineProps<{
  menu: GitContextMenu | null
  selectedCommitHash: string
  isRemoteBranch: (branch: string) => boolean
}>()

defineEmits<{
  close: []
  checkoutRef: [value: string]
  createBranchFrom: [hash: string]
  renameBranch: [branch: string]
  deleteBranch: [branch: string, remote: boolean]
  mergeRef: [value: string]
  rebaseOnto: [value: string]
  pushBranch: [branch: string]
  pullBranch: [branch: string]
  fetchBranch: [branch?: string]
  copyText: [value: string]
  addTag: [hash: string]
  cherryPickCommit: [hash: string]
  revertCommit: [hash: string]
  resetToCommit: [hash: string]
  compareWithSelected: [hash: string]
  pushTag: [tag: string]
  deleteTag: [tag: string]
  applyStash: [index: number]
  popStash: [index: number]
  createBranchFromStash: [index: number]
  dropStash: [index: number]
  selectUncommittedChanges: []
  stashWorkingTree: []
  resetWorkingTree: []
  cleanUntracked: []
}>()

const menuEl = ref<HTMLElement | null>(null)

defineExpose({
  focus: () => menuEl.value?.focus()
})
</script>

<template>
  <div
    v-if="menu"
    ref="menuEl"
    class="fixed z-50 min-w-[220px] border border-[var(--rg-border)] bg-[var(--rg-input)] py-1 text-[12px] text-[var(--rg-foreground)] shadow-2xl"
    :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
    role="menu"
    tabindex="-1"
    aria-label="Git actions"
    @click.stop
    @contextmenu.prevent.stop
    @keydown.esc.stop="$emit('close')"
  >
    <template v-if="menu.type === 'branch'">
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('checkoutRef', menu.branch)">Checkout</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('createBranchFrom', menu.commit.hash)">Create Branch from Here</button>
      <button v-if="!isRemoteBranch(menu.branch)" class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('renameBranch', menu.branch)">Rename</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('deleteBranch', menu.branch, isRemoteBranch(menu.branch))">Delete</button>
      <div class="my-1 border-t border-[var(--rg-border)]" />
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('mergeRef', menu.branch)">Merge into Current</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('rebaseOnto', menu.branch)">Rebase Current Onto</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('pushBranch', menu.branch)">Push</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('pullBranch', menu.branch)">Pull</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('fetchBranch', menu.branch)">Fetch</button>
      <div class="my-1 border-t border-[var(--rg-border)]" />
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('copyText', menu.branch)">Copy Branch Name</button>
    </template>

    <template v-else-if="menu.type === 'commit'">
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('addTag', menu.commit.hash)">Add Tag</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('createBranchFrom', menu.commit.hash)">Create Branch</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('checkoutRef', menu.commit.hash)">Checkout</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('cherryPickCommit', menu.commit.hash)">Cherry Pick</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('revertCommit', menu.commit.hash)">Revert</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('mergeRef', menu.commit.hash)">Merge into Current</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('rebaseOnto', menu.commit.hash)">Rebase Current Onto This Commit</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('resetToCommit', menu.commit.hash)">Reset Current Branch to This Commit</button>
      <button
        v-if="selectedCommitHash && selectedCommitHash !== menu.commit.hash"
        class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]"
        @click.stop="$emit('compareWithSelected', menu.commit.hash)"
      >
        Compare with Selected Commit
      </button>
      <div class="my-1 border-t border-[var(--rg-border)]" />
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('copyText', menu.commit.hash)">Copy Commit Hash</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('copyText', menu.commit.subject)">Copy Commit Subject</button>
    </template>

    <template v-else-if="menu.type === 'tag'">
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('copyText', menu.tag)">Copy Tag Name</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('pushTag', menu.tag)">Push Tag</button>
      <button class="block w-full px-3 py-1.5 text-left text-[#f03e5f] hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('deleteTag', menu.tag)">Delete Tag</button>
    </template>

    <template v-else-if="menu.type === 'stash'">
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('applyStash', menu.stash.index)">Apply</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('popStash', menu.stash.index)">Pop</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('createBranchFromStash', menu.stash.index)">Create Branch from Stash</button>
      <div class="my-1 border-t border-[var(--rg-border)]" />
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('copyText', stashName(menu.stash.index))">Copy Stash Name</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('copyText', menu.stash.hash)">Copy Stash Hash</button>
      <button class="block w-full px-3 py-1.5 text-left text-[#f03e5f] hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('dropStash', menu.stash.index)">Drop</button>
    </template>

    <template v-else>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('selectUncommittedChanges'); $emit('close')">Open Changes and Commit</button>
      <div class="my-1 border-t border-[var(--rg-border)]" />
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('fetchBranch')">Fetch All</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('stashWorkingTree')">Stash Uncommitted Changes</button>
      <button class="block w-full px-3 py-1.5 text-left hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('resetWorkingTree')">Reset Working Tree</button>
      <button class="block w-full px-3 py-1.5 text-left text-[#f03e5f] hover:bg-[var(--rg-editor-group)]" @click.stop="$emit('cleanUntracked')">Clean Untracked Files</button>
    </template>
  </div>
</template>
