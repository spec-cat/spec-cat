<script setup lang="ts">
import { useGitGraphStore } from "~/stores/gitGraph";
import { useChatStore } from "~/stores/chat";
import { useAutoRefresh } from "~/composables/useAutoRefresh";
import { useKeyboardShortcuts } from "~/composables/useKeyboardShortcuts";
import { ExclamationTriangleIcon, MagnifyingGlassIcon, FunnelIcon, XMarkIcon, ArrowPathIcon, CloudArrowDownIcon, Cog6ToothIcon, AdjustmentsHorizontalIcon } from "@heroicons/vue/24/outline";
import type { Branch, GitLogCommit, GitStash, GitTag } from "~/types/git";
import CherryPickDialog from "~/components/git/dialogs/CherryPickDialog.vue";
import CreateBranchDialog from "~/components/git/dialogs/CreateBranchDialog.vue";
import CleanUntrackedDialog from "~/components/git/dialogs/CleanUntrackedDialog.vue";
import DeleteBranchDialog from "~/components/git/dialogs/DeleteBranchDialog.vue";
import MergeDialog from "~/components/git/dialogs/MergeDialog.vue";
import PullDialog from "~/components/git/dialogs/PullDialog.vue";
import PushDialog from "~/components/git/dialogs/PushDialog.vue";
import RebaseDialog from "~/components/git/dialogs/RebaseDialog.vue";
import ResetDialog from "~/components/git/dialogs/ResetDialog.vue";
import ResetWorkingDialog from "~/components/git/dialogs/ResetWorkingDialog.vue";
import StashDialog from "~/components/git/dialogs/StashDialog.vue";
import TagCreateDialog from "~/components/git/dialogs/TagCreateDialog.vue";
import TagDeleteDialog from "~/components/git/dialogs/TagDeleteDialog.vue";
import TagDetailDialog from "~/components/git/dialogs/TagDetailDialog.vue";

interface Props {
  workingDirectory: string;
  isActive?: boolean;  // FR-033: Whether this tab is currently active
}

const props = withDefaults(defineProps<Props>(), {
  isActive: true,
});

const store = useGitGraphStore();
const chatStore = useChatStore();
const autoRefresh = useAutoRefresh();

// Branches to highlight based on active conversation's worktree branch
const highlightBranches = computed<string[]>(() => {
  const branch = chatStore.activeConversation?.worktreeBranch;
  return branch ? [branch] : [];
});

// Branches to highlight for the selected feature (FR-095)
const featureHighlightBranches = computed<string[]>(() => {
  const branches: string[] = [];
  const featureId = store.selectedFeatureId;
  if (featureId) branches.push(featureId);
  // Also include the active conversation's worktree branch for red highlight
  const convBranch = store.conversationBranch;
  if (convBranch && !branches.includes(convBranch)) branches.push(convBranch);
  return branches;
});

// Sync active conversation's worktree branch to the store for merge-base computation
watch(
  () => chatStore.activeConversation?.worktreeBranch,
  (branch) => {
    store.setConversationBranch(branch ?? null);
  },
  { immediate: true }
);

// Branches to highlight for the previewing conversation (yellow) (FR-095 extension)
const previewHighlightBranches = computed<string[]>(() => {
  const branch = store.previewBranch;
  return branch ? [branch] : [];
});

// Sync previewing conversation's worktree branch to the store
watch(
  () => chatStore.previewingConversation?.worktreeBranch,
  (branch) => {
    store.setPreviewBranch(branch ?? null);
  },
  { immediate: true }
);

// Merge-base map for preview branches
const previewMergeBases = computed<Record<string, string>>(() => {
  const bases: Record<string, string> = {};
  if (store.previewBranch && store.previewMergeBase) {
    bases[store.previewBranch] = store.previewMergeBase;
  }
  return bases;
});

// Merge-base map: branch name → merge-base hash (for feature + conversation branches)
const featureMergeBases = computed<Record<string, string>>(() => {
  const bases: Record<string, string> = {};
  if (store.selectedFeatureId && store.featureMergeBase) {
    bases[store.selectedFeatureId] = store.featureMergeBase;
  }
  if (store.conversationBranch && store.conversationMergeBase) {
    bases[store.conversationBranch] = store.conversationMergeBase;
  }
  return bases;
});

// Remote names for dialog dropdowns
const remoteNames = computed(() => store.remotes.map(r => r.name));

