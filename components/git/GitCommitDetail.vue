<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted } from "vue";
import type { GitLogCommit, FileChange } from "~/types/git";
import { FILE_STATUS_CONFIG } from "~/types/git";
import { renderCommitBody } from "~/utils/commitMessage";
import {
  XMarkIcon,
  DocumentTextIcon,
  ClockIcon,
  UserIcon,
  FolderIcon,
  ChevronRightIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ListBulletIcon,
} from "@heroicons/vue/24/outline";

// =============================================================================
// Types
// =============================================================================

interface Props {
  commit: GitLogCommit;
  files: readonly FileChange[] | null;
  stats: { additions: number; deletions: number; filesChanged: number } | null;
  loading?: boolean;
  committer?: string;
  committerEmail?: string;
  detailPosition?: "inline" | "bottom";
}

interface TreeNode {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  children: TreeNode[];
  file?: FileChange;
}

/** Flat row for rendering the tree without recursion in the template */
interface FlatTreeRow {
  key: string;
  depth: number;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  expanded: boolean;
  file?: FileChange;
}

// =============================================================================
// Props / Emits
// =============================================================================

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  detailPosition: "inline",
});

const emit = defineEmits<{
  (e: "close"): void;
  (e: "navigateToCommit", hash: string): void;
  (e: "togglePosition"): void;
  (e: "navigatePrev"): void;
  (e: "navigateNext"): void;
  (e: "openFileDiff", file: FileChange): void;
}>();

// =============================================================================
// State
// =============================================================================

const containerRef = ref<HTMLElement | null>(null);
const fileViewMode = ref<"flat" | "tree">("flat");
const expandedFolders = ref<Set<string>>(new Set());

// =============================================================================
// Computed: Committer differs from author (T038)
// =============================================================================

const showCommitter = computed(() => {
  if (!props.committer || !props.committerEmail) return false;
  return (
    props.committer !== props.commit.author ||
    props.committerEmail !== props.commit.email
  );
});

// =============================================================================
// Computed: Rendered commit body (T045)
// =============================================================================

const renderedBody = computed(() => {
  const body = props.commit.body;
  if (!body) return "";
  return renderCommitBody(body);
});

// =============================================================================
// Computed: Stats summary bar text (T041)
// =============================================================================

const statsSummary = computed(() => {
  if (!props.stats) return "";
  const { filesChanged, additions, deletions } = props.stats;
  const filePart = `${filesChanged} ${filesChanged === 1 ? "file" : "files"} changed`;
  const parts = [filePart];
  if (additions > 0)
    parts.push(`+${additions} insertion${additions === 1 ? "" : "s"}`);
  if (deletions > 0)
    parts.push(`-${deletions} deletion${deletions === 1 ? "" : "s"}`);
  return parts.join(", ");
});

// =============================================================================
// File tree building (T039)
// =============================================================================

function buildRawTree(files: readonly FileChange[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join("/");

      let existing = currentLevel.find(
        (n) => n.name === part && n.isDirectory === !isLast
      );
      if (!existing) {
        existing = {
          name: part,
          fullPath,
          isDirectory: !isLast,
          children: [],
          file: isLast ? file : undefined,
        };
        currentLevel.push(existing);
      }

      if (!isLast) {
        currentLevel = existing.children;
      }
    }
  }

  // Compact single-child directories
  compactTree(root);

  return root;
}

