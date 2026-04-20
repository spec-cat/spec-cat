<script setup lang="ts">
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import GitDialog from '~/components/git/GitDialog.vue'
import MergeDialog from '~/components/git/dialogs/MergeDialog.vue'
import DeleteBranchDialog from '~/components/git/dialogs/DeleteBranchDialog.vue'
import PushDialog from '~/components/git/dialogs/PushDialog.vue'
import PullDialog from '~/components/git/dialogs/PullDialog.vue'
import RebaseDialog from '~/components/git/dialogs/RebaseDialog.vue'
import CherryPickDialog from '~/components/git/dialogs/CherryPickDialog.vue'
import ResetDialog from '~/components/git/dialogs/ResetDialog.vue'
import TagCreateDialog from '~/components/git/dialogs/TagCreateDialog.vue'
import TagDeleteDialog from '~/components/git/dialogs/TagDeleteDialog.vue'
import TagDetailDialog from '~/components/git/dialogs/TagDetailDialog.vue'
import CreateBranchDialog from '~/components/git/dialogs/CreateBranchDialog.vue'
import StashDialog from '~/components/git/dialogs/StashDialog.vue'
import ResetWorkingDialog from '~/components/git/dialogs/ResetWorkingDialog.vue'
import CleanUntrackedDialog from '~/components/git/dialogs/CleanUntrackedDialog.vue'
import type { useGitDialogs } from '~/composables/useGitDialogs'
import type { useGitGraphStore } from '~/stores/gitGraph'

type Dialogs = ReturnType<typeof useGitDialogs>
type Store = ReturnType<typeof useGitGraphStore>

const props = defineProps<{
  dialogs: Dialogs
  store: Store
  remoteNames: string[]
  copyFeedback: { visible: boolean; x: number; y: number }
}>()

// Destructure dialog refs into top-level bindings so Vue's template auto-unwrap
// resolves `checkoutDialog.visible` to `checkoutDialog.value.visible`. Accessing
// refs through an intermediate plain object (e.g. `d.checkoutDialog.visible`)
// does not auto-unwrap and silently reads `undefined`.
const {
  checkoutDialog, confirmCheckout,
  createBranchDialog, confirmCreateBranch,
  deleteBranchDialog, confirmDeleteBranch,
  renameDialog, confirmRenameBranch,
  mergeDialog, confirmMerge,
  rebaseDialog, confirmRebase,
  pushDialog, confirmPush,
  pullDialog, confirmPull,
  cherryPickDialog, confirmCherryPick,
  resetDialog, confirmReset,
  tagCreateDialog, confirmTagCreate,
  tagDeleteDialog, confirmTagDelete,
  tagDetailDialog,
  stashDialog, confirmStash,
  stashBranchDialog, stashBranchInput, confirmStashBranch,
  resetWorkingDialog, confirmResetWorking,
  cleanUntrackedDialog, confirmCleanUntracked,
} = props.dialogs
</script>