// Ref to GitCommitList for scroll position preservation (FR-034, NFR-005)
const commitListRef = ref<{
  getScrollPosition: () => number;
  setScrollPosition: (pos: number) => void;
} | null>(null);

// Load git graph when component mounts or working directory changes
watch(
  () => props.workingDirectory,
  async (directory) => {
    if (directory) {
      await store.loadGitGraph(directory);
      // After git graph loads, re-fetch merge-bases for preview/conversation branches if they exist
      const previewBranch = chatStore.previewingConversation?.worktreeBranch;
      if (previewBranch) {
        await store.setPreviewBranch(previewBranch);
      }
      const convBranch = chatStore.activeConversation?.worktreeBranch;
      if (convBranch) {
        await store.setConversationBranch(convBranch);
      }
    }
  },
  { immediate: true }
);

// ============================================================================
// Auto-Refresh (FR-029 to FR-035)
// ============================================================================

// Start/stop polling based on tab activity (FR-033)
watch(
  () => props.isActive,
  (isActive) => {
    if (isActive && store.commits.length > 0 && !store.error) {
      autoRefresh.startPolling(props.workingDirectory);
    } else {
      autoRefresh.stopPolling();
    }
  },
  { immediate: true }
);

// Also start polling when commits are loaded (if tab is active)
watch(
  () => store.commits.length,
  (count) => {
    if (count > 0 && props.isActive && !store.error) {
      autoRefresh.startPolling(props.workingDirectory);
    }
  }
);

// Connect scroll position callbacks when commitListRef is available (NFR-005)
watch(
  () => commitListRef.value,
  (ref) => {
    if (ref) {
      autoRefresh.setScrollCallbacks({
        getScrollPosition: () => ref.getScrollPosition(),
        setScrollPosition: (pos) => ref.setScrollPosition(pos),
      });
    }
  }
);

// Cleanup on unmount
onUnmounted(() => {
  autoRefresh.cleanup();
  store.reset();
});

// Check if error is "not a git repo"
const isNotGitRepo = computed(() => {
  return store.error?.includes("Not a Git repository");
});

// ============================================================================
// Last Updated Indicator (FR-035)
// ============================================================================

const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;

const startTimeUpdates = () => {
  if (nowTimer) return;
  nowTimer = setInterval(() => {
    now.value = Date.now();
  }, 5000);
};

const stopTimeUpdates = () => {
  if (nowTimer) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
};

onMounted(() => {
  watch(
    () => props.isActive,
    (isActive) => {
      if (isActive) {
        now.value = Date.now();
        startTimeUpdates();
      } else {
        stopTimeUpdates();
      }
    },
    { immediate: true }
  );
});

onUnmounted(() => {
  stopTimeUpdates();
});

const lastUpdatedText = computed(() => {
  const lastRefresh = store.lastRefreshTime;
  if (!lastRefresh) return null;

  const seconds = Math.floor((now.value - lastRefresh) / 1000);

  if (store.isRefreshing) {
    return "Syncing...";
  }

  if (seconds < 5) {
    return "Just now";
  } else if (seconds < 60) {
    return `${seconds}s ago`;
  } else {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }
});

// ============================================================================
// Search & Filter (FR-058, FR-060)
// ============================================================================
const showFindWidget = ref(false);
const showBranchFilter = ref(false);
const findWidgetRef = ref<{ focus: () => void } | null>(null);

function openFindWidget() {
  showFindWidget.value = true;
  nextTick(() => findWidgetRef.value?.focus());
}

function closeFindWidget() {
  showFindWidget.value = false;
  store.setSearchQuery("");
}

function handleFindSearch(query: string) {
  store.setSearchQuery(query);
}

// ============================================================================
// Keyboard Shortcuts (FR-077 to FR-082)
// ============================================================================
const keyboardShortcuts = useKeyboardShortcuts({
  onFind: () => openFindWidget(),
  onRefresh: async () => {
    if (props.workingDirectory) {
      await store.loadGitGraph(props.workingDirectory);
    }
  },
  onScrollToHead: () => {
    // Find HEAD commit and navigate to it
    const headCommit = store.commits.find(c => c.isHead);
    if (headCommit) {
      store.selectCommit(headCommit);
    }
  },
  onEscape: () => {
    // Cascading close: settings → find widget → comparison → detail
    if (showSettings.value) {
      showSettings.value = false;
    } else if (showBranchFilter.value) {
      showBranchFilter.value = false;
    } else if (showRemoteManager.value) {
      showRemoteManager.value = false;
    } else if (showFindWidget.value) {
      closeFindWidget();
    } else if (store.isComparing) {
      store.clearComparison();
    } else if (store.selectedCommit || store.isUncommittedChangesSelected) {
      store.clearSelection();
    }
  },
});

