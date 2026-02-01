import { defineStore } from "pinia";
import type {
  GitBranch,
  GitTag,
  FileChange,
  GitLogResponse,
  GitLogCommit,
  GitShowResponse,
  GitCheckoutRequest,
  GitCheckoutResponse,
  GitStatusResponse,
  GitStatusFile,
  GitStageRequest,
  GitStageResponse,
  GitUnstageRequest,
  GitUnstageResponse,
  GitCommitRequest,
  GitCommitResponse,
  GitStash,
  GitRemote,
  GitStateResponse,
  RepositoryState,
  DialogState,
  ContextMenuState,
  FileDiffResponse,
} from "~/types/git";
import {
  extractGitErrorMessage,
  filterCommitsByBranches,
  filterCommitsByQuery,
} from "~/utils/gitGraphHelpers";

export interface GitGraphState {
  // Data
  commits: GitLogCommit[];
  branches: GitBranch[];
  tags: GitTag[];

  // Uncommitted changes (FR-025 to FR-028)
  stagedFiles: GitStatusFile[];
  unstagedFiles: GitStatusFile[];
  uncommittedChangesCount: number;

  // Selection
  selectedCommit: GitLogCommit | null;
  selectedCommitFiles: FileChange[] | null;
  selectedCommitStats: { additions: number; deletions: number; filesChanged: number } | null;
  isUncommittedChangesSelected: boolean;

  // UI State
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  totalCount: number;

  // Filter (P3)
  searchQuery: string;
  filteredBranches: string[];

  // Auto-refresh state (FR-029 to FR-035)
  lastRefreshTime: number | null;
  isPollingActive: boolean;
}

