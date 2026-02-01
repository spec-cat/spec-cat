<script setup lang="ts">
import {
  ArrowDownOnSquareIcon,
  ArrowUturnLeftIcon,
  TrashIcon,
  CodeBracketIcon,
  ClipboardDocumentIcon,
  HashtagIcon,
} from '@heroicons/vue/24/outline'
import type { MenuItem } from '~/components/git/GitContextMenu.vue'

interface Props {
  stashIndex: number
  stashMessage: string
  x: number
  y: number
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply'): void
  (e: 'pop'): void
  (e: 'drop'): void
  (e: 'createBranch'): void
  (e: 'copyName'): void
  (e: 'copyHash'): void
}>()

const menuItems: MenuItem[] = [
  { key: 'apply', label: 'Apply Stash', icon: ArrowDownOnSquareIcon },
  { key: 'pop', label: 'Pop Stash', icon: ArrowUturnLeftIcon },
  { key: 'createBranch', label: 'Create Branch from Stash', icon: CodeBracketIcon, separator: true },
  { key: 'drop', label: 'Drop Stash', icon: TrashIcon, separator: true, danger: true },
  { key: 'copyName', label: 'Copy Stash Reference', icon: ClipboardDocumentIcon, separator: true },
  { key: 'copyHash', label: 'Copy Stash Hash', icon: HashtagIcon },
]

function handleAction(actionKey: string) {
  switch (actionKey) {
    case 'apply':
      emit('apply')
      break
    case 'pop':
      emit('pop')
      break
    case 'drop':
      emit('drop')
      break
    case 'createBranch':
      emit('createBranch')
      break
    case 'copyName':
      emit('copyName')
      break
    case 'copyHash':
      emit('copyHash')
      break
  }
}
</script>

<template>
  <GitContextMenu
    :items="menuItems"
    :x="x"
    :y="y"
    :title="stashMessage"
    @close="emit('close')"
    @action="handleAction"
  />
</template>
