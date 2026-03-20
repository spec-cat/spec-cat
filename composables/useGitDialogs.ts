import { ref, computed } from "vue";
import type { GitTag } from "~/types/git";
import type { useGitGraphStore } from "~/stores/gitGraph";

export function useGitDialogs(store: ReturnType<typeof useGitGraphStore>) {
  // Checkout
  const checkoutDialog = ref<{ visible: boolean; branchName: string; loading: boolean; error: string | null }>({
    visible: false, branchName: "", loading: false, error: null,
  });

  async function confirmCheckout() {
    checkoutDialog.value.loading = true;
    checkoutDialog.value.error = null;
    const result = await store.checkoutBranch(checkoutDialog.value.branchName);
    checkoutDialog.value.loading = false;
    if (result.success) {
      checkoutDialog.value.visible = false;
    } else {
      checkoutDialog.value.error = result.error || "Unknown error";
    }
  }

  // Create Branch
  const createBranchDialog = ref<{ visible: boolean; fromCommit: string; loading: boolean; error: string | null }>({
    visible: false, fromCommit: "", loading: false, error: null,
  });

  async function confirmCreateBranch(options: { name: string; checkout: boolean }) {
    createBranchDialog.value.loading = true;
    createBranchDialog.value.error = null;
    const result = await store.createBranch(options.name, createBranchDialog.value.fromCommit);
    createBranchDialog.value.loading = false;
    if (result.success) {
      if (options.checkout) {
        await store.checkoutBranch(options.name);
      }
      createBranchDialog.value.visible = false;
    } else {
      createBranchDialog.value.error = result.error || "Unknown error";
    }
  }

  // Delete Branch
  const deleteBranchDialog = ref<{ visible: boolean; branchName: string; isLocal: boolean; force: boolean; loading: boolean; error: string | null }>({
    visible: false, branchName: "", isLocal: true, force: false, loading: false, error: null,
  });

  async function confirmDeleteBranch(options?: { force: boolean }) {
    deleteBranchDialog.value.loading = true;
    deleteBranchDialog.value.error = null;
    const { branchName, isLocal } = deleteBranchDialog.value;
    const force = options?.force ?? deleteBranchDialog.value.force;
    const result = isLocal
      ? await store.deleteLocalBranch(branchName, force)
      : await store.deleteRemoteBranch(branchName);
    deleteBranchDialog.value.loading = false;
    if (result.success) {
      deleteBranchDialog.value.visible = false;
    } else {
      deleteBranchDialog.value.error = result.error || "Unknown error";
    }
  }

  // Rename Branch
  const renameDialog = ref<{ visible: boolean; branchName: string; newName: string; loading: boolean; error: string | null }>({
    visible: false, branchName: "", newName: "", loading: false, error: null,
  });

  async function confirmRenameBranch() {
    if (!renameDialog.value.newName.trim()) {
      renameDialog.value.error = "Branch name is required";
      return;
    }
    renameDialog.value.loading = true;
    renameDialog.value.error = null;
    const result = await store.renameBranch(renameDialog.value.branchName, renameDialog.value.newName.trim());
    renameDialog.value.loading = false;
    if (result.success) {
      renameDialog.value.visible = false;
    } else {
      renameDialog.value.error = result.error || "Unknown error";
    }
  }

  // Merge
  const mergeDialog = ref<{ visible: boolean; branchName: string; loading: boolean; error: string | null }>({
    visible: false, branchName: "", loading: false, error: null,
  });

  async function confirmMerge(options: { noCommit: boolean; noFastForward: boolean; squash: boolean }) {
    mergeDialog.value.loading = true;
    mergeDialog.value.error = null;
    const result = await store.mergeBranch(mergeDialog.value.branchName, options);
    mergeDialog.value.loading = false;
    if (result.success) {
      mergeDialog.value.visible = false;
    } else {
      mergeDialog.value.error = result.error || "Unknown error";
    }
  }

  // Rebase
  const rebaseDialog = ref<{ visible: boolean; branchName: string; loading: boolean; error: string | null }>({
    visible: false, branchName: "", loading: false, error: null,
  });

  async function confirmRebase() {
    rebaseDialog.value.loading = true;
    rebaseDialog.value.error = null;
    const result = await store.rebaseBranch(rebaseDialog.value.branchName);
    rebaseDialog.value.loading = false;
    if (result.success) {
      rebaseDialog.value.visible = false;
    } else {
      rebaseDialog.value.error = result.error || "Unknown error";
    }
  }

  // Push
  const pushDialog = ref<{ visible: boolean; branchName: string; loading: boolean; error: string | null }>({
    visible: false, branchName: "", loading: false, error: null,
  });

  async function confirmPush(options: { remote: string; force: boolean; forceWithLease: boolean }) {
    pushDialog.value.loading = true;
    pushDialog.value.error = null;
    const result = await store.pushBranch(pushDialog.value.branchName, options.remote, options.force, options.forceWithLease);
    pushDialog.value.loading = false;
    if (result.success) {
      pushDialog.value.visible = false;
    } else {
      pushDialog.value.error = result.error || "Unknown error";
    }
  }

  // Pull
  const pullDialog = ref<{ visible: boolean; branchName: string; loading: boolean; error: string | null }>({
    visible: false, branchName: "", loading: false, error: null,
  });

  async function confirmPull(options: { remote: string; noFastForward: boolean; squash: boolean }) {
    pullDialog.value.loading = true;
    pullDialog.value.error = null;
    const result = await store.pullBranch(pullDialog.value.branchName, options.remote, options.noFastForward, options.squash);
    pullDialog.value.loading = false;
    if (result.success) {
      pullDialog.value.visible = false;
    } else {
      pullDialog.value.error = result.error || "Unknown error";
    }
  }

  // Cherry Pick
  const cherryPickDialog = ref<{ visible: boolean; commitHash: string; commitMessage: string; loading: boolean; error: string | null }>({
    visible: false, commitHash: "", commitMessage: "", loading: false, error: null,
  });

  async function confirmCherryPick(options: { recordOrigin: boolean; noCommit: boolean }) {
    cherryPickDialog.value.loading = true;
    cherryPickDialog.value.error = null;
    const result = await store.cherryPickCommit(cherryPickDialog.value.commitHash, options.recordOrigin, options.noCommit);
    cherryPickDialog.value.loading = false;
    if (result.success) {
      cherryPickDialog.value.visible = false;
    } else {
      cherryPickDialog.value.error = result.error || "Unknown error";
    }
  }

  // Reset to commit
  const resetDialog = ref<{ visible: boolean; commitHash: string; commitMessage: string; loading: boolean; error: string | null }>({
    visible: false, commitHash: "", commitMessage: "", loading: false, error: null,
  });

  async function confirmReset(options: { mode: 'soft' | 'mixed' | 'hard' }) {
    resetDialog.value.loading = true;
    resetDialog.value.error = null;
    const result = await store.resetToCommit(resetDialog.value.commitHash, options.mode);
    resetDialog.value.loading = false;
    if (result.success) {
      resetDialog.value.visible = false;
    } else {
      resetDialog.value.error = result.error || "Unknown error";
    }
  }

  // Tag Create
  const tagCreateDialog = ref<{ visible: boolean; commitHash: string; loading: boolean; error: string | null }>({
    visible: false, commitHash: "", loading: false, error: null,
  });

  async function confirmTagCreate(options: { name: string; annotated: boolean; message?: string; pushToRemote?: string }) {
    tagCreateDialog.value.loading = true;
    tagCreateDialog.value.error = null;
    const result = await store.createTag(options.name, tagCreateDialog.value.commitHash, options.annotated, options.message, options.pushToRemote);
    tagCreateDialog.value.loading = false;
    if (result.success) {
      tagCreateDialog.value.visible = false;
    } else {
      tagCreateDialog.value.error = result.error || "Unknown error";
    }
  }

  // Tag Delete
  const tagDeleteDialog = ref<{ visible: boolean; tagName: string; loading: boolean; error: string | null }>({
    visible: false, tagName: "", loading: false, error: null,
  });

  async function confirmTagDelete(options: { deleteFromRemote: boolean; remote?: string }) {
    tagDeleteDialog.value.loading = true;
    tagDeleteDialog.value.error = null;
    const result = await store.deleteTag(tagDeleteDialog.value.tagName, options.deleteFromRemote ? (options.remote || 'origin') : undefined);
    tagDeleteDialog.value.loading = false;
    if (result.success) {
      tagDeleteDialog.value.visible = false;
    } else {
      tagDeleteDialog.value.error = result.error || "Unknown error";
    }
  }

  // Tag Detail
  const tagDetailDialog = ref<{ visible: boolean; tagName: string; loading: boolean; tagDetail: GitTag | null }>({
    visible: false, tagName: "", loading: false, tagDetail: null,
  });

  // Stash Changes
  const stashDialog = ref<{ visible: boolean; loading: boolean; error: string | null }>({
    visible: false, loading: false, error: null,
  });

  async function confirmStash(options: { message?: string; includeUntracked: boolean }) {
    stashDialog.value.loading = true;
    stashDialog.value.error = null;
    const result = await store.stashChanges(options.message, options.includeUntracked);
    stashDialog.value.loading = false;
    if (result.success) {
      stashDialog.value.visible = false;
    } else {
      stashDialog.value.error = result.error || "Unknown error";
    }
  }

  // Stash Branch
  const stashBranchDialog = ref<{ visible: boolean; stashIndex: number; loading: boolean; error: string | null }>({
    visible: false, stashIndex: 0, loading: false, error: null,
  });
  const stashBranchInput = ref("");

  async function confirmStashBranch(branchName: string) {
    stashBranchDialog.value.loading = true;
    stashBranchDialog.value.error = null;
    const result = await store.stashBranch(stashBranchDialog.value.stashIndex, branchName);
    stashBranchDialog.value.loading = false;
    if (result.success) {
      stashBranchDialog.value.visible = false;
    } else {
      stashBranchDialog.value.error = result.error || "Unknown error";
    }
  }

  // Reset Working
  const resetWorkingDialog = ref<{ visible: boolean; loading: boolean; error: string | null }>({
    visible: false, loading: false, error: null,
  });

  async function confirmResetWorking(options: { mode: 'mixed' | 'hard' }) {
    resetWorkingDialog.value.loading = true;
    resetWorkingDialog.value.error = null;
    const result = await store.resetWorking(options.mode);
    resetWorkingDialog.value.loading = false;
    if (result.success) {
      resetWorkingDialog.value.visible = false;
    } else {
      resetWorkingDialog.value.error = result.error || "Unknown error";
    }
  }

  // Clean untracked files
  const cleanUntrackedDialog = ref<{ visible: boolean; loading: boolean; error: string | null }>({
    visible: false, loading: false, error: null,
  });

  async function confirmCleanUntracked() {
    cleanUntrackedDialog.value.loading = true;
    cleanUntrackedDialog.value.error = null;
    const result = await store.cleanUntracked();
    cleanUntrackedDialog.value.loading = false;
    if (result.success) {
      cleanUntrackedDialog.value.visible = false;
    } else {
      cleanUntrackedDialog.value.error = result.error || "Unknown error";
    }
  }

  // Dialog open check for auto-refresh deferral
  const isAnyDialogOpen = computed(() =>
    checkoutDialog.value.visible ||
    createBranchDialog.value.visible ||
    deleteBranchDialog.value.visible ||
    renameDialog.value.visible ||
    mergeDialog.value.visible ||
    rebaseDialog.value.visible ||
    pushDialog.value.visible ||
    pullDialog.value.visible ||
    cherryPickDialog.value.visible ||
    resetDialog.value.visible ||
    tagCreateDialog.value.visible ||
    tagDeleteDialog.value.visible ||
    tagDetailDialog.value.visible ||
    stashDialog.value.visible ||
    stashBranchDialog.value.visible ||
    resetWorkingDialog.value.visible ||
    cleanUntrackedDialog.value.visible
  );

  return {
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
    isAnyDialogOpen,
  };
}