<template>
  <!-- Checkout Dialog -->
  <GitDialog
    v-if="checkoutDialog.visible"
    title="Checkout"
    :visible="checkoutDialog.visible"
    :loading="checkoutDialog.loading"
    :error="checkoutDialog.error"
    confirmLabel="Checkout"
    @close="checkoutDialog.visible = false"
    @confirm="confirmCheckout"
  >
    <p class="text-retro-muted text-sm">
      Are you sure you want to checkout
      <span class="text-retro-cyan font-mono">{{ checkoutDialog.branchName }}</span>?
    </p>
  </GitDialog>

  <!-- Rename Branch Dialog -->
  <GitDialog
    v-if="renameDialog.visible"
    title="Rename Branch"
    :visible="renameDialog.visible"
    :loading="renameDialog.loading"
    :error="renameDialog.error"
    confirmLabel="Rename"
    @close="renameDialog.visible = false"
    @confirm="confirmRenameBranch"
  >
    <div class="space-y-3">
      <p class="text-retro-muted text-sm">
        Rename <span class="text-retro-cyan font-mono">{{ renameDialog.branchName }}</span>
      </p>
      <input
        v-model="renameDialog.newName"
        type="text"
        class="w-full px-3 py-2 text-sm bg-retro-panel border border-retro-border rounded text-retro-text placeholder-retro-muted focus:outline-none focus:border-retro-cyan"
        placeholder="New branch name"
        @keyup.enter="confirmRenameBranch"
      />
    </div>
  </GitDialog>

  <!-- Merge Dialog (FR-026) -->
  <MergeDialog
    v-if="mergeDialog.visible"
    :visible="mergeDialog.visible"
    :branchName="mergeDialog.branchName"
    :loading="mergeDialog.loading"
    :error="mergeDialog.error"
    @close="mergeDialog.visible = false"
    @confirm="confirmMerge"
  />

  <!-- Delete Branch Dialog (FR-025) -->
  <DeleteBranchDialog
    v-if="deleteBranchDialog.visible"
    :visible="deleteBranchDialog.visible"
    :branchName="deleteBranchDialog.branchName"
    :isLocal="deleteBranchDialog.isLocal"
    :loading="deleteBranchDialog.loading"
    :error="deleteBranchDialog.error"
    @close="deleteBranchDialog.visible = false"
    @confirm="confirmDeleteBranch"
  />

  <!-- Push Dialog (FR-028) -->
  <PushDialog
    v-if="pushDialog.visible"
    :visible="pushDialog.visible"
    :branchName="pushDialog.branchName"
    :remotes="remoteNames"
    :loading="pushDialog.loading"
    :error="pushDialog.error"
    @close="pushDialog.visible = false"
    @confirm="confirmPush"
  />

  <!-- Pull Dialog (FR-029) -->
  <PullDialog
    v-if="pullDialog.visible"
    :visible="pullDialog.visible"
    :branchName="pullDialog.branchName"
    :remotes="remoteNames"
    :loading="pullDialog.loading"
    :error="pullDialog.error"
    @close="pullDialog.visible = false"
    @confirm="confirmPull"
  />

  <!-- Rebase Dialog (FR-027) -->
  <RebaseDialog
    v-if="rebaseDialog.visible"
    :visible="rebaseDialog.visible"
    :branchName="store.currentBranch?.name || 'HEAD'"
    :ontoBranch="rebaseDialog.branchName"
    :loading="rebaseDialog.loading"
    :error="rebaseDialog.error"
    @close="rebaseDialog.visible = false"
    @confirm="confirmRebase"
  />

  <!-- Cherry Pick Dialog (FR-034) -->
  <CherryPickDialog
    v-if="cherryPickDialog.visible"
    :visible="cherryPickDialog.visible"
    :commitHash="cherryPickDialog.commitHash"
    :commitMessage="cherryPickDialog.commitMessage"
    :loading="cherryPickDialog.loading"
    :error="cherryPickDialog.error"
    @close="cherryPickDialog.visible = false"
    @confirm="confirmCherryPick"
  />

  <!-- Reset Dialog (FR-037) -->
  <ResetDialog
    v-if="resetDialog.visible"
    :visible="resetDialog.visible"
    :commitHash="resetDialog.commitHash"
    :commitMessage="resetDialog.commitMessage"
    :loading="resetDialog.loading"
    :error="resetDialog.error"
    @close="resetDialog.visible = false"
    @confirm="confirmReset"
  />

  <!-- Tag Create Dialog (FR-040) -->
  <TagCreateDialog
    v-if="tagCreateDialog.visible"
    :visible="tagCreateDialog.visible"
    :commitHash="tagCreateDialog.commitHash"
    :remotes="remoteNames"
    :loading="tagCreateDialog.loading"
    :error="tagCreateDialog.error"
    @close="tagCreateDialog.visible = false"
    @confirm="confirmTagCreate"
  />

  <!-- Tag Delete Dialog (FR-041) -->
  <TagDeleteDialog
    v-if="tagDeleteDialog.visible"
    :visible="tagDeleteDialog.visible"
    :tagName="tagDeleteDialog.tagName"
    :remotes="remoteNames"
    :loading="tagDeleteDialog.loading"
    :error="tagDeleteDialog.error"
    @close="tagDeleteDialog.visible = false"
    @confirm="confirmTagDelete"
  />

  <!-- Tag Detail Dialog (FR-043) -->
  <TagDetailDialog
    v-if="tagDetailDialog.visible"
    :visible="tagDetailDialog.visible"
    :tagName="tagDetailDialog.tagName"
    :tagDetail="tagDetailDialog.tagDetail"
    :loading="tagDetailDialog.loading"
    @close="tagDetailDialog.visible = false"
  />

  <!-- Create Branch Dialog (FR-031) -->
  <CreateBranchDialog
    v-if="createBranchDialog.visible"
    :visible="createBranchDialog.visible"
    :fromCommit="createBranchDialog.fromCommit"
    :loading="createBranchDialog.loading"
    :error="createBranchDialog.error"
    @close="createBranchDialog.visible = false"
    @confirm="confirmCreateBranch"
  />

  <!-- Stash Branch Dialog (FR-049) -->
  <GitDialog
    v-if="stashBranchDialog.visible"
    title="Create Branch from Stash"
    :visible="stashBranchDialog.visible"
    :loading="stashBranchDialog.loading"
    :error="stashBranchDialog.error"
    confirmLabel="Create Branch"
    @close="stashBranchDialog.visible = false"
    @confirm="confirmStashBranch(stashBranchInput)"
  >
    <div class="space-y-3">
      <p class="text-retro-muted text-sm">
        Create a new branch from <span class="text-retro-magenta font-mono">stash@{{'{'}}{{ stashBranchDialog.stashIndex }}{{'}'}}</span>
      </p>
      <input
        v-model="stashBranchInput"
        type="text"
        class="w-full px-3 py-2 text-sm bg-retro-panel border border-retro-border rounded text-retro-text placeholder-retro-muted focus:outline-none focus:border-retro-cyan"
        placeholder="Branch name"
        @keyup.enter="confirmStashBranch(stashBranchInput)"
      />
    </div>
  </GitDialog>

  <!-- Stash Dialog (FR-050) -->
  <StashDialog
    v-if="stashDialog.visible"
    :visible="stashDialog.visible"
    :loading="stashDialog.loading"
    :error="stashDialog.error"
    @close="stashDialog.visible = false"
    @confirm="confirmStash"
  />

  <!-- Reset Working Dialog (FR-057) -->
  <ResetWorkingDialog
    v-if="resetWorkingDialog.visible"
    :visible="resetWorkingDialog.visible"
    :loading="resetWorkingDialog.loading"
    :error="resetWorkingDialog.error"
    @close="resetWorkingDialog.visible = false"
    @confirm="confirmResetWorking"
  />

  <CleanUntrackedDialog
    v-if="cleanUntrackedDialog.visible"
    :visible="cleanUntrackedDialog.visible"
    :loading="cleanUntrackedDialog.loading"
    :error="cleanUntrackedDialog.error"
    @close="cleanUntrackedDialog.visible = false"
    @confirm="confirmCleanUntracked"
  />

  <!-- Copy Feedback Toast -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="copyFeedback.visible"
        class="fixed z-50 px-3 py-1.5 text-sm bg-retro-green text-retro-dark rounded shadow-lg"
        :style="{ left: `${copyFeedback.x}px`, top: `${copyFeedback.y - 40}px` }"
      >
        Copied!
      </div>
    </Transition>
  </Teleport>

  <!-- Operation Error Toast -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="store.operationError"
        class="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 text-sm bg-retro-red/90 text-white rounded-lg shadow-lg max-w-sm"
        role="alert"
      >
        <ExclamationTriangleIcon class="w-4 h-4 flex-shrink-0" />
        <span class="flex-1">{{ store.operationError }}</span>
        <button
          class="flex-shrink-0 p-0.5 hover:bg-white/20 rounded transition-colors"
          @click="store.clearOperationError()"
          aria-label="Dismiss error"
        >
          <XMarkIcon class="w-3.5 h-3.5" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
