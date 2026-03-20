import { ref } from "vue";
import type { GitLogCommit, GitStash } from "~/types/git";
import type { useGitGraphStore } from "~/stores/gitGraph";
import type { useGitDialogs } from "~/composables/useGitDialogs";

export function useGitContextMenus(
  store: ReturnType<typeof useGitGraphStore>,
  dialogs: ReturnType<typeof useGitDialogs>,
) {
  // Copy Feedback
  const copyFeedback = ref<{ visible: boolean; x: number; y: number }>({
    visible: false, x: 0, y: 0,
  });

  function showCopyFeedback(x: number, y: number) {
    copyFeedback.value = { visible: true, x, y };
    setTimeout(() => {
      copyFeedback.value.visible = false;
    }, 1500);
  }

  // ============================================================================
  // Branch Context Menu
  // ============================================================================
  const branchMenu = ref<{
    visible: boolean;
    branch: string;
    x: number;
    y: number;
    isCurrentBranch: boolean;
    isLocal: boolean;
    commitHash: string;
  }>({
    visible: false,
    branch: "",
    x: 0,
    y: 0,
    isCurrentBranch: false,
    isLocal: true,
    commitHash: "",
  });

  function handleBranchContextMenu(data: { branch: string; x: number; y: number; isCurrentBranch: boolean; isLocal: boolean; commitHash: string }) {
    branchMenu.value = { visible: true, ...data };
    store.setActiveContextMenu({ type: 'branch', props: data, position: { x: data.x, y: data.y } });
  }

  function closeBranchMenu() {
    branchMenu.value.visible = false;
    store.clearActiveContextMenu();
  }

  function handleBranchCheckout() {
    closeBranchMenu();
    dialogs.checkoutDialog.value = {
      visible: true,
      branchName: branchMenu.value.branch,
      loading: false,
      error: null,
    };
  }

  function handleBranchRename() {
    const branch = branchMenu.value.branch;
    closeBranchMenu();
    dialogs.renameDialog.value = { visible: true, branchName: branch, newName: branch, loading: false, error: null };
  }

  function handleBranchDelete() {
    const { branch, isLocal } = branchMenu.value;
    closeBranchMenu();
    dialogs.deleteBranchDialog.value = { visible: true, branchName: branch, isLocal, force: false, loading: false, error: null };
  }

  function handleBranchMerge() {
    const branch = branchMenu.value.branch;
    closeBranchMenu();
    dialogs.mergeDialog.value = { visible: true, branchName: branch, loading: false, error: null };
  }

  function handleBranchRebase() {
    const branch = branchMenu.value.branch;
    closeBranchMenu();
    dialogs.rebaseDialog.value = { visible: true, branchName: branch, loading: false, error: null };
  }

  function handleBranchPush() {
    const branch = branchMenu.value.branch;
    closeBranchMenu();
    dialogs.pushDialog.value = { visible: true, branchName: branch, loading: false, error: null };
  }

  function handleBranchPull() {
    const branch = branchMenu.value.branch;
    closeBranchMenu();
    dialogs.pullDialog.value = { visible: true, branchName: branch, loading: false, error: null };
  }

  async function handleBranchFetch() {
    const branch = branchMenu.value.branch;
    closeBranchMenu();
    await store.fetchBranch(branch);
  }

  async function handleBranchCopyName() {
    const name = branchMenu.value.branch;
    closeBranchMenu();
    await store.copyToClipboard(name);
    showCopyFeedback(branchMenu.value.x, branchMenu.value.y);
  }

  function handleBranchCreateBranch() {
    closeBranchMenu();
    dialogs.createBranchDialog.value = {
      visible: true,
      fromCommit: branchMenu.value.commitHash,
      loading: false,
      error: null,
    };
  }

  // ============================================================================
  // Commit Context Menu
  // ============================================================================
  const commitMenu = ref<{
    visible: boolean;
    commit: GitLogCommit | null;
    x: number;
    y: number;
  }>({
    visible: false,
    commit: null,
    x: 0,
    y: 0,
  });

  function handleCommitContextMenu(data: { commit: GitLogCommit; x: number; y: number }) {
    commitMenu.value = { visible: true, commit: data.commit, x: data.x, y: data.y };
    store.setActiveContextMenu({ type: 'commit', props: data, position: { x: data.x, y: data.y } });
  }

  function closeCommitMenu() {
    commitMenu.value.visible = false;
    store.clearActiveContextMenu();
  }

  function withCommitMenuCommit(action: (commit: GitLogCommit) => unknown | Promise<unknown>): boolean | Promise<boolean> {
    const commit = commitMenu.value.commit;
    if (!commit) return false;
    closeCommitMenu();
    const result = action(commit);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<unknown>).then(() => true);
    }
    return true;
  }

  function handleCommitAddTag() {
    withCommitMenuCommit((commit) => {
      dialogs.tagCreateDialog.value = { visible: true, commitHash: commit.hash, loading: false, error: null };
    });
  }

  function handleCommitCreateBranch() {
    withCommitMenuCommit((commit) => {
      dialogs.createBranchDialog.value = { visible: true, fromCommit: commit.hash, loading: false, error: null };
    });
  }

  function handleCommitCheckout() {
    withCommitMenuCommit((commit) => {
      dialogs.checkoutDialog.value = { visible: true, branchName: commit.hash, loading: false, error: null };
    });
  }

  function handleCommitCherryPick() {
    withCommitMenuCommit((commit) => {
      dialogs.cherryPickDialog.value = { visible: true, commitHash: commit.hash, commitMessage: commit.message, loading: false, error: null };
    });
  }

  async function handleCommitRevert() {
    await withCommitMenuCommit((commit) => store.revertCommit(commit.hash));
  }

  function handleCommitMergeInto() {
    withCommitMenuCommit((commit) => {
      dialogs.mergeDialog.value = { visible: true, branchName: commit.shortHash, loading: false, error: null };
    });
  }

  function handleCommitReset() {
    withCommitMenuCommit((commit) => {
      dialogs.resetDialog.value = { visible: true, commitHash: commit.hash, commitMessage: commit.message, loading: false, error: null };
    });
  }

  async function handleCommitCopyHash() {
    const { x, y } = commitMenu.value;
    const copied = await withCommitMenuCommit((commit) => store.copyToClipboard(commit.hash));
    if (!copied) return;
    showCopyFeedback(x, y);
  }

  async function handleCommitCopySubject() {
    await withCommitMenuCommit((commit) => store.copyCommitSubject(commit));
  }

  // ============================================================================
  // Tag Context Menu
  // ============================================================================
  const tagMenu = ref<{
    visible: boolean;
    tag: string;
    x: number;
    y: number;
    commitHash: string;
  }>({
    visible: false,
    tag: "",
    x: 0,
    y: 0,
    commitHash: "",
  });

  function handleTagContextMenu(data: { tag: string; x: number; y: number; commitHash: string }) {
    tagMenu.value = { visible: true, ...data };
    store.setActiveContextMenu({ type: 'tag', props: data, position: { x: data.x, y: data.y } });
  }

  function closeTagMenu() {
    tagMenu.value.visible = false;
    store.clearActiveContextMenu();
  }

  async function handleTagViewDetails() {
    const tag = tagMenu.value.tag;
    closeTagMenu();
    dialogs.tagDetailDialog.value = { visible: true, tagName: tag, loading: true, tagDetail: null };
    const result = await store.getTagDetail(tag);
    dialogs.tagDetailDialog.value.loading = false;
    if (result.success && result.data) {
      dialogs.tagDetailDialog.value.tagDetail = result.data;
    }
  }

  function handleTagDelete() {
    const tag = tagMenu.value.tag;
    closeTagMenu();
    dialogs.tagDeleteDialog.value = { visible: true, tagName: tag, loading: false, error: null };
  }

  async function handleTagPush() {
    const tag = tagMenu.value.tag;
    closeTagMenu();
    await store.pushTag(tag);
  }

  async function handleTagCopyName() {
    const tag = tagMenu.value.tag;
    closeTagMenu();
    await store.copyToClipboard(tag);
    showCopyFeedback(tagMenu.value.x, tagMenu.value.y);
  }

  // ============================================================================
  // Uncommitted Changes Context Menu
  // ============================================================================
  const uncommittedMenu = ref<{ visible: boolean; x: number; y: number }>({
    visible: false, x: 0, y: 0,
  });

  function handleUncommittedContextMenu(data: { x: number; y: number }) {
    uncommittedMenu.value = { visible: true, ...data };
    store.setActiveContextMenu({ type: 'uncommitted', props: data, position: { x: data.x, y: data.y } });
  }

  function closeUncommittedMenu() {
    uncommittedMenu.value.visible = false;
    store.clearActiveContextMenu();
  }

  function handleUncommittedStash() {
    closeUncommittedMenu();
    dialogs.stashDialog.value = { visible: true, loading: false, error: null };
  }

  function handleUncommittedReset() {
    closeUncommittedMenu();
    dialogs.resetWorkingDialog.value = { visible: true, loading: false, error: null };
  }

  function handleUncommittedClean() {
    closeUncommittedMenu();
    dialogs.cleanUntrackedDialog.value = { visible: true, loading: false, error: null };
  }

  // ============================================================================
  // Stash Context Menu
  // ============================================================================
  const stashMenu = ref<{
    visible: boolean;
    stash: GitStash | null;
    x: number;
    y: number;
  }>({
    visible: false,
    stash: null,
    x: 0,
    y: 0,
  });

  function handleStashContextMenu(data: { stash: GitStash; x: number; y: number }) {
    stashMenu.value = { visible: true, stash: data.stash, x: data.x, y: data.y };
    store.setActiveContextMenu({ type: 'stash', props: data, position: { x: data.x, y: data.y } });
  }

  function closeStashMenu() {
    stashMenu.value.visible = false;
    store.clearActiveContextMenu();
  }

  function withStashMenuItem(action: (stash: GitStash) => unknown | Promise<unknown>): boolean | Promise<boolean> {
    const stash = stashMenu.value.stash;
    if (!stash) return false;
    closeStashMenu();
    const result = action(stash);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<unknown>).then(() => true);
    }
    return true;
  }

  async function handleStashApply() {
    await withStashMenuItem((stash) => store.applyStash(stash.index));
  }

  async function handleStashPop() {
    await withStashMenuItem((stash) => store.popStash(stash.index));
  }

  async function handleStashDrop() {
    await withStashMenuItem((stash) => store.dropStash(stash.index));
  }

  function handleStashCreateBranch() {
    withStashMenuItem((stash) => {
      dialogs.stashBranchDialog.value = { visible: true, stashIndex: stash.index, loading: false, error: null };
    });
  }

  async function handleStashCopyName() {
    const { x, y } = stashMenu.value;
    const copied = await withStashMenuItem((stash) => store.copyToClipboard(`stash@{${stash.index}}`));
    if (!copied) return;
    showCopyFeedback(x, y);
  }

  async function handleStashCopyHash() {
    const { x, y } = stashMenu.value;
    const copied = await withStashMenuItem((stash) => store.copyToClipboard(stash.hash));
    if (!copied) return;
    showCopyFeedback(x, y);
  }

  return {
    copyFeedback, showCopyFeedback,

    // Branch
    branchMenu,
    handleBranchContextMenu, closeBranchMenu,
    handleBranchCheckout, handleBranchRename, handleBranchDelete,
    handleBranchMerge, handleBranchRebase, handleBranchPush, handleBranchPull,
    handleBranchFetch, handleBranchCopyName, handleBranchCreateBranch,

    // Commit
    commitMenu,
    handleCommitContextMenu, closeCommitMenu,
    handleCommitAddTag, handleCommitCreateBranch, handleCommitCheckout,
    handleCommitCherryPick, handleCommitRevert, handleCommitMergeInto,
    handleCommitReset, handleCommitCopyHash, handleCommitCopySubject,

    // Tag
    tagMenu,
    handleTagContextMenu, closeTagMenu,
    handleTagViewDetails, handleTagDelete, handleTagPush, handleTagCopyName,

    // Uncommitted
    uncommittedMenu,
    handleUncommittedContextMenu, closeUncommittedMenu,
    handleUncommittedStash, handleUncommittedReset, handleUncommittedClean,

    // Stash
    stashMenu,
    handleStashContextMenu, closeStashMenu,
    handleStashApply, handleStashPop, handleStashDrop,
    handleStashCreateBranch, handleStashCopyName, handleStashCopyHash,
  };
}
