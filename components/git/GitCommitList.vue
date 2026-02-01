<script setup lang="ts">
import type { GitLogCommit, GitStash, GraphRowData } from "~/types/git";
import { GRAPH_CONSTANTS } from "~/types/git";
import { useGitGraph } from "~/composables/useGitGraph";
import { ExclamationCircleIcon, ArchiveBoxIcon } from "@heroicons/vue/24/outline";

interface Props {
  commits: readonly GitLogCommit[];
  stashes?: readonly GitStash[];
  selectedCommit: GitLogCommit | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore?: boolean;
  searchQuery?: string;
  uncommittedChangesCount?: number;
  isUncommittedChangesSelected?: boolean;
  highlightBranches?: string[];
  featureHighlightBranches?: string[];
  featureMergeBases?: Record<string, string>;
  previewHighlightBranches?: string[];
  previewMergeBases?: Record<string, string>;
  currentBranchName?: string;
  localBranchNames: ReadonlySet<string>;
  graphStyle?: 'rounded' | 'angular';
  muteNonAncestral?: boolean;
  columnVisibility?: Record<string, boolean>;
}

const props = withDefaults(defineProps<Props>(), {
  graphStyle: 'rounded',
});

const emit = defineEmits<{
  (e: "select", commit: GitLogCommit): void;
  (e: "compareSelect", commit: GitLogCommit): void;
  (e: "loadMore"): void;
  (e: "branchContextMenu", data: { branch: string; x: number; y: number; isCurrentBranch: boolean; isLocal: boolean; commitHash: string }): void;
  (e: "commitContextMenu", data: { commit: GitLogCommit; x: number; y: number }): void;
  (e: "tagContextMenu", data: { tag: string; x: number; y: number; commitHash: string }): void;
  (e: "stashContextMenu", data: { stash: GitStash; x: number; y: number }): void;
  (e: "selectUncommittedChanges"): void;
  (e: "scrollStart"): void;
  (e: "scrollEnd"): void;
}>();

function handleUncommittedChangesClick() {
  emit("selectUncommittedChanges");
}

function handleUncommittedChangesKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    emit("selectUncommittedChanges");
  }
}

const searchQueryLower = computed(() => props.searchQuery?.toLowerCase() ?? "");
const highlightedBranchSet = computed(() => new Set(props.highlightBranches ?? []));
const hasHighlightedBranches = computed(() => highlightedBranchSet.value.size > 0);

const searchHighlightedHashes = computed<Set<string>>(() => {
  const query = searchQueryLower.value;
  if (!query) return new Set();
  const result = new Set<string>();
  for (const commit of props.commits) {
    if (
      commit.message.toLowerCase().includes(query) ||
      commit.author.toLowerCase().includes(query) ||
      commit.shortHash.toLowerCase().includes(query) ||
      commit.hash.toLowerCase().includes(query) ||
      commit.branches.some(b => b.toLowerCase().includes(query)) ||
      commit.tags.some(t => t.toLowerCase().includes(query))
    ) {
      result.add(commit.hash);
    }
  }
  return result;
});

const branchHighlightedHashes = computed<Set<string>>(() => {
  if (!hasHighlightedBranches.value) return new Set();
  const result = new Set<string>();
  for (const commit of props.commits) {
    if (commit.branches.some(b => highlightedBranchSet.value.has(b))) {
      result.add(commit.hash);
    }
  }
  return result;
});

// Compute the set of commit hashes belonging to the feature/conversation branch (FR-095)
// Uses server-computed merge-bases to walk from each branch tip down to its fork point.
const featureHighlightHashes = computed<Set<string>>(() => {
  if (!props.featureHighlightBranches || props.featureHighlightBranches.length === 0) {
    return new Set();
  }

  const mergeBases = props.featureMergeBases ?? {};

  const commitMap = new Map<string, GitLogCommit>();
  for (const c of props.commits) {
    commitMap.set(c.hash, c);
  }

  const result = new Set<string>();

  for (const branchName of props.featureHighlightBranches) {
    // Find the tip commit — the one with this branch ref attached
    const tipCommit = props.commits.find(c => c.branches.includes(branchName));
    if (!tipCommit) continue;

    const mergeBase = mergeBases[branchName] ?? null;
    // Skip if merge-base not yet computed (async fetch in progress) to avoid highlighting all commits
    if (!mergeBase) continue;

    // Walk first-parent chain from tip, stop at merge-base (exclusive)
    let cur: GitLogCommit | undefined = tipCommit;
    while (cur) {
      // Stop at merge-base commit (don't include it — it belongs to the base branch)
      if (cur.hash === mergeBase) break;
      result.add(cur.hash);
      cur = cur.parents?.[0] ? commitMap.get(cur.parents[0]) : undefined;
    }
  }

  return result;
});