onMounted(() => {
  keyboardShortcuts.start();
});

onUnmounted(() => {
  keyboardShortcuts.stop();
});

// ============================================================================
// Settings Popover (FR-002, FR-011, FR-071)
// ============================================================================
const showSettings = ref(false);

// ============================================================================
// Remote Manager & Fetch All (FR-070, FR-074, FR-076)
// ============================================================================
const showRemoteManager = ref(false);

async function handleFetchAll() {
  await store.fetchAll(true);
}

async function handleRemoteAdd(data: { name: string; url: string }) {
  await store.addRemote(data.name, data.url);
}

async function handleRemoteEdit(data: { name: string; newUrl: string }) {
  await store.editRemote(data.name, data.newUrl);
}

async function handleRemoteDelete(name: string) {
  await store.deleteRemote(name);
}

// ============================================================================
// Grouped Branch Filter (FR-060)
// ============================================================================
const groupedBranchFilter = computed(() => {
  const local: Branch[] = [];
  const remotes: Record<string, Branch[]> = {};

  for (const branch of store.branches) {
    if (store.localBranchNames.has(branch.name)) {
      local.push(branch);
    } else {
      const slashIndex = branch.name.indexOf('/');
      if (slashIndex > 0) {
        const remoteName = branch.name.substring(0, slashIndex);
        if (!remotes[remoteName]) remotes[remoteName] = [];
        remotes[remoteName].push(branch);
      } else {
        local.push(branch);
      }
    }
  }

  return { local, remotes };
});

// ============================================================================
// Branch Context Menu (FR-023 to FR-032)
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

// Branch menu action handlers
function handleBranchCheckout() {
  closeBranchMenu();
  checkoutDialog.value = {
    visible: true,
    branchName: branchMenu.value.branch,
    loading: false,
    error: null,
  };
}

function handleBranchRename() {
  const branch = branchMenu.value.branch;
  closeBranchMenu();
  renameDialog.value = { visible: true, branchName: branch, newName: branch, loading: false, error: null };
}

function handleBranchDelete() {
  const { branch, isLocal } = branchMenu.value;
  closeBranchMenu();
  deleteBranchDialog.value = { visible: true, branchName: branch, isLocal, force: false, loading: false, error: null };
}

function handleBranchMerge() {
  const branch = branchMenu.value.branch;
  closeBranchMenu();
  mergeDialog.value = { visible: true, branchName: branch, loading: false, error: null };
}

function handleBranchRebase() {
  const branch = branchMenu.value.branch;
  closeBranchMenu();
  rebaseDialog.value = { visible: true, branchName: branch, loading: false, error: null };
}

function handleBranchPush() {
  const branch = branchMenu.value.branch;
  closeBranchMenu();
  pushDialog.value = { visible: true, branchName: branch, loading: false, error: null };
}

function handleBranchPull() {
  const branch = branchMenu.value.branch;
  closeBranchMenu();
  pullDialog.value = { visible: true, branchName: branch, loading: false, error: null };
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
  createBranchDialog.value = {
    visible: true,
    fromCommit: branchMenu.value.commitHash,
    loading: false,
    error: null,
  };
}

// ============================================================================
// Commit Context Menu (FR-033 to FR-039)
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
    tagCreateDialog.value = { visible: true, commitHash: commit.hash, loading: false, error: null };
  });
}

function handleCommitCreateBranch() {
  withCommitMenuCommit((commit) => {
    createBranchDialog.value = { visible: true, fromCommit: commit.hash, loading: false, error: null };
  });
}

function handleCommitCheckout() {
  withCommitMenuCommit((commit) => {
    checkoutDialog.value = { visible: true, branchName: commit.hash, loading: false, error: null };
  });
}

function handleCommitCherryPick() {
  withCommitMenuCommit((commit) => {
    cherryPickDialog.value = { visible: true, commitHash: commit.hash, commitMessage: commit.message, loading: false, error: null };
  });
}

