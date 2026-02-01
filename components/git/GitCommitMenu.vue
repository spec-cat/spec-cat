<script setup lang="ts">
/**
 * GitCommitMenu - Context menu for commit operations (T057)
 *
 * Delegates all rendering, positioning, keyboard navigation, and
 * click-outside handling to the shared GitContextMenu component.
 */
import {
  TagIcon,
  PlusIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  ArrowsRightLeftIcon,
  ArrowPathRoundedSquareIcon,
  ClipboardDocumentIcon,
  DocumentDuplicateIcon,
} from "@heroicons/vue/24/outline";
import type { MenuItem } from "./GitContextMenu.vue";
import type { GitLogCommit } from "~/types/git";

interface Props {
  commit: GitLogCommit;
  x: number;
  y: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "addTag"): void;
  (e: "createBranch"): void;
  (e: "checkout"): void;
  (e: "cherryPick"): void;
  (e: "revert"): void;
  (e: "mergeInto"): void;
  (e: "reset"): void;
  (e: "copyHash"): void;
  (e: "copySubject"): void;
}>();

const menuItems = computed<MenuItem[]>(() => [
  {
    key: "addTag",
    label: "Add Tag",
    icon: TagIcon,
  },
  {
    key: "createBranch",
    label: "Create Branch",
    icon: PlusIcon,
  },
  {
    key: "checkout",
    label: "Checkout (detached HEAD)",
    icon: ArrowPathIcon,
    separator: true,
  },
  {
    key: "cherryPick",
    label: "Cherry Pick",
    icon: DocumentDuplicateIcon,
  },
  {
    key: "revert",
    label: "Revert",
    icon: ArrowUturnLeftIcon,
  },
  {
    key: "mergeInto",
    label: "Merge into Current",
    icon: ArrowsRightLeftIcon,
    separator: true,
  },
  {
    key: "reset",
    label: "Reset Current Branch to Here",
    icon: ArrowPathRoundedSquareIcon,
    danger: true,
  },
  {
    key: "copyHash",
    label: "Copy Commit Hash",
    icon: ClipboardDocumentIcon,
    separator: true,
  },
  {
    key: "copySubject",
    label: "Copy Commit Subject",
    icon: ClipboardDocumentIcon,
  },
]);

// --- Action dispatch ---

const actionMap: Record<string, () => void> = {
  addTag: () => emit("addTag"),
  createBranch: () => emit("createBranch"),
  checkout: () => emit("checkout"),
  cherryPick: () => emit("cherryPick"),
  revert: () => emit("revert"),
  mergeInto: () => emit("mergeInto"),
  reset: () => emit("reset"),
  copyHash: () => emit("copyHash"),
  copySubject: () => emit("copySubject"),
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
    :title="commit.shortHash"
    @action="handleAction"
    @close="emit('close')"
  />
</template>