// Compute the set of commit hashes belonging to the preview branch (yellow highlight)
const previewHighlightHashes = computed<Set<string>>(() => {
  if (!props.previewHighlightBranches || props.previewHighlightBranches.length === 0) {
    return new Set();
  }

  const mergeBases = props.previewMergeBases ?? {};

  const commitMap = new Map<string, GitLogCommit>();
  for (const c of props.commits) {
    commitMap.set(c.hash, c);
  }

  const result = new Set<string>();

  for (const branchName of props.previewHighlightBranches) {
    const tipCommit = props.commits.find(c => c.branches.includes(branchName));
    if (!tipCommit) continue;

    const mergeBase = mergeBases[branchName] ?? null;
    // Skip if merge-base not yet computed (async fetch in progress) to avoid highlighting all commits
    if (!mergeBase) continue;

    let cur: GitLogCommit | undefined = tipCommit;
    while (cur) {
      if (cur.hash === mergeBase) break;
      result.add(cur.hash);
      cur = cur.parents?.[0] ? commitMap.get(cur.parents[0]) : undefined;
    }
  }

  return result;
});

function handleBranchContextMenu(commit: GitLogCommit, data: { branch: string; x: number; y: number; isCurrentBranch: boolean; isLocal: boolean }) {
  emit("branchContextMenu", { ...data, commitHash: commit.hash });
}

function handleCommitContextMenu(commit: GitLogCommit, data: { x: number; y: number }) {
  emit("commitContextMenu", { commit, ...data });
}

function handleTagContextMenu(commit: GitLogCommit, data: { tag: string; x: number; y: number }) {
  emit("tagContextMenu", { ...data, commitHash: commit.hash });
}

function handleStashContextMenu(event: MouseEvent, stash: GitStash) {
  event.preventDefault();
  event.stopPropagation();
  emit("stashContextMenu", { stash, x: event.clientX, y: event.clientY });
}

