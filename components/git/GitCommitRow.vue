<script setup lang="ts">
import type { GitLogCommit, GraphRowData } from "~/types/git";
import { GRAPH_CONSTANTS } from "~/types/git";
import { TagIcon, ShieldCheckIcon, ShieldExclamationIcon } from "@heroicons/vue/24/outline";

interface Props {
  commit: GitLogCommit;
  index: number;
  isSelected: boolean;
  isHighlighted?: boolean;
  isBranchHighlighted?: boolean;
  isFeatureHighlighted?: boolean;
  isPreviewHighlighted?: boolean;
  isMuted?: boolean;
  currentBranchName?: string;
  localBranchNames: ReadonlySet<string>;
  graphRowData: GraphRowData | null;
  maxLane: number;
  columnVisibility?: Record<string, boolean>;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "click", event: MouseEvent): void;
  (e: "keydown", event: KeyboardEvent): void;
  (e: "branchContextMenu", data: { branch: string; x: number; y: number; isCurrentBranch: boolean; isLocal: boolean }): void;
  (e: "commitContextMenu", data: { x: number; y: number }): void;
  (e: "tagContextMenu", data: { tag: string; x: number; y: number }): void;
}>();

// Grouped branch display info
interface GroupedBranch {
  displayName: string;
  originalBranches: string[];
  isLocal: boolean;
}

// Group branches: local and remotes pointing to same branch name are combined (FR-007)
const groupedBranches = computed<GroupedBranch[]>(() => {
  const branches = props.commit.branches;
  if (branches.length === 0) return [];

  const knownLocal = props.localBranchNames;

  const localBranches: string[] = [];
  const remoteBranches: string[] = [];

  for (const branch of branches) {
    if (knownLocal.has(branch)) {
      localBranches.push(branch);
    } else {
      remoteBranches.push(branch);
    }
  }

  const localBranchSet = new Set(localBranches);
  const remoteLookup = new Map<string, string[]>();
  const unmatchedRemotes: string[] = [];

  for (const rb of remoteBranches) {
    const slashIndex = rb.indexOf('/');
    if (slashIndex > 0) {
      const branchPart = rb.substring(slashIndex + 1);
      const remote = rb.substring(0, slashIndex);
      // Only group with local if the local branch is also on THIS commit
      if (localBranchSet.has(branchPart)) {
        if (!remoteLookup.has(branchPart)) {
          remoteLookup.set(branchPart, []);
        }
        remoteLookup.get(branchPart)!.push(remote);
      } else {
        unmatchedRemotes.push(rb);
      }
    } else {
      unmatchedRemotes.push(rb);
    }
  }

  const result: GroupedBranch[] = [];

  for (const localName of localBranches) {
    const remotes = remoteLookup.get(localName) || [];
    if (remotes.length > 0) {
      result.push({
        displayName: `${localName}/${remotes.join(',')}`,
        originalBranches: [localName, ...remotes.map(r => `${r}/${localName}`)],
        isLocal: true,
      });
    } else {
      result.push({
        displayName: localName,
        originalBranches: [localName],
        isLocal: true,
      });
    }
  }

  for (const rb of unmatchedRemotes) {
    result.push({
      displayName: rb,
      originalBranches: [rb],
      isLocal: false,
    });
  }

  return result;
});

// Branch right-click handler
function handleBranchContextMenu(event: MouseEvent, grouped: GroupedBranch) {
  event.preventDefault();
  event.stopPropagation();
  const branch = grouped.originalBranches[0];
  emit("branchContextMenu", {
    branch,
    x: event.clientX,
    y: event.clientY,
    isCurrentBranch: grouped.isLocal && grouped.originalBranches.includes(props.currentBranchName ?? ''),
    isLocal: grouped.isLocal,
  });
}

// Tag right-click handler (FR-040)
function handleTagContextMenu(event: MouseEvent, tag: string) {
  event.preventDefault();
  event.stopPropagation();
  emit("tagContextMenu", {
    tag,
    x: event.clientX,
    y: event.clientY,
  });
}

// Commit right-click handler
function handleCommitContextMenu(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  emit("commitContextMenu", {
    x: event.clientX,
    y: event.clientY,
  });
}

const { ROW_HEIGHT } = GRAPH_CONSTANTS;

// Tooltip text for commit node hover (FR-005)
const nodeTooltipText = computed(() => {
  const parts: string[] = [props.commit.shortHash];
  if (props.commit.branches.length > 0) {
    parts.push(props.commit.branches.join(', '));
  }
  if (props.commit.tags.length > 0) {
    parts.push(props.commit.tags.map(t => `tag: ${t}`).join(', '));
  }
  return parts.join(' — ');
});