function compactTree(nodes: TreeNode[]): void {
  for (const node of nodes) {
    if (node.isDirectory) {
      compactTree(node.children);

      // Compact: merge with single directory child
      while (node.children.length === 1 && node.children[0].isDirectory) {
        const child = node.children[0];
        node.name = `${node.name}/${child.name}`;
        node.fullPath = child.fullPath;
        node.children = child.children;
      }
    }
  }
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Flatten tree into renderable rows, respecting expanded state.
 * This avoids recursive template components.
 */
function flattenTree(
  nodes: TreeNode[],
  depth: number,
  expanded: Set<string>
): FlatTreeRow[] {
  const rows: FlatTreeRow[] = [];
  for (const node of sortNodes(nodes)) {
    const isExpanded =
      expanded.size === 0 ? true : expanded.has(node.fullPath);
    rows.push({
      key: node.fullPath,
      depth,
      isDirectory: node.isDirectory,
      name: node.name,
      fullPath: node.fullPath,
      expanded: node.isDirectory ? isExpanded : false,
      file: node.file,
    });
    if (node.isDirectory && isExpanded) {
      rows.push(...flattenTree(node.children, depth + 1, expanded));
    }
  }
  return rows;
}

const rawTree = computed(() => {
  if (!props.files || props.files.length === 0) return [];
  return buildRawTree(props.files);
});

const flatTreeRows = computed(() => {
  return flattenTree(rawTree.value, 0, expandedFolders.value);
});

// =============================================================================
// Folder toggle (T039)
// =============================================================================

function toggleFolder(fullPath: string) {
  if (expandedFolders.value.has(fullPath)) {
    expandedFolders.value.delete(fullPath);
  } else {
    expandedFolders.value.add(fullPath);
  }
  // Force reactivity by replacing the set
  expandedFolders.value = new Set(expandedFolders.value);
}

function expandAllFolders() {
  const collectDirs = (nodes: TreeNode[]): string[] => {
    const paths: string[] = [];
    for (const node of nodes) {
      if (node.isDirectory) {
        paths.push(node.fullPath);
        paths.push(...collectDirs(node.children));
      }
    }
    return paths;
  };
  expandedFolders.value = new Set(collectDirs(rawTree.value));
}

function collapseAllFolders() {
  expandedFolders.value = new Set();
}

// When switching to tree mode, auto-expand all
watch(fileViewMode, (mode) => {
  if (mode === "tree") {
    expandAllFolders();
  }
});

// =============================================================================
// Format helpers
// =============================================================================

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function getStatusConfig(status: string) {
  return (
    FILE_STATUS_CONFIG[status as keyof typeof FILE_STATUS_CONFIG] || {
      label: status,
      colorClass: "text-retro-muted",
    }
  );
}

// =============================================================================
// Stats bar visual (T041)
// =============================================================================

const statsBarSegments = computed(() => {
  if (!props.stats) return { addPct: 0, delPct: 0 };
  const total = props.stats.additions + props.stats.deletions;
  if (total === 0) return { addPct: 50, delPct: 50 };
  return {
    addPct: Math.round((props.stats.additions / total) * 100),
    delPct: Math.round((props.stats.deletions / total) * 100),
  };
});

// =============================================================================
// Keyboard navigation (T042)
// =============================================================================

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "ArrowUp") {
    event.preventDefault();
    emit("navigatePrev");
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    emit("navigateNext");
  } else if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
  }
}

onMounted(() => {
  nextTick(() => {
    containerRef.value?.focus();
  });
});

// Re-focus when commit changes so keyboard nav continues working
watch(
  () => props.commit.hash,
  () => {
    nextTick(() => {
      containerRef.value?.focus();
    });
  }
);

// =============================================================================
// Event handlers
// =============================================================================

function handleClose() {
  emit("close");
}

function handleNavigateToCommit(hash: string) {
  emit("navigateToCommit", hash);
}

function handleTogglePosition() {
  emit("togglePosition");
}

function toggleFileViewMode() {
  fileViewMode.value = fileViewMode.value === "flat" ? "tree" : "flat";
}

function handleFileClick(file: FileChange) {
  emit("openFileDiff", file);
}
</script>