function formatStashDate(dateStr: string): string {
  const now = Date.now();
  const diff = (now - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const { ROW_HEIGHT, VISIBLE_BUFFER } = GRAPH_CONSTANTS;
const { computeGraphRows, computeMaxLane } = useGitGraph();

// Compute SVG graph rows (FR-001)
const graphRows = computed(() => computeGraphRows([...props.commits], props.graphStyle));
const maxLane = computed(() => computeMaxLane(graphRows.value));

// Interleaved row type: either a commit or a stash entry
type InterleaveRow = { type: 'commit'; commit: GitLogCommit; commitIndex: number } | { type: 'stash'; stash: GitStash };

// Build interleaved list: stash rows inserted at positions based on date (FR-045)
const interleavedRows = computed<InterleaveRow[]>(() => {
  const stashes = props.stashes || [];
  if (stashes.length === 0) {
    return props.commits.map((commit, idx) => ({ type: 'commit' as const, commit, commitIndex: idx }));
  }

  const result: InterleaveRow[] = [];
  // Sort stashes by date descending (newest first)
  const sortedStashes = [...stashes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  let stashIdx = 0;

  for (let i = 0; i < props.commits.length; i++) {
    const commit = props.commits[i];
    const commitTime = commit.timestamp * 1000; // convert to ms

    // Insert stashes that are newer than this commit
    while (stashIdx < sortedStashes.length && new Date(sortedStashes[stashIdx].date).getTime() >= commitTime) {
      result.push({ type: 'stash', stash: sortedStashes[stashIdx] });
      stashIdx++;
    }

    result.push({ type: 'commit', commit, commitIndex: i });
  }

  // Append remaining stashes (older than all commits)
  while (stashIdx < sortedStashes.length) {
    result.push({ type: 'stash', stash: sortedStashes[stashIdx] });
    stashIdx++;
  }

  return result;
});

const containerRef = ref<HTMLDivElement | null>(null);
const scrollTop = ref(0);
const containerHeight = ref(400);

let scrollEndTimeout: ReturnType<typeof setTimeout> | null = null;

const visibleRange = computed(() => {
  const buffer = VISIBLE_BUFFER;
  const total = interleavedRows.value.length;
  const startIndex = Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - buffer);
  const endIndex = Math.min(
    total,
    Math.ceil((scrollTop.value + containerHeight.value) / ROW_HEIGHT) + buffer
  );
  return { startIndex, endIndex };
});

const visibleItems = computed(() => {
  const { startIndex, endIndex } = visibleRange.value;
  return interleavedRows.value.slice(startIndex, endIndex).map((row, index) => ({
    row,
    index: startIndex + index,
    graphRow: row.type === 'commit' ? (graphRows.value.get(row.commit.hash) || null) : null,
    isHighlighted: row.type === 'commit' ? searchHighlightedHashes.value.has(row.commit.hash) : false,
    isBranchHighlighted: row.type === 'commit' ? branchHighlightedHashes.value.has(row.commit.hash) : false,
    isFeatureHighlighted: row.type === 'commit' ? featureHighlightHashes.value.has(row.commit.hash) : false,
    isPreviewHighlighted: row.type === 'commit' ? previewHighlightHashes.value.has(row.commit.hash) : false,
    isMuted: row.type === 'commit'
      ? (props.muteNonAncestral ? !(graphRows.value.get(row.commit.hash)?.isMainline ?? false) : false)
      : false,
  }));
});

const totalHeight = computed(() => interleavedRows.value.length * ROW_HEIGHT);
const offsetY = computed(() => visibleRange.value.startIndex * ROW_HEIGHT);

function handleScroll(event: Event) {
  const target = event.target as HTMLDivElement;
  scrollTop.value = target.scrollTop;

  if (!scrollEndTimeout) {
    emit("scrollStart");
  }

  if (scrollEndTimeout) {
    clearTimeout(scrollEndTimeout);
  }

  scrollEndTimeout = setTimeout(() => {
    scrollEndTimeout = null;
    emit("scrollEnd");
  }, 150);

  if (
    props.hasMore &&
    !props.loading &&
    !props.loadingMore &&
    target.scrollTop + target.clientHeight >= target.scrollHeight - 200
  ) {
    emit("loadMore");
  }
}

function handleCommitClick(commit: GitLogCommit, event: MouseEvent) {
  if (event.ctrlKey || event.metaKey) {
    // Ctrl/Cmd+click: select for comparison (FR-021)
    emit("compareSelect", commit);
  } else {
    emit("select", commit);
  }
}

function handleKeydown(event: KeyboardEvent, commit: GitLogCommit, interleavedIndex: number) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    emit("select", commit);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    // Find next commit row (skip stash rows)
    for (let i = interleavedIndex + 1; i < interleavedRows.value.length; i++) {
      const row = interleavedRows.value[i];
      if (row.type === 'commit') {
        emit("select", row.commit);
        scrollToIndex(i);
        break;
      }
    }
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    // Find previous commit row (skip stash rows)
    for (let i = interleavedIndex - 1; i >= 0; i--) {
      const row = interleavedRows.value[i];
      if (row.type === 'commit') {
        emit("select", row.commit);
        scrollToIndex(i);
        break;
      }
    }
  }
}

function scrollToIndex(index: number) {
  if (!containerRef.value) return;
  const targetY = index * ROW_HEIGHT;
  const viewTop = containerRef.value.scrollTop;
  const viewBottom = viewTop + containerRef.value.clientHeight;

  if (targetY < viewTop) {
    containerRef.value.scrollTop = targetY;
  } else if (targetY + ROW_HEIGHT > viewBottom) {
    containerRef.value.scrollTop = targetY + ROW_HEIGHT - containerRef.value.clientHeight;
  }
}

onMounted(() => {
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerHeight.value = entry.contentRect.height;
      }
    });
    observer.observe(containerRef.value);

    onUnmounted(() => observer.disconnect());
  }
});

function getScrollPosition(): number {
  return containerRef.value?.scrollTop ?? 0;
}

function setScrollPosition(position: number) {
  if (containerRef.value) {
    containerRef.value.scrollTop = position;
  }
}

defineExpose({
  getScrollPosition,
  setScrollPosition,
  scrollToIndex,
});
</script>