// Format relative date (FR-004)
function formatRelativeDate(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;

  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Get first line of commit message (FR-004: truncated at 72 chars)
function getMessageFirstLine(message: string): string {
  const firstLine = message.split("\n")[0];
  return firstLine.length > 72 ? firstLine.substring(0, 69) + "..." : firstLine;
}
</script>

<template>
  <div
    class="flex items-center cursor-pointer group focus:outline-none focus:ring-1 focus:ring-retro-cyan/50 focus:ring-inset"
    :class="{ 'opacity-40': isMuted, 'bg-retro-red/10': isPreviewHighlighted, 'bg-retro-yellow/20': isFeatureHighlighted && !isPreviewHighlighted }"
    :style="{ height: `${ROW_HEIGHT}px` }"
    role="row"
    tabindex="0"
    :aria-selected="isSelected"
    :aria-label="`Commit ${commit.shortHash} by ${commit.author}: ${commit.message.split('\n')[0]}`"
    @click="emit('click', $event)"
    @keydown="emit('keydown', $event)"
    @contextmenu="handleCommitContextMenu"
  >
    <!-- SVG Graph cell (FR-001) -->
    <GitGraphSvg
      :rowData="graphRowData"
      :maxLane="maxLane"
      :tooltipText="nodeTooltipText"
    />

    <!-- Commit info row -->
    <div
      class="flex-1 flex items-center gap-2 px-2 min-w-0 rounded-r transition-colors"
      :class="{
        'bg-retro-red/10 border-l-2 border-retro-red/40': isPreviewHighlighted,
        'bg-retro-yellow/30 border-l-2 border-retro-yellow': isFeatureHighlighted && !isPreviewHighlighted,
        'bg-retro-cyan/15': isSelected && !isFeatureHighlighted && !isPreviewHighlighted,
        'bg-retro-yellow/10': isHighlighted && !isSelected && !isFeatureHighlighted && !isPreviewHighlighted,
        'bg-retro-cyan/5': isBranchHighlighted && !isSelected && !isHighlighted && !isFeatureHighlighted && !isPreviewHighlighted,
        'group-hover:bg-retro-panel/50': !isSelected && !isHighlighted && !isFeatureHighlighted && !isPreviewHighlighted && !isBranchHighlighted,
      }"
      :style="{ height: `${ROW_HEIGHT - 4}px` }"
    >
      <!-- Short hash (FR-004, FR-071) -->
      <span
        v-if="!columnVisibility || columnVisibility.commit !== false"
        class="flex-shrink-0 font-mono text-[11px]"
        :class="commit.isHead ? 'text-retro-cyan font-semibold' : 'text-retro-muted'"
      >
        {{ commit.shortHash }}
      </span>

      <!-- Branch labels (FR-006, FR-007) -->
      <div v-if="groupedBranches.length > 0" class="flex gap-1 flex-shrink-0">
        <span
          v-for="grouped in groupedBranches"
          :key="grouped.displayName"
          class="px-1.5 py-0.5 text-[10px] rounded font-semibold leading-none cursor-context-menu hover:ring-1 hover:ring-retro-cyan/50"
          :class="commit.isHead && grouped.isLocal
            ? 'bg-retro-cyan/20 text-retro-cyan border border-retro-cyan/40'
            : isPreviewHighlighted
              ? 'bg-retro-red/10 text-retro-red border border-retro-red/40'
              : isFeatureHighlighted
                ? 'bg-retro-yellow/15 text-retro-yellow border border-retro-yellow/30'
                : isBranchHighlighted
                  ? 'bg-retro-cyan/15 text-retro-cyan/80 border border-retro-cyan/30'
                  : grouped.isLocal
                    ? 'bg-retro-green/15 text-retro-green border border-retro-green/30'
                    : 'bg-retro-orange/15 text-retro-orange border border-retro-orange/30'"
          :title="grouped.originalBranches.join(', ')"
          @contextmenu="handleBranchContextMenu($event, grouped)"
        >
          {{ grouped.displayName }}
        </span>
      </div>

      <!-- Tag labels (FR-008) - visually distinct from branch labels -->
      <div v-if="commit.tags.length > 0" class="flex gap-1 flex-shrink-0">
        <span
          v-for="tag in commit.tags"
          :key="tag"
          class="px-1 py-0.5 text-[10px] rounded-sm bg-retro-yellow/15 text-retro-yellow border border-retro-yellow/25 flex items-center gap-0.5 leading-none cursor-context-menu hover:ring-1 hover:ring-retro-yellow/50"
          @contextmenu="handleTagContextMenu($event, tag)"
        >
          <TagIcon class="w-2.5 h-2.5" />
          {{ tag }}
        </span>
      </div>

      <!-- Commit message (truncated) (FR-004) -->
      <span class="text-retro-text text-xs truncate flex-1">
        {{ getMessageFirstLine(commit.message) }}
      </span>

      <!-- GPG signature status (FR-086) -->
      <ShieldCheckIcon
        v-if="commit.signatureStatus === 'good'"
        class="w-3.5 h-3.5 flex-shrink-0 text-retro-green"
        title="Verified signature"
      />
      <ShieldExclamationIcon
        v-else-if="commit.signatureStatus === 'bad'"
        class="w-3.5 h-3.5 flex-shrink-0 text-retro-red"
        title="Bad signature"
      />

      <!-- Author (FR-004, FR-071) -->
      <span
        v-if="!columnVisibility || columnVisibility.author !== false"
        class="flex-shrink-0 text-retro-muted text-[10px] hidden sm:inline"
      >
        {{ commit.author }}
      </span>

      <!-- Date (FR-004, FR-071) -->
      <span
        v-if="!columnVisibility || columnVisibility.date !== false"
        class="flex-shrink-0 text-retro-muted text-[10px]"
      >
        {{ formatRelativeDate(commit.timestamp) }}
      </span>
    </div>
  </div>
</template>