<template>
  <section
    ref="containerRef"
    :tabindex="0"
    @keydown="handleKeydown"
    class="flex-1 min-h-0 flex flex-col border-t border-retro-border bg-retro-dark focus:outline-none"
    aria-label="Commit details"
    role="region"
  >
    <!-- Header -->
    <div
      class="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-retro-border bg-retro-panel"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-retro-cyan font-mono text-sm">{{
          commit.shortHash
        }}</span>
        <span class="text-retro-muted text-sm truncate">{{
          commit.message.split("\n")[0]
        }}</span>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        <!-- Position toggle (T044) -->
        <button
          @click="handleTogglePosition"
          class="p-1 hover:bg-retro-dark rounded transition-colors focus:outline-none focus:ring-2 focus:ring-retro-cyan"
          :aria-label="
            detailPosition === 'inline'
              ? 'Dock detail to bottom'
              : 'Show detail inline'
          "
          :title="
            detailPosition === 'inline' ? 'Dock to bottom' : 'Show inline'
          "
        >
          <ArrowsPointingOutIcon
            v-if="detailPosition === 'inline'"
            class="w-4 h-4 text-retro-muted hover:text-retro-text"
          />
          <ArrowsPointingInIcon
            v-else
            class="w-4 h-4 text-retro-muted hover:text-retro-text"
          />
        </button>

        <!-- Close button -->
        <button
          @click="handleClose"
          class="p-1 hover:bg-retro-dark rounded transition-colors focus:outline-none focus:ring-2 focus:ring-retro-cyan"
          aria-label="Close commit details"
        >
          <XMarkIcon class="w-4 h-4 text-retro-muted hover:text-retro-text" />
        </button>
      </div>
    </div>

    <!-- Content (scrollable) -->
    <div class="flex-1 overflow-auto p-4 space-y-4">
      <!-- Commit metadata -->
      <div class="space-y-2">
        <!-- Full hash -->
        <div class="flex items-center gap-2 text-sm">
          <span class="text-retro-muted w-20 flex-shrink-0">Hash:</span>
          <code
            class="text-retro-text font-mono text-xs bg-retro-panel px-2 py-1 rounded"
          >
            {{ commit.hash }}
          </code>
        </div>

        <!-- Author -->
        <div class="flex items-center gap-2 text-sm">
          <UserIcon class="w-4 h-4 text-retro-muted flex-shrink-0" />
          <span class="text-retro-text">{{ commit.author }}</span>
          <span class="text-retro-muted"
            >&lt;{{ commit.email }}&gt;</span
          >
        </div>

        <!-- Committer (T038) - shown when different from author -->
        <div v-if="showCommitter" class="flex items-center gap-2 text-sm">
          <UserIcon class="w-4 h-4 text-retro-yellow flex-shrink-0" />
          <span class="text-retro-muted text-xs uppercase mr-1"
            >Committer:</span
          >
          <span class="text-retro-text">{{ committer }}</span>
          <span class="text-retro-muted"
            >&lt;{{ committerEmail }}&gt;</span
          >
        </div>

        <!-- Date -->
        <div class="flex items-center gap-2 text-sm">
          <ClockIcon class="w-4 h-4 text-retro-muted flex-shrink-0" />
          <span class="text-retro-text">{{
            formatDate(commit.timestamp)
          }}</span>
        </div>

        <!-- Parents (T038) - clickable links -->
        <div
          v-if="commit.parents?.length > 0"
          class="flex items-start gap-2 text-sm"
        >
          <span class="text-retro-muted w-20 flex-shrink-0">Parents:</span>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="parent in commit.parents"
              :key="parent"
              @click="handleNavigateToCommit(parent)"
              class="text-retro-cyan font-mono text-xs bg-retro-panel px-2 py-0.5 rounded hover:bg-retro-dark hover:text-retro-text transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-retro-cyan"
              :title="`Navigate to parent ${parent.substring(0, 7)}`"
            >
              {{ parent.substring(0, 7) }}
            </button>
          </div>
        </div>

        <!-- Branches -->
        <div
          v-if="commit.branches?.length > 0"
          class="flex items-start gap-2 text-sm"
        >
          <span class="text-retro-muted w-20 flex-shrink-0">Branches:</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="branch in commit.branches"
              :key="branch"
              class="text-retro-green font-mono text-xs bg-retro-panel px-2 py-0.5 rounded"
            >
              {{ branch }}
            </span>
          </div>
        </div>

        <!-- Tags -->
        <div
          v-if="commit.tags?.length > 0"
          class="flex items-start gap-2 text-sm"
        >
          <span class="text-retro-muted w-20 flex-shrink-0">Tags:</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="tag in commit.tags"
              :key="tag"
              class="text-retro-yellow font-mono text-xs bg-retro-panel px-2 py-0.5 rounded"
            >
              {{ tag }}
            </span>
          </div>
        </div>
      </div>

      <!-- Commit message subject -->
      <div class="space-y-1">
        <h4 class="text-retro-muted text-xs uppercase tracking-wide">
          Message
        </h4>
        <div
          class="text-retro-text text-sm font-mono bg-retro-panel p-3 rounded"
        >
          {{ commit.message.split("\n")[0] }}
        </div>
      </div>

      <!-- Commit body (T045) - rendered with renderCommitBody -->
      <div v-if="commit.body" class="space-y-1">
        <h4 class="text-retro-muted text-xs uppercase tracking-wide">
          Body
        </h4>
        <div
          class="text-retro-text text-sm font-mono bg-retro-panel p-3 rounded commit-body-rendered"
          v-html="renderedBody"
        />
      </div>

      <!-- Stats summary bar (T041) -->
      <div v-if="stats" class="space-y-2">
        <div class="flex items-center gap-2 text-sm">
          <span class="text-retro-muted">{{ statsSummary }}</span>
        </div>
        <!-- Visual stats bar -->
        <div
          v-if="stats.additions > 0 || stats.deletions > 0"
          class="flex items-center gap-2"
        >
          <span class="text-retro-green text-xs font-mono"
            >+{{ stats.additions }}</span
          >
          <div
            class="flex-1 h-2 rounded overflow-hidden bg-retro-panel flex"
          >
            <div
              class="bg-retro-green h-full transition-all"
              :style="{ width: statsBarSegments.addPct + '%' }"
            />
            <div
              class="bg-retro-red h-full transition-all"
              :style="{ width: statsBarSegments.delPct + '%' }"
            />
          </div>
          <span class="text-retro-red text-xs font-mono"
            >-{{ stats.deletions }}</span
          >
        </div>
      </div>

      <!-- File changes -->
      <div v-if="files" class="space-y-2">
        <!-- File section header with view toggle (T039) -->
        <div class="flex items-center justify-between">
          <h4 class="text-retro-muted text-xs uppercase tracking-wide">
            Files Changed ({{ files.length }})
          </h4>
          <div class="flex items-center gap-1">
            <!-- Flat list toggle button -->
            <button
              @click="fileViewMode = 'flat'"
              class="p-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-retro-cyan"
              :class="
                fileViewMode === 'flat'
                  ? 'bg-retro-panel text-retro-cyan'
                  : 'text-retro-muted hover:text-retro-text'
              "
              aria-label="Flat file list"
              title="Flat file list"
            >
              <ListBulletIcon class="w-4 h-4" />
            </button>
            <!-- Tree view toggle button -->
            <button
              @click="fileViewMode = 'tree'"
              class="p-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-retro-cyan"
              :class="
                fileViewMode === 'tree'
                  ? 'bg-retro-panel text-retro-cyan'
                  : 'text-retro-muted hover:text-retro-text'
              "
              aria-label="Tree file view"
              title="Tree file view"
            >
              <FolderIcon class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          v-if="files.length === 0"
          class="text-retro-muted text-sm py-2"
        >
          No files changed in this commit.
        </div>

        <!-- Flat list view -->
        <ul
          v-else-if="fileViewMode === 'flat'"
          class="space-y-0.5"
        >
          <li
            v-for="file in files"
            :key="file.path"
            class="flex items-center gap-2 text-sm py-1 px-2 hover:bg-retro-panel rounded group cursor-pointer"
            @click="handleFileClick(file as FileChange)"
          >
            <!-- Status badge -->
            <span
              class="flex-shrink-0 w-5 h-5 flex items-center justify-center text-xs font-bold rounded"
              :class="getStatusConfig(file.status).colorClass"
              :title="getStatusConfig(file.status).label"
            >
              {{ file.status }}
            </span>

            <!-- File icon -->
            <DocumentTextIcon
              class="w-4 h-4 text-retro-muted flex-shrink-0"
            />

            <!-- File path (T040: rename display for status R) -->
            <span
              class="text-retro-text font-mono text-xs truncate flex-1"
            >
              <template v-if="file.status === 'R' && file.oldPath">
                <span class="text-retro-muted">{{ file.oldPath }}</span>
                <span class="text-retro-yellow mx-1">&rarr;</span>
                <span class="text-retro-text">{{ file.path }}</span>
              </template>
              <template v-else>
                {{ file.path }}
              </template>
            </span>

            <!-- Per-file additions/deletions -->
            <span
              v-if="
                !file.binary &&
                (file.additions > 0 || file.deletions > 0)
              "
              class="flex-shrink-0 font-mono text-xs flex items-center gap-1"
            >
              <span v-if="file.additions > 0" class="text-retro-green"
                >+{{ file.additions }}</span
              >
              <span v-if="file.deletions > 0" class="text-retro-red"
                >-{{ file.deletions }}</span
              >
            </span>
            <span
              v-else-if="file.binary"
              class="flex-shrink-0 font-mono text-xs text-retro-muted"
              >binary</span
            >
          </li>
        </ul>

        <!-- Tree view (T039) - flattened rows to avoid recursive components -->
        <div v-else class="space-y-0">
          <!-- Expand/Collapse all controls -->
          <div class="flex items-center gap-2 mb-1">
            <button
              @click="expandAllFolders"
              class="text-xs text-retro-muted hover:text-retro-text transition-colors"
            >
              Expand all
            </button>
            <span class="text-retro-muted text-xs">|</span>
            <button
              @click="collapseAllFolders"
              class="text-xs text-retro-muted hover:text-retro-text transition-colors"
            >
              Collapse all
            </button>
          </div>

          <!-- Flattened tree rows -->
          <div
            v-for="row in flatTreeRows"
            :key="row.key"
            class="flex items-center gap-1 py-0.5 px-1 hover:bg-retro-panel rounded text-sm cursor-pointer"
            :class="{ 'select-none': row.isDirectory }"
            :style="{ paddingLeft: row.depth * 16 + 4 + 'px' }"
            @click="row.isDirectory ? toggleFolder(row.fullPath) : (row.file ? handleFileClick(row.file as FileChange) : undefined)"
          >
            <!-- Directory row -->
            <template v-if="row.isDirectory">
              <!-- Chevron -->
              <ChevronRightIcon
                class="w-3 h-3 text-retro-muted transition-transform flex-shrink-0"
                :class="{ 'rotate-90': row.expanded }"
              />
              <!-- Folder icon -->
              <FolderIcon class="w-4 h-4 text-retro-yellow flex-shrink-0" />
              <!-- Folder name -->
              <span class="text-retro-text font-mono text-xs">{{
                row.name
              }}</span>
            </template>

            <!-- File row -->
            <template v-else-if="row.file">
              <!-- Status badge -->
              <span
                class="flex-shrink-0 w-5 h-5 flex items-center justify-center text-xs font-bold rounded"
                :class="getStatusConfig(row.file.status).colorClass"
                :title="getStatusConfig(row.file.status).label"
              >
                {{ row.file.status }}
              </span>
              <!-- File icon -->
              <DocumentTextIcon
                class="w-4 h-4 text-retro-muted flex-shrink-0"
              />
              <!-- File name (T040: rename display in tree) -->
              <span
                class="text-retro-text font-mono text-xs truncate flex-1"
              >
                <template
                  v-if="row.file.status === 'R' && row.file.oldPath"
                >
                  <span class="text-retro-muted">{{
                    row.file.oldPath.split("/").pop()
                  }}</span>
                  <span class="text-retro-yellow mx-1">&rarr;</span>
                  <span class="text-retro-text">{{ row.name }}</span>
                </template>
                <template v-else>
                  {{ row.name }}
                </template>
              </span>
              <!-- Per-file additions/deletions -->
              <span
                v-if="
                  !row.file.binary &&
                  (row.file.additions > 0 || row.file.deletions > 0)
                "
                class="flex-shrink-0 font-mono text-xs flex items-center gap-1"
              >
                <span
                  v-if="row.file.additions > 0"
                  class="text-retro-green"
                  >+{{ row.file.additions }}</span
                >
                <span
                  v-if="row.file.deletions > 0"
                  class="text-retro-red"
                  >-{{ row.file.deletions }}</span
                >
              </span>
              <span
                v-else-if="row.file.binary"
                class="flex-shrink-0 font-mono text-xs text-retro-muted"
                >binary</span
              >
            </template>
          </div>
        </div>
      </div>

      <!-- Loading state for files -->
      <div
        v-else-if="loading"
        class="flex items-center gap-2 text-retro-muted text-sm py-2"
      >
        <div
          class="w-3 h-3 border-2 border-retro-muted border-t-retro-cyan rounded-full animate-spin"
        />
        Loading file changes...
      </div>

      <!-- Fallback when files failed to load -->
      <div
        v-else
        class="text-retro-muted text-sm py-2"
      >
        Failed to load file changes.
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Commit body rendered styles (T045) */
.commit-body-rendered :deep(a) {
  color: var(--retro-blue, #60a5fa);
}
.commit-body-rendered :deep(a:hover) {
  text-decoration: underline;
}
.commit-body-rendered :deep(p) {
  margin-bottom: 0.5rem;
}
.commit-body-rendered :deep(p:last-child) {
  margin-bottom: 0;
}
.commit-body-rendered :deep(ul),
.commit-body-rendered :deep(ol) {
  padding-left: 1.5rem;
  margin-bottom: 0.5rem;
}
.commit-body-rendered :deep(li) {
  margin-bottom: 0.25rem;
}
.commit-body-rendered :deep(code) {
  background-color: var(--retro-panel, #1e293b);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.8125rem;
}
.commit-body-rendered :deep(pre) {
  background-color: var(--retro-panel, #1e293b);
  padding: 0.75rem;
  border-radius: 0.25rem;
  overflow-x: auto;
  margin-bottom: 0.5rem;
}
.commit-body-rendered :deep(blockquote) {
  border-left: 3px solid var(--retro-muted, #64748b);
  padding-left: 0.75rem;
  margin-left: 0;
  margin-bottom: 0.5rem;
  color: var(--retro-muted, #64748b);
}
</style>
