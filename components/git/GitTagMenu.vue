<script setup lang="ts">
import {
  TagIcon,
  TrashIcon,
  ArrowUpTrayIcon,
  ClipboardDocumentIcon,
} from '@heroicons/vue/24/outline'
import type { MenuItem } from '~/components/git/GitContextMenu.vue'

interface Props {
  tagName: string
  x: number
  y: number
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'viewDetails'): void
  (e: 'deleteTag'): void
  (e: 'pushTag'): void
  (e: 'copyName'): void
}>()

const menuItems: MenuItem[] = [
  { key: 'viewDetails', label: 'View Details', icon: TagIcon },
  { key: 'deleteTag', label: 'Delete Tag', icon: TrashIcon, separator: true, danger: true },
  { key: 'pushTag', label: 'Push Tag', icon: ArrowUpTrayIcon },
  { key: 'copyName', label: 'Copy Tag Name', icon: ClipboardDocumentIcon, separator: true },
]

function handleAction(actionKey: string) {
  switch (actionKey) {
    case 'viewDetails':
      emit('viewDetails')
      break
    case 'deleteTag':
      emit('deleteTag')
      break
    case 'pushTag':
      emit('pushTag')
      break
    case 'copyName':
      emit('copyName')
      break
  }
}
</script>

<template>
  <GitContextMenu
    :items="menuItems"
    :x="x"
    :y="y"
    :title="tagName"
    @close="emit('close')"
    @action="handleAction"
  />
</template>
