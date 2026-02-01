<script setup lang="ts">
import { XMarkIcon, CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon, ExclamationTriangleIcon } from '@heroicons/vue/24/outline'
import { useToast, type ToastType } from '~/composables/useToast'

const { toasts, remove } = useToast()

const typeStyles: Record<ToastType, { bg: string; icon: string; border: string }> = {
  success: { bg: 'bg-retro-green/20', icon: 'text-retro-green', border: 'border-retro-green/50' },
  error: { bg: 'bg-retro-red/20', icon: 'text-retro-red', border: 'border-retro-red/50' },
  info: { bg: 'bg-retro-cyan/20', icon: 'text-retro-cyan', border: 'border-retro-cyan/50' },
  warning: { bg: 'bg-retro-yellow/20', icon: 'text-retro-yellow', border: 'border-retro-yellow/50' },
}

const getIcon = (type: ToastType) => {
  switch (type) {
    case 'success': return CheckCircleIcon
    case 'error': return ExclamationCircleIcon
    case 'warning': return ExclamationTriangleIcon
    default: return InformationCircleIcon
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <TransitionGroup
        enter-active-class="transition-all duration-300 ease-out"
        leave-active-class="transition-all duration-200 ease-in"
        enter-from-class="opacity-0 translate-x-4"
        enter-to-class="opacity-100 translate-x-0"
        leave-from-class="opacity-100 translate-x-0"
        leave-to-class="opacity-0 translate-x-4"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="flex items-start gap-3 p-3 rounded-lg border shadow-lg"
          :class="[typeStyles[toast.type].bg, typeStyles[toast.type].border]"
        >
          <component
            :is="getIcon(toast.type)"
            class="h-5 w-5 flex-shrink-0 mt-0.5"
            :class="typeStyles[toast.type].icon"
          />
          <p class="flex-1 text-sm font-mono text-retro-text">{{ toast.message }}</p>
          <button
            type="button"
            class="p-0.5 rounded text-retro-muted hover:text-retro-text transition-colors"
            @click="remove(toast.id)"
          >
            <XMarkIcon class="h-4 w-4" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
