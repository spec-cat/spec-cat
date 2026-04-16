<script setup lang="ts">
import { useGitGraphStore } from "~/stores/gitGraph";
import { useChatStore } from "~/stores/chat";
import { useAutoRefresh } from "~/composables/useAutoRefresh";
import { useKeyboardShortcuts } from "~/composables/useKeyboardShortcuts";
import { useGitDialogs } from "~/composables/useGitDialogs";
import { useGitContextMenus } from "~/composables/useGitContextMenus";
import { ExclamationTriangleIcon, MagnifyingGlassIcon, FunnelIcon, XMarkIcon, ArrowPathIcon, CloudArrowDownIcon, Cog6ToothIcon, AdjustmentsHorizontalIcon } from "@heroicons/vue/24/outline";
import type { Branch, GitLogCommit } from "~/types/git";
import GitGraphDialogs from "~/components/git/GitGraphDialogs.vue";
import { buildMergeBaseMap } from "~/utils/gitMergeBase";

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
const dialogs = useGitDialogs(store);
const menus = useGitContextMenus(store, dialogs);

// Destructure for template access
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
  isAnyDialogOpen,
} = dialogs;

const {
  copyFeedback,
  branchMenu, handleBranchContextMenu, closeBranchMenu,
  handleBranchCheckout, handleBranchRename, handleBranchDelete,
  handleBranchMerge, handleBranchRebase, handleBranchPush, handleBranchPull,
  handleBranchFetch, handleBranchCopyName, handleBranchCreateBranch,
  commitMenu, handleCommitContextMenu, closeCommitMenu,
  handleCommitAddTag, handleCommitCreateBranch, handleCommitCheckout,
  handleCommitCherryPick, handleCommitRevert, handleCommitMergeInto,
  handleCommitReset, handleCommitCopyHash, handleCommitCopySubject,
  tagMenu, handleTagContextMenu, closeTagMenu,
  handleTagViewDetails, handleTagDelete, handleTagPush, handleTagCopyName,
  uncommittedMenu, handleUncommittedContextMenu, closeUncommittedMenu,
  handleUncommittedStash, handleUncommittedReset, handleUncommittedClean,
  stashMenu, handleStashContextMenu, closeStashMenu,
  handleStashApply, handleStashPop, handleStashDrop,
  handleStashCreateBranch, handleStashCopyName, handleStashCopyHash,
} = menus;

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
  () => [chatStore.activeConversation?.worktreeBranch, chatStore.activeConversation?.baseBranch] as const,
  ([branch, baseBranch]) => {
    store.setConversationBranch(branch ?? null, baseBranch ?? null);
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
  () => [chatStore.previewingConversation?.worktreeBranch, chatStore.previewingConversation?.baseBranch] as const,
  ([branch, baseBranch]) => {
    store.setPreviewBranch(branch ?? null, baseBranch ?? null);
  },
  { immediate: true }
);

const previewMergeBases = computed(() =>
  buildMergeBaseMap([{ branch: store.previewBranch, mergeBase: store.previewMergeBase }])
);

const featureMergeBases = computed(() =>
  buildMergeBaseMap([
    { branch: store.selectedFeatureId, mergeBase: store.featureMergeBase },
    { branch: store.conversationBranch, mergeBase: store.conversationMergeBase },
  ])
);

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
        await store.setPreviewBranch(previewBranch, chatStore.previewingConversation?.baseBranch ?? null);
      }
      const convBranch = chatStore.activeConversation?.worktreeBranch;
      if (convBranch) {
        await store.setConversationBranch(convBranch, chatStore.activeConversation?.baseBranch ?? null);
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

const TIMESTAMP_REFRESH_INTERVAL = 5000;
const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;

const startTimeUpdates = () => {
  if (nowTimer) return;
  nowTimer = setInterval(() => {
    now.value = Date.now();
  }, TIMESTAMP_REFRESH_INTERVAL);
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
// Dialog Registration for Auto-Refresh Deferral (FR-065, T115)
// ============================================================================
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
          aria-label="Find"
          title="Find"
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
          aria-label="Refresh"
          title="Refresh"
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

    <!-- Dialogs + toasts (extracted) -->
    <GitGraphDialogs
      :dialogs="dialogs"
      :store="store"
      :remoteNames="remoteNames"
      :copyFeedback="copyFeedback"
    />

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