<template>
  <div
    ref="containerRef"
    class="h-full overflow-auto"
    role="list"
    aria-label="Commit history"
    @scroll="handleScroll"
  >
    <!-- Uncommitted changes row (FR-010) -->
    <div
      v-if="uncommittedChangesCount && uncommittedChangesCount > 0"
      class="flex items-center cursor-pointer group sticky top-0 z-10 bg-retro-dark border-b border-retro-border"
      :style="{ height: `${ROW_HEIGHT}px` }"
      role="button"
      tabindex="0"
      :aria-selected="isUncommittedChangesSelected"
      @click="handleUncommittedChangesClick"
      @keydown="handleUncommittedChangesKeydown"
    >
      <!-- SVG graph cell for uncommitted -->
        <GitGraphSvg
        :rowData="{ commitHash: 'uncommitted', lane: 0, color: '#F59E0B', nodeType: 'uncommitted', isMainline: false, connections: [] }"
        :maxLane="maxLane"
      />

      <div
        class="flex-1 flex items-center gap-2 px-2 min-w-0 rounded-r transition-colors"
        :class="{
          'bg-retro-yellow/15': isUncommittedChangesSelected,
          'group-hover:bg-retro-panel/50': !isUncommittedChangesSelected,
        }"
        :style="{ height: `${ROW_HEIGHT - 4}px` }"
      >
        <ExclamationCircleIcon class="w-4 h-4 text-retro-yellow flex-shrink-0" />
        <span class="text-retro-yellow text-xs font-medium">
          Uncommitted Changes ({{ uncommittedChangesCount }})
        </span>
        <span class="flex-1" />
        <span class="text-retro-muted text-[10px]">Working tree</span>
      </div>
    </div>

    <!-- Virtual scrolled commit list with SVG graph -->
    <div class="relative" :style="{ height: `${totalHeight}px` }">
      <div
        class="absolute left-0 right-0"
        :style="{ transform: `translateY(${offsetY}px)` }"
      >
        <template v-for="{ row, index, graphRow, isHighlighted, isBranchHighlighted, isFeatureHighlighted, isPreviewHighlighted, isMuted } in visibleItems" :key="row.type === 'commit' ? row.commit.hash : `stash-${row.stash.index}`">
          <!-- Commit Row -->
          <GitCommitRow
            v-if="row.type === 'commit'"
            v-memo="[
              row.commit.hash,
              row.commit.message,
              row.commit.timestamp,
              row.commit.branches.join('|'),
              row.commit.tags.join('|'),
              selectedCommit?.hash === row.commit.hash,
              isHighlighted,
              isBranchHighlighted,
              isFeatureHighlighted,
              isPreviewHighlighted,
              isMuted,
              props.currentBranchName || '',
              props.columnVisibility?.date !== false,
              props.columnVisibility?.author !== false,
              props.columnVisibility?.commit !== false,
            ]"
            :commit="row.commit"
            :index="row.commitIndex"
            :isSelected="selectedCommit?.hash === row.commit.hash"
            :isHighlighted="isHighlighted"
            :isBranchHighlighted="isBranchHighlighted"
            :isFeatureHighlighted="isFeatureHighlighted"
            :isPreviewHighlighted="isPreviewHighlighted"
            :isMuted="isMuted"
            :currentBranchName="props.currentBranchName"
            :localBranchNames="props.localBranchNames"
            :graphRowData="graphRow"
            :maxLane="maxLane"
            :columnVisibility="props.columnVisibility"
            @click="handleCommitClick(row.commit, $event)"
            @keydown="handleKeydown($event, row.commit, index)"
            @branchContextMenu="handleBranchContextMenu(row.commit, $event)"
            @commitContextMenu="handleCommitContextMenu(row.commit, $event)"
            @tagContextMenu="handleTagContextMenu(row.commit, $event)"
          />
        </template>
      </div>
    </div>

    <!-- Status indicators below the tree -->
    <div
      v-if="(loading || loadingMore) && commits.length > 0"
      class="flex items-center justify-center gap-2 p-2 text-retro-muted text-sm"
    >
      <div class="w-3 h-3 border-2 border-retro-muted border-t-retro-cyan rounded-full animate-spin" />
      Loading more commits...
    </div>

    <div
      v-if="!hasMore && commits.length > 0 && !loading"
      class="p-2 text-center text-retro-muted/50 text-xs"
    >
      {{ commits.length }} commits loaded
    </div>
  </div>
</template>
