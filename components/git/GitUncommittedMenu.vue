<script setup lang="ts">
import {
  ArchiveBoxArrowDownIcon,
  ArrowPathIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import type { MenuItem } from '~/components/git/GitContextMenu.vue'

interface Props {
  x: number
  y: number
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'stash'): void
  (e: 'reset'): void
  (e: 'clean'): void
}>()

const menuItems: MenuItem[] = [
  { key: 'stash', label: 'Stash Uncommitted Changes', icon: ArchiveBoxArrowDownIcon },
  { key: 'reset', label: 'Reset Working Directory', icon: ArrowPathIcon, separator: true, danger: true },
  { key: 'clean', label: 'Clean Untracked Files', icon: TrashIcon, danger: true },
]

function handleAction(actionKey: string) {
  switch (actionKey) {
    case 'stash':
      emit('stash')
      break
    case 'reset':
      emit('reset')
      break
    case 'clean':
      emit('clean')
      break
  }
}
</script>

<template>
  <GitContextMenu
    :items="menuItems"
    :x="x"
    :y="y"
    title="Uncommitted Changes"
    @close="emit('close')"
    @action="handleAction"
  />
</template>
