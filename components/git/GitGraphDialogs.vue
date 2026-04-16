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

const d = props.dialogs
</script>

<template>
  <!-- Checkout Dialog -->
  <GitDialog
    v-if="d.checkoutDialog.visible"
    title="Checkout"
    :visible="d.checkoutDialog.visible"
    :loading="d.checkoutDialog.loading"
    :error="d.checkoutDialog.error"
    confirmLabel="Checkout"
    @close="d.checkoutDialog.visible = false"
    @confirm="d.confirmCheckout"
  >
    <p class="text-retro-muted text-sm">
      Are you sure you want to checkout
      <span class="text-retro-cyan font-mono">{{ d.checkoutDialog.branchName }}</span>?
    </p>
  </GitDialog>

  <!-- Rename Branch Dialog -->
  <GitDialog
    v-if="d.renameDialog.visible"
    title="Rename Branch"
    :visible="d.renameDialog.visible"
    :loading="d.renameDialog.loading"
    :error="d.renameDialog.error"
    confirmLabel="Rename"
    @close="d.renameDialog.visible = false"
    @confirm="d.confirmRenameBranch"
  >
    <div class="space-y-3">
      <p class="text-retro-muted text-sm">
        Rename <span class="text-retro-cyan font-mono">{{ d.renameDialog.branchName }}</span>
      </p>
      <input
        v-model="d.renameDialog.newName"
        type="text"
        class="w-full px-3 py-2 text-sm bg-retro-panel border border-retro-border rounded text-retro-text placeholder-retro-muted focus:outline-none focus:border-retro-cyan"
        placeholder="New branch name"
        @keyup.enter="d.confirmRenameBranch"
      />
    </div>
  </GitDialog>

  <!-- Merge Dialog (FR-026) -->
  <MergeDialog
    v-if="d.mergeDialog.visible"
    :visible="d.mergeDialog.visible"
    :branchName="d.mergeDialog.branchName"
    :loading="d.mergeDialog.loading"
    :error="d.mergeDialog.error"
    @close="d.mergeDialog.visible = false"
    @confirm="d.confirmMerge"
  />

  <!-- Delete Branch Dialog (FR-025) -->
  <DeleteBranchDialog
    v-if="d.deleteBranchDialog.visible"
    :visible="d.deleteBranchDialog.visible"
    :branchName="d.deleteBranchDialog.branchName"
    :isLocal="d.deleteBranchDialog.isLocal"
    :loading="d.deleteBranchDialog.loading"
    :error="d.deleteBranchDialog.error"
    @close="d.deleteBranchDialog.visible = false"
    @confirm="d.confirmDeleteBranch"
  />

  <!-- Push Dialog (FR-028) -->
  <PushDialog
    v-if="d.pushDialog.visible"
    :visible="d.pushDialog.visible"
    :branchName="d.pushDialog.branchName"
    :remotes="remoteNames"
    :loading="d.pushDialog.loading"
    :error="d.pushDialog.error"
    @close="d.pushDialog.visible = false"
    @confirm="d.confirmPush"
  />

  <!-- Pull Dialog (FR-029) -->
  <PullDialog
    v-if="d.pullDialog.visible"
    :visible="d.pullDialog.visible"
    :branchName="d.pullDialog.branchName"
    :remotes="remoteNames"
    :loading="d.pullDialog.loading"
    :error="d.pullDialog.error"
    @close="d.pullDialog.visible = false"
    @confirm="d.confirmPull"
  />

  <!-- Rebase Dialog (FR-027) -->
  <RebaseDialog
    v-if="d.rebaseDialog.visible"
    :visible="d.rebaseDialog.visible"
    :branchName="store.currentBranch?.name || 'HEAD'"
    :ontoBranch="d.rebaseDialog.branchName"
    :loading="d.rebaseDialog.loading"
    :error="d.rebaseDialog.error"
    @close="d.rebaseDialog.visible = false"
    @confirm="d.confirmRebase"
  />

  <!-- Cherry Pick Dialog (FR-034) -->
  <CherryPickDialog
    v-if="d.cherryPickDialog.visible"
    :visible="d.cherryPickDialog.visible"
    :commitHash="d.cherryPickDialog.commitHash"
    :commitMessage="d.cherryPickDialog.commitMessage"
    :loading="d.cherryPickDialog.loading"
    :error="d.cherryPickDialog.error"
    @close="d.cherryPickDialog.visible = false"
    @confirm="d.confirmCherryPick"
  />

  <!-- Reset Dialog (FR-037) -->
  <ResetDialog
    v-if="d.resetDialog.visible"
    :visible="d.resetDialog.visible"
    :commitHash="d.resetDialog.commitHash"
    :commitMessage="d.resetDialog.commitMessage"
    :loading="d.resetDialog.loading"
    :error="d.resetDialog.error"
    @close="d.resetDialog.visible = false"
    @confirm="d.confirmReset"
  />

  <!-- Tag Create Dialog (FR-040) -->
  <TagCreateDialog
    v-if="d.tagCreateDialog.visible"
    :visible="d.tagCreateDialog.visible"
    :commitHash="d.tagCreateDialog.commitHash"
    :remotes="remoteNames"
    :loading="d.tagCreateDialog.loading"
    :error="d.tagCreateDialog.error"
    @close="d.tagCreateDialog.visible = false"
    @confirm="d.confirmTagCreate"
  />

  <!-- Tag Delete Dialog (FR-041) -->
  <TagDeleteDialog
    v-if="d.tagDeleteDialog.visible"
    :visible="d.tagDeleteDialog.visible"
    :tagName="d.tagDeleteDialog.tagName"
    :remotes="remoteNames"
    :loading="d.tagDeleteDialog.loading"
    :error="d.tagDeleteDialog.error"
    @close="d.tagDeleteDialog.visible = false"
    @confirm="d.confirmTagDelete"
  />

  <!-- Tag Detail Dialog (FR-043) -->
  <TagDetailDialog
    v-if="d.tagDetailDialog.visible"
    :visible="d.tagDetailDialog.visible"
    :tagName="d.tagDetailDialog.tagName"
    :tagDetail="d.tagDetailDialog.tagDetail"
    :loading="d.tagDetailDialog.loading"
    @close="d.tagDetailDialog.visible = false"
  />

  <!-- Create Branch Dialog (FR-031) -->
  <CreateBranchDialog
    v-if="d.createBranchDialog.visible"
    :visible="d.createBranchDialog.visible"
    :fromCommit="d.createBranchDialog.fromCommit"
    :loading="d.createBranchDialog.loading"
    :error="d.createBranchDialog.error"
    @close="d.createBranchDialog.visible = false"
    @confirm="d.confirmCreateBranch"
  />

  <!-- Stash Branch Dialog (FR-049) -->
  <GitDialog
    v-if="d.stashBranchDialog.visible"
    title="Create Branch from Stash"
    :visible="d.stashBranchDialog.visible"
    :loading="d.stashBranchDialog.loading"
    :error="d.stashBranchDialog.error"
    confirmLabel="Create Branch"
    @close="d.stashBranchDialog.visible = false"
    @confirm="d.confirmStashBranch(d.stashBranchInput.value)"
  >
    <div class="space-y-3">
      <p class="text-retro-muted text-sm">
        Create a new branch from <span class="text-retro-magenta font-mono">stash@{{'{'}}{{ d.stashBranchDialog.stashIndex }}{{'}'}}</span>
      </p>
      <input
        v-model="d.stashBranchInput.value"
        type="text"
        class="w-full px-3 py-2 text-sm bg-retro-panel border border-retro-border rounded text-retro-text placeholder-retro-muted focus:outline-none focus:border-retro-cyan"
        placeholder="Branch name"
        @keyup.enter="d.confirmStashBranch(d.stashBranchInput.value)"
      />
    </div>
  </GitDialog>

  <!-- Stash Dialog (FR-050) -->
  <StashDialog
    v-if="d.stashDialog.visible"
    :visible="d.stashDialog.visible"
    :loading="d.stashDialog.loading"
    :error="d.stashDialog.error"
    @close="d.stashDialog.visible = false"
    @confirm="d.confirmStash"
  />

  <!-- Reset Working Dialog (FR-057) -->
  <ResetWorkingDialog
    v-if="d.resetWorkingDialog.visible"
    :visible="d.resetWorkingDialog.visible"
    :loading="d.resetWorkingDialog.loading"
    :error="d.resetWorkingDialog.error"
    @close="d.resetWorkingDialog.visible = false"
    @confirm="d.confirmResetWorking"
  />

  <CleanUntrackedDialog
    v-if="d.cleanUntrackedDialog.visible"
    :visible="d.cleanUntrackedDialog.visible"
    :loading="d.cleanUntrackedDialog.loading"
    :error="d.cleanUntrackedDialog.error"
    @close="d.cleanUntrackedDialog.visible = false"
    @confirm="d.confirmCleanUntracked"
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
