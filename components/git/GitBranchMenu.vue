<script setup lang="ts">
/**
 * GitBranchMenu - Context menu for branch operations (T048)
 *
 * Delegates all rendering, positioning, keyboard navigation, and
 * click-outside handling to the shared GitContextMenu component.
 *
 * Provides different menu items for local vs remote branches.
 */
import {
  ArrowPathIcon,
  PencilIcon,
  TrashIcon,
  ArrowsRightLeftIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  ArrowPathRoundedSquareIcon,
  ClipboardDocumentIcon,
  CloudArrowDownIcon,
} from "@heroicons/vue/24/outline";
import type { MenuItem } from "./GitContextMenu.vue";

interface Props {
  branchName: string;
  isCurrentBranch: boolean;
  isLocal: boolean;
  x: number;
  y: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "checkout"): void;
  (e: "createBranch"): void;
  (e: "deleteBranch"): void;
  (e: "rename"): void;
  (e: "merge"): void;
  (e: "rebase"): void;
  (e: "push"): void;
  (e: "pull"): void;
  (e: "fetch"): void;
  (e: "copyName"): void;
}>();

// --- Menu items: local branch ---

const localItems = computed<MenuItem[]>(() => [
  {
    key: "checkout",
    label: "Checkout",
    icon: ArrowPathIcon,
    disabled: props.isCurrentBranch,
  },
  {
    key: "rename",
    label: "Rename",
    icon: PencilIcon,
    separator: true,
  },
  {
    key: "deleteBranch",
    label: "Delete",
    icon: TrashIcon,
    danger: true,
    disabled: props.isCurrentBranch,
  },
  {
    key: "merge",
    label: "Merge into Current",
    icon: ArrowsRightLeftIcon,
    separator: true,
    disabled: props.isCurrentBranch,
  },
  {
    key: "rebase",
    label: "Rebase Current Onto",
    icon: ArrowPathRoundedSquareIcon,
    disabled: props.isCurrentBranch,
  },
  {
    key: "push",
    label: "Push",
    icon: ArrowUpTrayIcon,
    separator: true,
  },
  {
    key: "copyName",
    label: "Copy Branch Name",
    icon: ClipboardDocumentIcon,
    separator: true,
  },
]);

// --- Menu items: remote branch ---

const remoteItems = computed<MenuItem[]>(() => [
  {
    key: "checkout",
    label: "Checkout",
    icon: ArrowPathIcon,
  },
  {
    key: "deleteBranch",
    label: "Delete Remote Branch",
    icon: TrashIcon,
    separator: true,
    danger: true,
  },
  {
    key: "fetch",
    label: "Fetch",
    icon: CloudArrowDownIcon,
    separator: true,
  },
  {
    key: "pull",
    label: "Pull into Current",
    icon: ArrowDownTrayIcon,
  },
  {
    key: "copyName",
    label: "Copy Branch Name",
    icon: ClipboardDocumentIcon,
    separator: true,
  },
]);

const menuItems = computed(() => (props.isLocal ? localItems.value : remoteItems.value));

// --- Action dispatch ---

const actionMap: Record<string, () => void> = {
  checkout: () => emit("checkout"),
  createBranch: () => emit("createBranch"),
  deleteBranch: () => emit("deleteBranch"),
  rename: () => emit("rename"),
  merge: () => emit("merge"),
  rebase: () => emit("rebase"),
  push: () => emit("push"),
  pull: () => emit("pull"),
  fetch: () => emit("fetch"),
  copyName: () => emit("copyName"),
};

function handleAction(key: string) {
  const handler = actionMap[key];
  if (handler) {
    handler();
  }
  emit("close");
}
</script>

<template>
  <GitContextMenu
    :items="menuItems"
    :x="x"
    :y="y"
    :title="branchName"
    @action="handleAction"
    @close="emit('close')"
  />
</template>