async function handleCommitRevert() {
  await withCommitMenuCommit((commit) => store.revertCommit(commit.hash));
}

function handleCommitMergeInto() {
  withCommitMenuCommit((commit) => {
    mergeDialog.value = { visible: true, branchName: commit.shortHash, loading: false, error: null };
  });
}

function handleCommitReset() {
  withCommitMenuCommit((commit) => {
    resetDialog.value = { visible: true, commitHash: commit.hash, commitMessage: commit.message, loading: false, error: null };
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
// Tag Context Menu (FR-040 to FR-044)
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
  tagDetailDialog.value = { visible: true, tagName: tag, loading: true, tagDetail: null };
  const result = await store.getTagDetail(tag);
  tagDetailDialog.value.loading = false;
  if (result.success && result.data) {
    tagDetailDialog.value.tagDetail = result.data;
  }
}

function handleTagDelete() {
  const tag = tagMenu.value.tag;
  closeTagMenu();
  tagDeleteDialog.value = { visible: true, tagName: tag, loading: false, error: null };
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
  stashDialog.value = { visible: true, loading: false, error: null };
}

function handleUncommittedReset() {
  closeUncommittedMenu();
  resetWorkingDialog.value = { visible: true, loading: false, error: null };
}

async function handleUncommittedClean() {
  closeUncommittedMenu();
  cleanUntrackedDialog.value = { visible: true, loading: false, error: null };
}

// ============================================================================
// Stash Context Menu (FR-046 to FR-051)
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
    stashBranchDialog.value = { visible: true, stashIndex: stash.index, loading: false, error: null };
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

// ============================================================================
// Dialogs State
// ============================================================================

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

// Stash Branch (FR-049)
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

// ============================================================================
// Copy Feedback
// ============================================================================
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
// Dialog Registration for Auto-Refresh Deferral (FR-065, T115)
// ============================================================================
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

watch(isAnyDialogOpen, (open) => {
  if (open) {
    store.setActiveDialog({ type: 'generic', props: {} });
  } else {
    store.clearActiveDialog();
  }
});

// ============================================================================
// Commit Comparison (FR-021, FR-022)
// ============================================================================
function handleCompareSelect(commit: GitLogCommit) {
  if (store.selectedCommit) {
    // A commit is already selected — set the comparison target
    store.selectComparisonCommit(commit);
  } else {
    // No commit selected — just select normally
    store.selectCommit(commit);
  }
}

// ============================================================================
// Commit Navigation (from detail panel)
// ============================================================================
function handleNavigateToCommit(hash: string) {
  store.navigateToCommit(hash);
}
</script>

<template>
  <div
    class="h-full flex flex-col bg-retro-dark"
    role="region"
    aria-label="Git Graph"
  >
    <!-- Loading State -->
    <div
      v-if="store.loading && store.commits.length === 0"
      class="flex-1 flex flex-col items-center justify-center gap-3"
    >
      <div class="w-6 h-6 border-2 border-retro-muted border-t-retro-cyan rounded-full animate-spin" />
      <div class="text-retro-muted text-sm">Loading git history...</div>
    </div>

    <!-- Not a Git Repository (NFR-003) -->
    <div
      v-else-if="isNotGitRepo"
      class="flex-1 flex flex-col items-center justify-center p-8 text-center"
    >
      <ExclamationTriangleIcon class="w-12 h-12 text-retro-yellow mb-4" />
      <h3 class="text-retro-text font-semibold mb-2">Not a Git Repository</h3>
      <p class="text-retro-muted text-sm max-w-xs">
        This directory is not initialized as a Git repository.
        Run <code class="text-retro-cyan">git init</code> to get started.
      </p>
    </div>

    <!-- Error State -->
    <div
      v-else-if="store.error"
      class="flex-1 flex flex-col items-center justify-center p-8 text-center"
    >
      <ExclamationTriangleIcon class="w-10 h-10 text-retro-red mb-3" />
      <p class="text-retro-red text-sm mb-4">{{ store.error }}</p>
      <button
        class="flex items-center gap-2 px-3 py-1.5 text-sm text-retro-text border border-retro-border rounded hover:border-retro-cyan hover:text-retro-cyan transition-colors"
        @click="store.loadGitGraph(props.workingDirectory)"
      >
        <ArrowPathIcon class="w-4 h-4" />
        Retry
      </button>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="store.commits.length === 0"
      class="flex-1 flex items-center justify-center p-4"
    >
      <div class="text-retro-muted text-center">
        <p>No commits found in this repository.</p>
      </div>
    </div>

    <!-- Git Graph Content -->
    <template v-else>
      <!-- Find Widget (FR-058, FR-059) -->
      <GitFindWidget
        v-if="showFindWidget"
        ref="findWidgetRef"
        :resultCount="store.searchResultHashes.length"
        :currentIndex="store.searchResultIndex"
        @search="handleFindSearch"
        @next="store.nextSearchResult"
        @prev="store.prevSearchResult"
        @close="closeFindWidget"
      />

      <!-- Toolbar Header (FR-060, FR-070) -->
      <div class="flex-shrink-0 flex items-center gap-2 p-2 border-b border-retro-border">
        <!-- Find Button -->
        <button
          class="flex items-center gap-1 px-2 py-1.5 text-sm border rounded transition-colors"
          :class="showFindWidget
            ? 'border-retro-cyan text-retro-cyan bg-retro-cyan/10'
            : 'border-retro-border text-retro-muted hover:text-retro-text hover:border-retro-text'"
          aria-label="Find (Ctrl+F)"
          title="Find (Ctrl+F)"
          @click="showFindWidget ? closeFindWidget() : openFindWidget()"
        >
          <MagnifyingGlassIcon class="w-4 h-4" />
        </button>

        <!-- Settings Button (FR-002, FR-011, FR-071) -->
        <div class="relative">
          <button
            class="flex items-center gap-1 px-2 py-1.5 text-sm border rounded transition-colors"
            :class="showSettings
              ? 'border-retro-cyan text-retro-cyan bg-retro-cyan/10'
              : 'border-retro-border text-retro-muted hover:text-retro-text hover:border-retro-text'"
            aria-label="Graph settings"
            title="Settings"
            @click="showSettings = !showSettings"
          >
            <AdjustmentsHorizontalIcon class="w-4 h-4" />
          </button>

          <!-- Settings Popover -->
          <div
            v-if="showSettings"
            class="absolute left-0 top-full mt-1 z-10 bg-retro-panel border border-retro-border rounded shadow-lg py-2 min-w-[200px]"
          >
            <div class="px-3 py-1 text-xs text-retro-muted border-b border-retro-border mb-1">
              Graph Style
            </div>
            <label class="flex items-center gap-2 px-3 py-1 hover:bg-retro-panel/50 cursor-pointer">
              <input
                type="radio"
                name="graphStyle"
                value="rounded"
                :checked="store.graphStyle === 'rounded'"
                class="accent-retro-cyan"
                @change="store.setGraphStyle('rounded')"
              />
              <span class="text-sm text-retro-text">Rounded</span>
            </label>
            <label class="flex items-center gap-2 px-3 py-1 hover:bg-retro-panel/50 cursor-pointer">
              <input
                type="radio"
                name="graphStyle"
                value="angular"
                :checked="store.graphStyle === 'angular'"
                class="accent-retro-cyan"
                @change="store.setGraphStyle('angular')"
              />
              <span class="text-sm text-retro-text">Angular</span>
            </label>

            <div class="px-3 py-1 text-xs text-retro-muted border-b border-retro-border mt-2 mb-1">
              Display
            </div>
            <label class="flex items-center gap-2 px-3 py-1 hover:bg-retro-panel/50 cursor-pointer">
              <input
                type="checkbox"
                :checked="store.muteNonAncestral"
                class="accent-retro-cyan"
                @change="store.toggleMuteNonAncestral()"
              />
              <span class="text-sm text-retro-text">Mute non-ancestral</span>
            </label>

            <div class="px-3 py-1 text-xs text-retro-muted border-b border-retro-border mt-2 mb-1">
              Columns
            </div>
            <label class="flex items-center gap-2 px-3 py-1 hover:bg-retro-panel/50 cursor-pointer">
              <input
                type="checkbox"
                :checked="store.columnVisibility.commit !== false"
                class="accent-retro-cyan"
                @change="store.toggleColumnVisibility('commit')"
              />
              <span class="text-sm text-retro-text">Hash</span>
            </label>
            <label class="flex items-center gap-2 px-3 py-1 hover:bg-retro-panel/50 cursor-pointer">
              <input
                type="checkbox"
                :checked="store.columnVisibility.author !== false"
                class="accent-retro-cyan"
                @change="store.toggleColumnVisibility('author')"
              />
              <span class="text-sm text-retro-text">Author</span>
            </label>
            <label class="flex items-center gap-2 px-3 py-1 hover:bg-retro-panel/50 cursor-pointer">
              <input
                type="checkbox"
                :checked="store.columnVisibility.date !== false"
                class="accent-retro-cyan"
                @change="store.toggleColumnVisibility('date')"
              />
              <span class="text-sm text-retro-text">Date</span>
            </label>
          </div>
        </div>

        <span class="flex-1" />

        <!-- Branch Filter Toggle -->
        <div class="relative">
          <button
            class="flex items-center gap-1 px-2 py-1.5 text-sm border rounded transition-colors"
            :class="showBranchFilter || store.filteredBranches.length > 0
              ? 'border-retro-cyan text-retro-cyan bg-retro-cyan/10'
              : 'border-retro-border text-retro-muted hover:text-retro-text hover:border-retro-text'"
            aria-label="Filter by branch"
            :aria-expanded="showBranchFilter"
            @click="showBranchFilter = !showBranchFilter"
          >
            <FunnelIcon class="w-4 h-4" />
            <span v-if="store.filteredBranches.length > 0" class="text-xs">
              ({{ store.filteredBranches.length }})
            </span>
          </button>

          <!-- Branch Filter Dropdown (FR-060) -->
          <div
            v-if="showBranchFilter"
            class="absolute right-0 top-full mt-1 z-10 bg-retro-panel border border-retro-border rounded shadow-lg py-1 min-w-[220px] max-h-[400px] overflow-auto"
          >
            <div class="px-3 py-1 text-xs text-retro-muted border-b border-retro-border">
              Filter by Branch
            </div>
            <button
              v-if="store.filteredBranches.length > 0"
              class="w-full text-left px-3 py-1.5 text-sm text-retro-cyan hover:bg-retro-cyan/10"
              @click="store.clearFilters()"
            >
              Clear All Filters
            </button>

            <!-- Local branches group -->
            <template v-if="groupedBranchFilter.local.length > 0">
              <div class="px-3 py-1 text-[10px] text-retro-green font-semibold uppercase tracking-wider mt-1">
                Local
              </div>
              <label
                v-for="branch in groupedBranchFilter.local"
                :key="branch.name"
                class="flex items-center gap-2 px-3 py-1 hover:bg-retro-panel/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  :checked="store.filteredBranches.includes(branch.name)"
                  class="accent-retro-cyan"
                  @change="store.toggleBranchFilter(branch.name)"
                />
                <span class="text-sm text-retro-text truncate">{{ branch.name }}</span>
                <span v-if="branch.isHead" class="text-[10px] text-retro-cyan">(HEAD)</span>
              </label>
            </template>

            <!-- Remote branches grouped by remote name -->
            <template v-for="(branches, remoteName) in groupedBranchFilter.remotes" :key="remoteName">
              <div class="px-3 py-1 text-[10px] text-retro-orange font-semibold uppercase tracking-wider mt-1">
                {{ remoteName }}
              </div>
              <label
                v-for="branch in branches"
                :key="branch.name"
                class="flex items-center gap-2 px-3 py-1 hover:bg-retro-panel/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  :checked="store.filteredBranches.includes(branch.name)"
                  class="accent-retro-cyan"
                  @change="store.toggleBranchFilter(branch.name)"
                />
                <span class="text-sm text-retro-text truncate">{{ branch.name }}</span>
              </label>
            </template>
          </div>
        </div>

        <!-- Refresh Button (FR-070) -->
        <button
          class="flex items-center gap-1 px-2 py-1.5 text-sm border border-retro-border text-retro-muted rounded hover:text-retro-text hover:border-retro-text transition-colors"
          :class="{ 'animate-spin': store.isRefreshing }"
          aria-label="Refresh (Ctrl+R)"
          title="Refresh (Ctrl+R)"
          @click="store.loadGitGraph(props.workingDirectory)"
        >
          <ArrowPathIcon class="w-4 h-4" />
        </button>

        <!-- Fetch All Button (FR-070, FR-075) -->
        <button
          class="flex items-center gap-1 px-2 py-1.5 text-sm border border-retro-border text-retro-muted rounded hover:text-retro-text hover:border-retro-text transition-colors"
          aria-label="Fetch all remotes"
          title="Fetch All"
          @click="handleFetchAll"
        >
          <CloudArrowDownIcon class="w-4 h-4" />
        </button>

        <!-- Remote Manager Toggle (FR-074) -->
        <div class="relative">
          <button
            class="flex items-center gap-1 px-2 py-1.5 text-sm border rounded transition-colors"
            :class="showRemoteManager
              ? 'border-retro-cyan text-retro-cyan bg-retro-cyan/10'
              : 'border-retro-border text-retro-muted hover:text-retro-text hover:border-retro-text'"
            aria-label="Manage remotes"
            title="Remotes"
            @click="showRemoteManager = !showRemoteManager"
          >
            <Cog6ToothIcon class="w-4 h-4" />
          </button>

          <!-- Remote Manager Popover -->
          <div v-if="showRemoteManager" class="absolute right-0 top-full mt-1 z-20">
            <GitRemoteManager
              :remotes="store.remotes"
              @add="handleRemoteAdd"
              @edit="handleRemoteEdit"
              @delete="handleRemoteDelete"
              @close="showRemoteManager = false"
            />
          </div>
        </div>

        <!-- Last Updated Indicator (FR-069) -->
        <div
          v-if="lastUpdatedText && props.isActive"
          class="flex items-center text-[10px] text-retro-muted"
          :class="{ 'text-retro-cyan': store.isRefreshing }"
          :title="store.lastRefreshTime ? `Last checked: ${new Date(store.lastRefreshTime).toLocaleTimeString()}` : ''"
          aria-live="polite"
          aria-atomic="true"
        >
          <span class="inline-block w-1.5 h-1.5 rounded-full mr-1" :class="store.isRefreshing ? 'bg-retro-cyan animate-pulse' : 'bg-retro-muted/50'" aria-hidden="true" />
          {{ lastUpdatedText }}
        </div>
      </div>

      <!-- Commit List (top half or full if no selection) -->
      <div
        class="flex-1 min-h-0 overflow-hidden"
        :class="{ 'max-h-[50%]': store.selectedCommit || store.isUncommittedChangesSelected }"
      >
        <GitCommitList
          ref="commitListRef"
          :commits="store.filteredCommits"
          :stashes="store.stashes"
          :selectedCommit="store.selectedCommit"
          :hasMore="store.hasMore"
          :loading="store.loading"
          :loadingMore="store.loadingMore"
          :searchQuery="store.searchQuery"
          :uncommittedChangesCount="store.uncommittedChangesCount"
          :isUncommittedChangesSelected="store.isUncommittedChangesSelected"
          :highlightBranches="highlightBranches"
          :featureHighlightBranches="featureHighlightBranches"
          :featureMergeBases="featureMergeBases"
          :previewHighlightBranches="previewHighlightBranches"
          :previewMergeBases="previewMergeBases"
          :currentBranchName="store.currentBranch?.name"
          :localBranchNames="store.localBranchNames"
          :graphStyle="store.graphStyle"
          :muteNonAncestral="store.muteNonAncestral"
          :columnVisibility="store.columnVisibility"
          @select="store.selectCommit"
          @loadMore="store.loadMoreCommits"
          @branchContextMenu="handleBranchContextMenu"
          @commitContextMenu="handleCommitContextMenu"
          @tagContextMenu="handleTagContextMenu"
          @stashContextMenu="handleStashContextMenu"
          @compareSelect="handleCompareSelect"
          @selectUncommittedChanges="store.selectUncommittedChanges"
          @scrollStart="autoRefresh.startInteraction"
          @scrollEnd="autoRefresh.endInteraction"
        />
      </div>

      <!-- Comparison View (FR-021, FR-022) — replaces detail when comparing -->
      <GitComparisonView
        v-if="store.isComparing && store.selectedCommit && store.comparisonCommit"
        :fromCommit="store.comparisonCommit"
        :toCommit="store.selectedCommit"
        :files="store.comparisonFiles"
        :stats="store.comparisonStats"
        :loading="store.comparisonLoading"
        @close="store.clearComparison"
      />

      <!-- Commit Detail Panel (bottom half when commit selected) -->
      <GitCommitDetail
        v-else-if="store.selectedCommit"
        :commit="store.selectedCommit"
        :files="store.selectedCommitFiles"
        :stats="store.selectedCommitStats"
        :loading="store.isLoadingDetails"
        :detailPosition="store.detailViewPosition"
        @close="store.clearSelection"
        @navigateToCommit="handleNavigateToCommit"
        @togglePosition="store.toggleDetailViewPosition"
        @openFileDiff="(file) => store.selectedCommit && store.openFileDiff(store.selectedCommit.hash, file)"
      />

      <!-- Uncommitted Changes Detail Panel -->
      <GitUncommittedDetail
        v-if="store.isUncommittedChangesSelected"
        :stagedFiles="store.stagedFiles"
        :unstagedFiles="store.unstagedFiles"
        :isStaging="store.isStaging"
        :isCommitting="store.isCommitting"
        @close="store.clearSelection"
        @stageFiles="(files) => store.stageFiles(files)"
        @unstageFiles="(files) => store.unstageFiles(files)"
        @stageAll="() => store.stageFiles([])"
        @unstageAll="() => store.unstageFiles([])"
        @commit="(message) => store.commitChanges(message)"
      />
    </template>

    <!-- ================================================================== -->
    <!-- Context Menus                                                       -->
    <!-- ================================================================== -->

    <!-- Branch Context Menu (FR-023) -->
    <GitBranchMenu
      v-if="branchMenu.visible"
      :branchName="branchMenu.branch"
      :isCurrentBranch="branchMenu.isCurrentBranch"
      :isLocal="branchMenu.isLocal"
      :x="branchMenu.x"
      :y="branchMenu.y"
      @close="closeBranchMenu"
      @checkout="handleBranchCheckout"
      @createBranch="handleBranchCreateBranch"
      @deleteBranch="handleBranchDelete"
      @rename="handleBranchRename"
      @merge="handleBranchMerge"
      @rebase="handleBranchRebase"
      @push="handleBranchPush"
      @pull="handleBranchPull"
      @fetch="handleBranchFetch"
      @copyName="handleBranchCopyName"
    />

    <!-- Commit Context Menu (FR-033) -->
    <GitCommitMenu
      v-if="commitMenu.visible && commitMenu.commit"
      :commit="commitMenu.commit"
      :x="commitMenu.x"
      :y="commitMenu.y"
      @close="closeCommitMenu"
      @addTag="handleCommitAddTag"
      @createBranch="handleCommitCreateBranch"
      @checkout="handleCommitCheckout"
      @cherryPick="handleCommitCherryPick"
      @revert="handleCommitRevert"
      @mergeInto="handleCommitMergeInto"
      @reset="handleCommitReset"
      @copyHash="handleCommitCopyHash"
      @copySubject="handleCommitCopySubject"
    />

    <!-- Tag Context Menu (FR-040) -->
    <GitTagMenu
      v-if="tagMenu.visible"
      :tagName="tagMenu.tag"
      :x="tagMenu.x"
      :y="tagMenu.y"
      @close="closeTagMenu"
      @viewDetails="handleTagViewDetails"
      @deleteTag="handleTagDelete"
      @pushTag="handleTagPush"
      @copyName="handleTagCopyName"
    />

    <!-- Stash Context Menu (FR-046 to FR-051) -->
    <GitStashMenu
      v-if="stashMenu.visible && stashMenu.stash"
      :stashIndex="stashMenu.stash.index"
      :stashMessage="stashMenu.stash.message"
      :x="stashMenu.x"
      :y="stashMenu.y"
      @close="closeStashMenu"
      @apply="handleStashApply"
      @pop="handleStashPop"
      @drop="handleStashDrop"
      @createBranch="handleStashCreateBranch"
      @copyName="handleStashCopyName"
      @copyHash="handleStashCopyHash"
    />

    <!-- Uncommitted Context Menu (FR-057) -->
    <GitUncommittedMenu
      v-if="uncommittedMenu.visible"
      :x="uncommittedMenu.x"
      :y="uncommittedMenu.y"
      @close="closeUncommittedMenu"
      @stash="handleUncommittedStash"
      @reset="handleUncommittedReset"
      @clean="handleUncommittedClean"
    />

    <!-- ================================================================== -->
    <!-- Dialogs                                                             -->
    <!-- ================================================================== -->

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
  </div>
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