export const useGitGraphStore = defineStore("gitGraph", () => {
  // State
  const commits = ref<GitLogCommit[]>([]);
  const branches = ref<GitBranch[]>([]);
  const tags = ref<GitTag[]>([]);
  const localBranchNames = ref<Set<string>>(new Set());

  // Uncommitted changes state (FR-025 to FR-028)
  const stagedFiles = ref<GitStatusFile[]>([]);
  const unstagedFiles = ref<GitStatusFile[]>([]);
  const uncommittedChangesCount = ref(0);
  const isUncommittedChangesSelected = ref(false);

  const selectedCommit = ref<GitLogCommit | null>(null);
  const selectedCommitFiles = ref<FileChange[] | null>(null);
  const selectedCommitStats = ref<{ additions: number; deletions: number; filesChanged: number } | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const hasMore = ref(false);
  const totalCount = ref(0);
  const searchQuery = ref("");
  const filteredBranches = ref<string[]>([]);

  // Current working directory (needed for API calls)
  const workingDirectory = ref<string | null>(null);

  // Operation loading states (T048)
  const isLoadingDetails = ref(false);
  const isStaging = ref(false);
  const isCommitting = ref(false);
  const isCheckingOut = ref(false);

  // Operation error (transient, auto-cleared) (T048)
  const operationError = ref<string | null>(null);
  let operationErrorTimer: ReturnType<typeof setTimeout> | null = null;

  function setOperationError(message: string) {
    operationError.value = message;
    if (operationErrorTimer) clearTimeout(operationErrorTimer);
    operationErrorTimer = setTimeout(() => {
      operationError.value = null;
    }, 8000);
  }

  function clearOperationError() {
    operationError.value = null;
    if (operationErrorTimer) {
      clearTimeout(operationErrorTimer);
      operationErrorTimer = null;
    }
  }

  async function runGitMutation<TResponse = unknown>(
    endpoint: string,
    body: Record<string, unknown>,
    fallbackError: string,
    options?: { method?: "POST" | "PUT" | "DELETE"; reloadGraph?: boolean }
  ): Promise<{ success: boolean; data?: TResponse; error?: string }> {
    if (!workingDirectory.value) {
      return { success: false, error: "No working directory set" };
    }

    try {
      const data = await $fetch<TResponse>(endpoint, {
        method: options?.method ?? "POST",
        body: {
          workingDirectory: workingDirectory.value,
          ...body,
        },
      }) as TResponse;

      if (options?.reloadGraph ?? true) {
        await loadGitGraph(workingDirectory.value);
      }

      return { success: true, data };
    } catch (err) {
      const errorMessage = extractGitErrorMessage(err, fallbackError);
      setOperationError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // Auto-refresh state (FR-029 to FR-035)
  const lastRefreshTime = ref<number | null>(null);
  const isPollingActive = ref(false);
  const isRefreshing = ref(false);
  const repositoryState = ref<RepositoryState | null>(null);

  // New state: stashes and remotes
  const stashes = ref<GitStash[]>([]);
  const remotes = ref<GitRemote[]>([]);

  // New state: commit comparison (FR-021)
  const comparisonCommit = ref<GitLogCommit | null>(null);

  // New state: dialog & context menu (FR-065)
  const activeDialog = ref<DialogState | null>(null);
  const activeContextMenu = ref<ContextMenuState | null>(null);

  // New state: UI preferences
  const detailViewPosition = ref<'inline' | 'bottom'>('inline'); // FR-020
  const fileViewMode = ref<'tree' | 'list'>('list'); // FR-014
  const graphStyle = ref<'rounded' | 'angular'>('rounded'); // FR-002
  const muteNonAncestral = ref(false); // FR-011

  // Column visibility (FR-071)
  const columnVisibility = ref<Record<string, boolean>>({
    date: true,
    author: true,
    commit: true,
  });

  // New state: search result navigation
  const searchResultIndex = ref(0);
  const searchResultCount = ref(0);

  // Selected feature highlight (FR-095)
  const selectedFeatureId = ref<string | null>(null);
  const featureMergeBase = ref<string | null>(null);

  // Conversation branch highlight — tracks the active conversation's worktree branch
  const conversationBranch = ref<string | null>(null);
  const conversationMergeBase = ref<string | null>(null);

  // Preview branch highlight — tracks the previewing conversation's worktree branch (yellow)
  const previewBranch = ref<string | null>(null);
  const previewMergeBase = ref<string | null>(null);

  // Diff viewer state (FR-087, FR-092)
  const diffViewerFile = ref<FileChange | null>(null);
  const diffViewerCommitHash = ref<string | null>(null);
  const diffViewerContent = ref<FileDiffResponse | null>(null);
  const diffViewerLoading = ref(false);

  // Memoization cache for search results
  const searchCache = new Map<string, GitLogCommit[]>();
  const MAX_CACHE_SIZE = 10;

  // Getters with optimized filtering
  const filteredCommits = computed(() => {
    // Early return if no filters applied
    if (!searchQuery.value && filteredBranches.value.length === 0) {
      return commits.value;
    }

    let result = commits.value;

    // Filter by search query (P3) with caching
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      const cacheKey = `${query}:${commits.value.length}`;

      if (searchCache.has(cacheKey)) {
        result = searchCache.get(cacheKey)!;
      } else {
        result = filterCommitsByQuery(result, query);

        // Manage cache size
        if (searchCache.size >= MAX_CACHE_SIZE) {
          const firstKey = searchCache.keys().next().value;
          if (firstKey) searchCache.delete(firstKey);
        }
        searchCache.set(cacheKey, result);
      }
    }

    // Filter by selected branches (P3)
    if (filteredBranches.value.length > 0) {
      const branchSet = new Set(filteredBranches.value); // Use Set for O(1) lookup
      result = filterCommitsByBranches(result, branchSet);
    }

    return result;
  });

  const currentBranch = computed(() => {
    return branches.value.find((b) => b.isHead) || null;
  });

  // Actions
  async function loadGitGraph(directory: string) {
    workingDirectory.value = directory;
    loading.value = true;
    error.value = null;

    try {
      // Load commits, uncommitted changes, stashes, and remotes in parallel
      const [logResponse, statusResponse, stashesResult, remotesResult, stateResponse] = await Promise.all([
        $fetch<GitLogResponse>("/api/git/log", {
          query: { workingDirectory: directory },
        }),
        $fetch<GitStatusResponse>("/api/git/status", {
          query: { workingDirectory: directory },
        }),
        $fetch<{ stashes: GitStash[] }>("/api/git/stash", {
          query: { workingDirectory: directory },
        }).then(r => r.stashes).catch(() => [] as GitStash[]),
        $fetch<{ remotes: GitRemote[] }>("/api/git/remotes", {
          query: { workingDirectory: directory },
        }).then(r => r.remotes).catch(() => [] as GitRemote[]),
        $fetch<GitStateResponse>("/api/git/state", {
          query: { workingDirectory: directory },
        }).then(r => r.state).catch(() => null),
      ]);

      commits.value = logResponse.commits;
      branches.value = logResponse.branches;
      tags.value = logResponse.tags;
      localBranchNames.value = new Set(logResponse.localBranches ?? []);
      hasMore.value = logResponse.hasMore;
      totalCount.value = logResponse.totalCount;

      // Store uncommitted changes (FR-025, FR-026)
      stagedFiles.value = statusResponse.stagedFiles ?? [];
      unstagedFiles.value = statusResponse.unstagedFiles ?? [];
      uncommittedChangesCount.value = (statusResponse.stagedCount ?? 0) + (statusResponse.unstagedCount ?? 0);

      // Store stashes and remotes
      stashes.value = stashesResult;
      remotes.value = remotesResult;
      repositoryState.value = stateResponse;

      // Mark initial load completion time for "last updated" UI.
      lastRefreshTime.value = Date.now();

      // Refresh merge-bases for highlighted branches after graph data updates.
      await refreshHighlightMergeBases();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load git graph";
      error.value = errorMessage;
      commits.value = [];
      branches.value = [];
      tags.value = [];
      stagedFiles.value = [];
      unstagedFiles.value = [];
      uncommittedChangesCount.value = 0;
      stashes.value = [];
      remotes.value = [];
    } finally {
      loading.value = false;
    }
  }

  // Load uncommitted changes only (for refresh without full reload)
  async function refreshUncommittedChanges() {
    if (!workingDirectory.value) return;

    try {
      const statusResponse = await $fetch<GitStatusResponse>("/api/git/status", {
        query: { workingDirectory: workingDirectory.value },
      });

      stagedFiles.value = statusResponse.stagedFiles ?? [];
      unstagedFiles.value = statusResponse.unstagedFiles ?? [];
      uncommittedChangesCount.value = (statusResponse.stagedCount ?? 0) + (statusResponse.unstagedCount ?? 0);
    } catch (err) {
      console.error("Failed to refresh uncommitted changes:", err);
    }
  }

  // Separate flag for incremental loading (doesn't block initial load UI)
  const loadingMore = ref(false);

  async function loadMoreCommits() {
    if (!workingDirectory.value || !hasMore.value || loading.value || loadingMore.value) return;

    loadingMore.value = true;

    try {
      const response = await $fetch<GitLogResponse>("/api/git/log", {
        query: {
          workingDirectory: workingDirectory.value,
          offset: commits.value.length,
        },
      });

      commits.value = [...commits.value, ...response.commits];
      hasMore.value = response.hasMore;
    } catch (err) {
      console.error("Failed to load more commits:", err);
    } finally {
      loadingMore.value = false;
    }
  }

  async function selectCommit(commit: GitLogCommit) {
    selectedCommit.value = commit;
    selectedCommitFiles.value = null;
    selectedCommitStats.value = null;
    isUncommittedChangesSelected.value = false;
    isLoadingDetails.value = true;

    if (!workingDirectory.value) {
      isLoadingDetails.value = false;
      return;
    }

    try {
      const response = await $fetch<GitShowResponse>("/api/git/show", {
        query: {
          workingDirectory: workingDirectory.value,
          hash: commit.hash,
        },
      });

      selectedCommitFiles.value = response.files;
      selectedCommitStats.value = response.stats;
    } catch (err) {
      console.error("Failed to load commit details:", err);
      selectedCommitFiles.value = [];
      selectedCommitStats.value = { additions: 0, deletions: 0, filesChanged: 0 };
      setOperationError("Failed to load commit details");
    } finally {
      isLoadingDetails.value = false;
    }
  }

  function clearSelection() {
    selectedCommit.value = null;
    selectedCommitFiles.value = null;
    selectedCommitStats.value = null;
    isUncommittedChangesSelected.value = false;
  }

  // Select uncommitted changes row (FR-027)
  function selectUncommittedChanges() {
    // Clear commit selection
    selectedCommit.value = null;
    selectedCommitStats.value = null;
    selectedCommitFiles.value = null;
    isUncommittedChangesSelected.value = true;
  }

  // P3: Search and Filter
  function setSearchQuery(query: string) {
    searchQuery.value = query;
    // Reset search navigation when query changes
    searchResultIndex.value = 0;
    updateSearchResultCount();
  }

  // Search result hashes for navigation (FR-059)
  const searchResultHashes = computed<string[]>(() => {
    if (!searchQuery.value) return [];
    return filterCommitsByQuery(commits.value, searchQuery.value).map(c => c.hash);
  });

  function updateSearchResultCount() {
    searchResultCount.value = searchResultHashes.value.length;
  }

  function nextSearchResult() {
    if (searchResultHashes.value.length === 0) return;
    searchResultIndex.value = (searchResultIndex.value + 1) % searchResultHashes.value.length;
    updateSearchResultCount();
    navigateToSearchResult();
  }

  function prevSearchResult() {
    if (searchResultHashes.value.length === 0) return;
    searchResultIndex.value = searchResultIndex.value <= 0
      ? searchResultHashes.value.length - 1
      : searchResultIndex.value - 1;
    updateSearchResultCount();
    navigateToSearchResult();
  }

  function navigateToSearchResult() {
    const hash = searchResultHashes.value[searchResultIndex.value];
    if (hash) {
      const commit = commits.value.find(c => c.hash === hash);
      if (commit) {
        selectCommit(commit);
      }
    }
  }

  function toggleBranchFilter(branchName: string) {
    const index = filteredBranches.value.indexOf(branchName);
    if (index === -1) {
      filteredBranches.value.push(branchName);
    } else {
      filteredBranches.value.splice(index, 1);
    }
  }

  function clearFilters() {
    searchQuery.value = "";
    filteredBranches.value = [];
  }

  // P2: Branch operations
  async function checkoutBranch(branchName: string): Promise<{ success: boolean; error?: string }> {
    if (!workingDirectory.value) {
      return { success: false, error: "No working directory set" };
    }

    isCheckingOut.value = true;
    try {
      const response = await $fetch<GitCheckoutResponse>("/api/git/checkout", {
        method: "POST",
        body: {
          workingDirectory: workingDirectory.value,
          branchName,
        } satisfies GitCheckoutRequest,
      });

      if (response.success) {
        // Reload the graph to reflect the new HEAD
        await loadGitGraph(workingDirectory.value);
      }

      return { success: response.success, error: response.error };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to checkout branch";
      setOperationError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      isCheckingOut.value = false;
    }
  }

  async function createBranch(branchName: string, fromCommit?: string): Promise<{ success: boolean; error?: string }> {
    if (!workingDirectory.value) {
      return { success: false, error: "No working directory set" };
    }

    try {
      const response = await $fetch<GitCheckoutResponse>("/api/git/checkout", {
        method: "POST",
        body: {
          workingDirectory: workingDirectory.value,
          branchName,
          createBranch: true,
          fromCommit,
        } satisfies GitCheckoutRequest,
      });

      if (response.success) {
        // Reload the graph to reflect the new branch
        await loadGitGraph(workingDirectory.value);
      }

      return { success: response.success, error: response.error };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create branch";
      return { success: false, error: errorMessage };
    }
  }

  // Delete local branch
  async function deleteLocalBranch(branchName: string, force: boolean = false): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/branch", { branchName, force }, "Failed to delete branch", { method: "DELETE" });
  }

  // Delete remote branch (e.g., "origin/feature" -> git push origin --delete feature)
  async function deleteRemoteBranch(branchName: string): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/branch", { branchName, remote: true }, "Failed to delete remote branch", { method: "DELETE" });
  }

  // Stage files
  async function stageFiles(files: string[]): Promise<{ success: boolean; error?: string }> {
    if (!workingDirectory.value) {
      return { success: false, error: "No working directory set" };
    }

    isStaging.value = true;
    try {
      await $fetch<GitStageResponse>("/api/git/stage", {
        method: "POST",
        body: {
          workingDirectory: workingDirectory.value,
          files,
        } satisfies GitStageRequest,
      });

      await refreshUncommittedChanges();
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to stage files";
      setOperationError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      isStaging.value = false;
    }
  }

  // Unstage files
  async function unstageFiles(files: string[]): Promise<{ success: boolean; error?: string }> {
    if (!workingDirectory.value) {
      return { success: false, error: "No working directory set" };
    }

    isStaging.value = true;
    try {
      await $fetch<GitUnstageResponse>("/api/git/unstage", {
        method: "POST",
        body: {
          workingDirectory: workingDirectory.value,
          files,
        } satisfies GitUnstageRequest,
      });

      await refreshUncommittedChanges();
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to unstage files";
      setOperationError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      isStaging.value = false;
    }
  }

  // Commit staged changes
  async function commitChanges(message: string): Promise<{ success: boolean; error?: string }> {
    if (!workingDirectory.value) {
      return { success: false, error: "No working directory set" };
    }

    isCommitting.value = true;
    try {
      await $fetch<GitCommitResponse>("/api/git/commit", {
        method: "POST",
        body: {
          workingDirectory: workingDirectory.value,
          message,
        } satisfies GitCommitRequest,
      });

      // Full reload to show the new commit in the graph
      await loadGitGraph(workingDirectory.value);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to commit changes";
      setOperationError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      isCommitting.value = false;
    }
  }

  // ============================================================================
  // New Branch Operations
  // ============================================================================

  async function renameBranch(oldName: string, newName: string): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/branch-rename", { oldName, newName }, "Failed to rename branch");
  }

  async function mergeBranch(branch: string, options?: { noCommit?: boolean; noFastForward?: boolean; squash?: boolean }): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/merge", { branch, ...options }, "Failed to merge branch");
  }

  async function rebaseBranch(onto: string): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/rebase", { onto }, "Failed to rebase branch");
  }

  async function pushBranch(branch: string, remote?: string, force?: boolean, forceWithLease?: boolean): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/push", { branch, remote, force, forceWithLease }, "Failed to push branch");
  }

  async function pullBranch(branch: string, remote?: string, noFastForward?: boolean, squash?: boolean): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/pull", { branch, remote, noFastForward, squash }, "Failed to pull branch");
  }

  async function fetchBranch(branch?: string, remote?: string, options?: { force?: boolean }): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/fetch", { branch, remote, ...options }, "Failed to fetch");
  }

  // ============================================================================
  // New Commit Operations
  // ============================================================================

  async function cherryPickCommit(hash: string, recordOrigin?: boolean, noCommit?: boolean): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/cherry-pick", { hash, recordOrigin, noCommit }, "Failed to cherry-pick commit");
  }

  async function revertCommit(hash: string): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/revert", { hash }, "Failed to revert commit");
  }

  async function resetToCommit(hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/reset", { hash, mode }, "Failed to reset to commit");
  }

  async function checkoutCommit(hash: string): Promise<{ success: boolean; error?: string }> {
    if (!workingDirectory.value) return { success: false, error: "No working directory set" };
    try {
      await $fetch<GitCheckoutResponse>("/api/git/checkout", {
        method: "POST",
        body: {
          workingDirectory: workingDirectory.value,
          branchName: hash,
        } satisfies GitCheckoutRequest,
      });
      await loadGitGraph(workingDirectory.value);
      return { success: true };
    } catch (err: any) {
      const errorMessage = err?.data?.message || err?.statusMessage || err?.message || "Failed to checkout commit";
      setOperationError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async function copyCommitSubject(commit: GitLogCommit): Promise<{ success: boolean; error?: string }> {
    try {
      const subject = commit.message.split('\n')[0];
      await copyToClipboard(subject);
      return { success: true };
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to copy commit subject";
      setOperationError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // ============================================================================
  // New Tag Operations
  // ============================================================================

  async function createTag(name: string, hash: string, annotated?: boolean, message?: string, pushToRemote?: string): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/tag", { name, hash, annotated, message, pushToRemote }, "Failed to create tag");
  }

  async function deleteTag(name: string, deleteFromRemote?: string): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/tag", { name, deleteFromRemote }, "Failed to delete tag", { method: "DELETE" });
  }

  async function pushTag(name: string, remote?: string): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/tag-push", { name, remote }, "Failed to push tag");
  }

  async function getTagDetail(name: string): Promise<{ success: boolean; data?: GitTag; error?: string }> {
    if (!workingDirectory.value) return { success: false, error: "No working directory set" };
    try {
      const data = await $fetch<GitTag>(`/api/git/tag/${encodeURIComponent(name)}`, {
        query: { workingDirectory: workingDirectory.value },
      });
      return { success: true, data };
    } catch (err: any) {
      const errorMessage = extractGitErrorMessage(err, "Failed to get tag detail");
      setOperationError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async function copyTagName(name: string): Promise<{ success: boolean; error?: string }> {
    try {
      await copyToClipboard(name);
      return { success: true };
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to copy tag name";
      setOperationError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // ============================================================================
  // New Stash Operations
  // ============================================================================

  async function loadStashes(): Promise<{ success: boolean; error?: string }> {
    if (!workingDirectory.value) return { success: false, error: "No working directory set" };
    try {
      const data = await $fetch<{ stashes: GitStash[] }>("/api/git/stash", {
        query: { workingDirectory: workingDirectory.value },
      });
      stashes.value = data.stashes;
      return { success: true };
    } catch (err: any) {
      const errorMessage = extractGitErrorMessage(err, "Failed to load stashes");
      setOperationError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async function applyStash(index: number, reinstateIndex?: boolean): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/stash-apply", { index, reinstateIndex }, "Failed to apply stash");
  }

  async function popStash(index: number, reinstateIndex?: boolean): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/stash-pop", { index, reinstateIndex }, "Failed to pop stash");
  }

  async function dropStash(index: number): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/stash-drop", { index }, "Failed to drop stash");
  }

  async function stashBranch(index: number, branchName: string): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/stash-branch", { index, branchName }, "Failed to create branch from stash");
  }

  async function stashChanges(message?: string, includeUntracked?: boolean): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/stash", { message, includeUntracked }, "Failed to stash changes");
  }

  // ============================================================================
  // New Remote Operations
  // ============================================================================

  async function loadRemotes(): Promise<{ success: boolean; error?: string }> {
    if (!workingDirectory.value) return { success: false, error: "No working directory set" };
    try {
      const data = await $fetch<{ remotes: GitRemote[] }>("/api/git/remotes", {
        query: { workingDirectory: workingDirectory.value },
      });
      remotes.value = data.remotes;
      return { success: true };
    } catch (err: any) {
      const errorMessage = extractGitErrorMessage(err, "Failed to load remotes");
      setOperationError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async function addRemote(name: string, url: string): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/remote", { name, url }, "Failed to add remote");
  }

  async function editRemote(name: string, newUrl: string): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/remote", { name, newUrl }, "Failed to edit remote", { method: "PUT" });
  }

  async function deleteRemote(name: string): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/remote", { name }, "Failed to delete remote", { method: "DELETE" });
  }

  async function fetchAll(prune?: boolean, pruneTags?: boolean): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/fetch", { all: true, prune, pruneTags }, "Failed to fetch all");
  }

  // ============================================================================
  // New UI State Actions
  // ============================================================================

  function toggleDetailViewPosition() {
    detailViewPosition.value = detailViewPosition.value === 'inline' ? 'bottom' : 'inline';
  }

  function toggleFileViewMode() {
    fileViewMode.value = fileViewMode.value === 'list' ? 'tree' : 'list';
  }

  function setGraphStyle(style: 'rounded' | 'angular') {
    graphStyle.value = style;
  }

  function toggleMuteNonAncestral() {
    muteNonAncestral.value = !muteNonAncestral.value;
  }

  function toggleColumnVisibility(column: string) {
    columnVisibility.value = {
      ...columnVisibility.value,
      [column]: !columnVisibility.value[column],
    };
  }

  async function setSelectedFeatureId(id: string | null) {
    selectedFeatureId.value = id;
    featureMergeBase.value = null;

    if (id && workingDirectory.value) {
      try {
        const data = await $fetch<{ mergeBase: string | null }>('/api/git/merge-base', {
          params: {
            workingDirectory: workingDirectory.value,
            branch: id,
          }
        });
        featureMergeBase.value = data.mergeBase;
      } catch {
        featureMergeBase.value = null;
      }
    }
  }

  async function setConversationBranch(branch: string | null) {
    conversationBranch.value = branch;
    conversationMergeBase.value = null;

    if (branch && workingDirectory.value) {
      try {
        const data = await $fetch<{ mergeBase: string | null }>('/api/git/merge-base', {
          params: {
            workingDirectory: workingDirectory.value,
            branch,
          }
        });
        conversationMergeBase.value = data.mergeBase;
      } catch {
        conversationMergeBase.value = null;
      }
    }
  }

  async function setPreviewBranch(branch: string | null) {
    previewBranch.value = branch;
    previewMergeBase.value = null;

    if (branch && workingDirectory.value) {
      try {
        const data = await $fetch<{ mergeBase: string | null }>('/api/git/merge-base', {
          params: {
            workingDirectory: workingDirectory.value,
            branch,
          }
        });
        previewMergeBase.value = data.mergeBase;
      } catch {
        previewMergeBase.value = null;
      }
    }
  }

  async function refreshHighlightMergeBases() {
    if (!workingDirectory.value) return;

    const requests: Promise<void>[] = [];

    if (selectedFeatureId.value) {
      requests.push((async () => {
        try {
          const data = await $fetch<{ mergeBase: string | null }>('/api/git/merge-base', {
            params: {
              workingDirectory: workingDirectory.value!,
              branch: selectedFeatureId.value!,
            }
          });
          featureMergeBase.value = data.mergeBase;
        } catch {
          featureMergeBase.value = null;
        }
      })());
    }

    if (conversationBranch.value) {
      requests.push((async () => {
        try {
          const data = await $fetch<{ mergeBase: string | null }>('/api/git/merge-base', {
            params: {
              workingDirectory: workingDirectory.value!,
              branch: conversationBranch.value!,
            }
          });
          conversationMergeBase.value = data.mergeBase;
        } catch {
          conversationMergeBase.value = null;
        }
      })());
    }

    if (previewBranch.value) {
      requests.push((async () => {
        try {
          const data = await $fetch<{ mergeBase: string | null }>('/api/git/merge-base', {
            params: {
              workingDirectory: workingDirectory.value!,
              branch: previewBranch.value!,
            }
          });
          previewMergeBase.value = data.mergeBase;
        } catch {
          previewMergeBase.value = null;
        }
      })());
    }

    if (requests.length > 0) {
      await Promise.all(requests);
    }
  }

  function navigateToCommit(hash: string) {
    const commit = commits.value.find(c => c.hash === hash || c.shortHash === hash);
    if (commit) {
      selectCommit(commit);
    }
  }

  async function resetWorking(mode: 'mixed' | 'hard'): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/reset", { hash: "HEAD", mode }, "Failed to reset working directory");
  }

  async function cleanUntracked(): Promise<{ success: boolean; error?: string }> {
    return runGitMutation("/api/git/clean", {}, "Failed to clean untracked files");
  }

  function setActiveDialog(state: DialogState) {
    activeDialog.value = state;
  }

  function clearActiveDialog() {
    activeDialog.value = null;
  }

  function setActiveContextMenu(state: ContextMenuState) {
    activeContextMenu.value = state;
  }

  function clearActiveContextMenu() {
    activeContextMenu.value = null;
  }

  // Comparison state (FR-021, FR-022)
  const comparisonFiles = ref<Array<{ path: string; oldPath?: string; status: string; additions: number; deletions: number; binary: boolean }> | null>(null);
  const comparisonStats = ref<{ filesChanged: number; additions: number; deletions: number } | null>(null);
  const comparisonLoading = ref(false);

  const isComparing = computed(() => !!comparisonCommit.value && !!selectedCommit.value);

  function selectComparisonCommit(commit: GitLogCommit | null) {
    comparisonCommit.value = commit;
    if (commit && selectedCommit.value) {
      loadComparisonData();
    }
  }

  function clearComparison() {
    comparisonCommit.value = null;
    comparisonFiles.value = null;
    comparisonStats.value = null;
    comparisonLoading.value = false;
  }

  async function loadComparisonData() {
    if (!workingDirectory.value || !selectedCommit.value || !comparisonCommit.value) return;
    comparisonLoading.value = true;
    try {
      const from = comparisonCommit.value.hash;
      const to = selectedCommit.value.hash;
      const data = await $fetch<{
        files: Array<{ path: string; oldPath?: string; status: string; additions: number; deletions: number; binary: boolean }>;
        stats: { filesChanged: number; additions: number; deletions: number };
      }>("/api/git/diff", {
        query: { workingDirectory: workingDirectory.value, from, to },
      });
      comparisonFiles.value = data.files;
      comparisonStats.value = data.stats;
    } catch (err) {
      console.error("Failed to load comparison:", err);
      setOperationError("Failed to load commit comparison");
      comparisonFiles.value = null;
      comparisonStats.value = null;
    } finally {
      comparisonLoading.value = false;
    }
  }

  async function copyToClipboard(text: string): Promise<void> {
    if (import.meta.client && navigator?.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  }

  // ============================================================================
  // Diff Viewer Actions (FR-087, FR-092)
  // ============================================================================

  async function openFileDiff(commitHash: string, file: FileChange) {
    diffViewerFile.value = file;
    diffViewerCommitHash.value = commitHash;
    diffViewerContent.value = null;
    diffViewerLoading.value = true;

    await loadFileDiffContent();
  }

  function closeFileDiff() {
    diffViewerFile.value = null;
    diffViewerCommitHash.value = null;
    diffViewerContent.value = null;
    diffViewerLoading.value = false;
  }

  async function loadFileDiffContent() {
    if (!workingDirectory.value || !diffViewerCommitHash.value || !diffViewerFile.value) {
      diffViewerLoading.value = false;
      return;
    }

    diffViewerLoading.value = true;
    try {
      const response = await $fetch<FileDiffResponse>("/api/git/file-diff", {
        query: {
          workingDirectory: workingDirectory.value,
          commitHash: diffViewerCommitHash.value,
          filePath: diffViewerFile.value.path,
        },
      });
      diffViewerContent.value = response;
    } catch (err) {
      console.error("Failed to load file diff:", err);
      setOperationError("Failed to load file diff");
      diffViewerContent.value = null;
    } finally {
      diffViewerLoading.value = false;
    }
  }

  function reset() {
    commits.value = [];
    branches.value = [];
    tags.value = [];
    localBranchNames.value = new Set();
    stagedFiles.value = [];
    unstagedFiles.value = [];
    uncommittedChangesCount.value = 0;
    isUncommittedChangesSelected.value = false;
    selectedCommit.value = null;
    selectedCommitFiles.value = null;
    selectedCommitStats.value = null;
    loading.value = false;
    error.value = null;
    hasMore.value = false;
    totalCount.value = 0;
    searchQuery.value = "";
    filteredBranches.value = [];
    workingDirectory.value = null;
    lastRefreshTime.value = null;
    isPollingActive.value = false;
    isRefreshing.value = false;
    repositoryState.value = null;
    loadingMore.value = false;
    isLoadingDetails.value = false;
    isStaging.value = false;
    isCommitting.value = false;
    isCheckingOut.value = false;
    stashes.value = [];
    remotes.value = [];
    comparisonCommit.value = null;
    comparisonFiles.value = null;
    comparisonStats.value = null;
    comparisonLoading.value = false;
    activeDialog.value = null;
    activeContextMenu.value = null;
    detailViewPosition.value = 'inline';
    fileViewMode.value = 'list';
    graphStyle.value = 'rounded';
    muteNonAncestral.value = false;
    columnVisibility.value = { date: true, author: true, commit: true };
    searchResultIndex.value = 0;
    searchResultCount.value = 0;
    selectedFeatureId.value = null;
    conversationBranch.value = null;
    conversationMergeBase.value = null;
    previewBranch.value = null;
    previewMergeBase.value = null;
    diffViewerFile.value = null;
    diffViewerCommitHash.value = null;
    diffViewerContent.value = null;
    diffViewerLoading.value = false;
    clearOperationError();
    searchCache.clear(); // Clear search cache on reset
  }

  // ============================================================================
  // Auto-Refresh (FR-029 to FR-035)
  // ============================================================================

  /**
   * Refresh graph data after an auto-refresh trigger.
   * Returns true if refresh was performed.
   */
  async function checkAndRefresh(): Promise<boolean> {
    if (!workingDirectory.value || isRefreshing.value || loading.value) {
      return false;
    }
    isRefreshing.value = true;

    try {
      const nextState = (await $fetch<GitStateResponse>("/api/git/state", {
        query: { workingDirectory: workingDirectory.value },
      })).state;

      const prevState = repositoryState.value;
      repositoryState.value = nextState;
      // Keep "last checked" indicator fresh even when no data changed.
      lastRefreshTime.value = Date.now();

      if (!prevState) {
        return false;
      }

      const graphChanged =
        prevState.headCommit !== nextState.headCommit ||
        prevState.branchListHash !== nextState.branchListHash;
      const worktreeChanged = prevState.workingTreeHash !== nextState.workingTreeHash;
      const stashChanged = prevState.stashListHash !== nextState.stashListHash;

      if (graphChanged) {
        const [logResponse, statusResponse, stashesResult] = await Promise.all([
          $fetch<GitLogResponse>("/api/git/log", {
            query: { workingDirectory: workingDirectory.value },
          }),
          $fetch<GitStatusResponse>("/api/git/status", {
            query: { workingDirectory: workingDirectory.value },
          }),
          $fetch<{ stashes: GitStash[] }>("/api/git/stash", {
            query: { workingDirectory: workingDirectory.value },
          }).then(r => r.stashes).catch(() => [] as GitStash[]),
        ]);

        commits.value = logResponse.commits;
        branches.value = logResponse.branches;
        tags.value = logResponse.tags;
        localBranchNames.value = new Set(logResponse.localBranches ?? []);
        hasMore.value = logResponse.hasMore;
        totalCount.value = logResponse.totalCount;
        stagedFiles.value = statusResponse.stagedFiles ?? [];
        unstagedFiles.value = statusResponse.unstagedFiles ?? [];
        uncommittedChangesCount.value = (statusResponse.stagedCount ?? 0) + (statusResponse.unstagedCount ?? 0);
        stashes.value = stashesResult;
        await refreshHighlightMergeBases();
        return true;
      }

      if (!worktreeChanged && !stashChanged) {
        return false;
      }

      const [statusResponse, stashesResult] = await Promise.all([
        worktreeChanged
          ? $fetch<GitStatusResponse>("/api/git/status", {
              query: { workingDirectory: workingDirectory.value },
            })
          : Promise.resolve(null),
        stashChanged
          ? $fetch<{ stashes: GitStash[] }>("/api/git/stash", {
              query: { workingDirectory: workingDirectory.value },
            }).then(r => r.stashes).catch(() => [] as GitStash[])
          : Promise.resolve(null),
      ]);

      if (statusResponse) {
        stagedFiles.value = statusResponse.stagedFiles ?? [];
        unstagedFiles.value = statusResponse.unstagedFiles ?? [];
        uncommittedChangesCount.value = (statusResponse.stagedCount ?? 0) + (statusResponse.unstagedCount ?? 0);
      }

      if (stashesResult) {
        stashes.value = stashesResult;
      }

      return true;
    } catch (err) {
      console.error("Failed to refresh git graph:", err);
      return false;
    } finally {
      isRefreshing.value = false;
    }
  }

  /**
   * Start polling for changes (FR-029).
   */
  function startPolling() {
    isPollingActive.value = true;
  }

  /**
   * Stop polling for changes (FR-033).
   */
  function stopPolling() {
    isPollingActive.value = false;
  }

  return {
    // State
    commits: readonly(commits),
    branches: readonly(branches),
    tags: readonly(tags),
    localBranchNames: readonly(localBranchNames),
    stagedFiles: readonly(stagedFiles),
    unstagedFiles: readonly(unstagedFiles),
    uncommittedChangesCount: readonly(uncommittedChangesCount),
    isUncommittedChangesSelected: readonly(isUncommittedChangesSelected),
    selectedCommit: readonly(selectedCommit),
    selectedCommitFiles: readonly(selectedCommitFiles),
    selectedCommitStats: readonly(selectedCommitStats),
    loading: readonly(loading),
    loadingMore: readonly(loadingMore),
    error: readonly(error),
    hasMore: readonly(hasMore),
    totalCount: readonly(totalCount),
    searchQuery: readonly(searchQuery),
    filteredBranches: readonly(filteredBranches),
    workingDirectory: readonly(workingDirectory),

    // New state (readonly)
    stashes: readonly(stashes),
    remotes: readonly(remotes),
    comparisonCommit: readonly(comparisonCommit),
    comparisonFiles: readonly(comparisonFiles),
    comparisonStats: readonly(comparisonStats),
    comparisonLoading: readonly(comparisonLoading),
    isComparing,
    activeDialog: readonly(activeDialog),
    activeContextMenu: readonly(activeContextMenu),
    detailViewPosition: readonly(detailViewPosition),
    fileViewMode: readonly(fileViewMode),
    graphStyle: readonly(graphStyle),
    muteNonAncestral: readonly(muteNonAncestral),
    columnVisibility: readonly(columnVisibility),
    searchResultIndex: readonly(searchResultIndex),
    searchResultCount: readonly(searchResultCount),
    selectedFeatureId: readonly(selectedFeatureId),
    featureMergeBase: readonly(featureMergeBase),
    conversationBranch: readonly(conversationBranch),
    conversationMergeBase: readonly(conversationMergeBase),
    previewBranch: readonly(previewBranch),
    previewMergeBase: readonly(previewMergeBase),

    // Diff viewer state (FR-087, FR-092)
    diffViewerFile: readonly(diffViewerFile),
    diffViewerCommitHash: readonly(diffViewerCommitHash),
    diffViewerContent: readonly(diffViewerContent),
    diffViewerLoading: readonly(diffViewerLoading),

    // Auto-refresh state (FR-029 to FR-035)
    lastRefreshTime: readonly(lastRefreshTime),
    isPollingActive: readonly(isPollingActive),
    isRefreshing: readonly(isRefreshing),

    // Operation loading states (T048)
    isLoadingDetails: readonly(isLoadingDetails),
    isStaging: readonly(isStaging),
    isCommitting: readonly(isCommitting),
    isCheckingOut: readonly(isCheckingOut),
    operationError: readonly(operationError),

    // Getters
    filteredCommits,
    currentBranch,

    // Search result navigation (FR-059)
    searchResultHashes,

    // Actions
    loadGitGraph,
    loadMoreCommits,
    refreshUncommittedChanges,
    selectCommit,
    selectUncommittedChanges,
    clearSelection,
    setSearchQuery,
    toggleBranchFilter,
    clearFilters,
    nextSearchResult,
    prevSearchResult,
    checkoutBranch,
    createBranch,
    deleteLocalBranch,
    deleteRemoteBranch,
    stageFiles,
    unstageFiles,
    commitChanges,
    reset,
    clearOperationError,

    // New branch operations
    renameBranch,
    mergeBranch,
    rebaseBranch,
    pushBranch,
    pullBranch,
    fetchBranch,

    // New commit operations
    cherryPickCommit,
    revertCommit,
    resetToCommit,
    checkoutCommit,
    copyCommitSubject,

    // New tag operations
    createTag,
    deleteTag,
    pushTag,
    getTagDetail,
    copyTagName,

    // New stash operations
    loadStashes,
    applyStash,
    popStash,
    dropStash,
    stashBranch,
    stashChanges,

    // New remote operations
    loadRemotes,
    addRemote,
    editRemote,
    deleteRemote,
    fetchAll,

    // New UI state actions
    setActiveDialog,
    clearActiveDialog,
    setActiveContextMenu,
    clearActiveContextMenu,
    selectComparisonCommit,
    clearComparison,
    loadComparisonData,
    copyToClipboard,
    toggleDetailViewPosition,
    toggleFileViewMode,
    setGraphStyle,
    toggleMuteNonAncestral,
    toggleColumnVisibility,
    navigateToCommit,
    resetWorking,
    cleanUntracked,
    setSelectedFeatureId,
    setConversationBranch,
    setPreviewBranch,

    // Diff viewer actions (FR-087, FR-092)
    openFileDiff,
    closeFileDiff,

    // Auto-refresh actions (FR-029 to FR-035)
    checkAndRefresh,
    startPolling,
    stopPolling,
  };
});
