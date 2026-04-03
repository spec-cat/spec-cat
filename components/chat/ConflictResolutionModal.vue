<script setup lang="ts">
import { ref, computed } from 'vue'
import { useChatStore } from '~/stores/chat'
import ConflictFileEditor from './ConflictFileEditor.vue'
import ConflictChatPanel from './ConflictChatPanel.vue'
import {
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/vue/24/outline'

const emit = defineEmits<{
  close: []
}>()

const chatStore = useChatStore()
const selectedFilePath = ref<string | null>(null)
const continueLoading = ref(false)
const abortLoading = ref(false)

const files = computed(() => chatStore.conflictState?.files ?? [])
const resolvedFiles = computed(() => chatStore.conflictState?.resolvedFiles ?? new Set<string>())
const totalCount = computed(() => files.value.length)
const resolvedCount = computed(() => resolvedFiles.value.size)
const allResolved = computed(() => totalCount.value > 0 && resolvedCount.value >= totalCount.value)

const currentFile = computed(() => {
  if (!selectedFilePath.value) return null
  return files.value.find(f => f.path === selectedFilePath.value) ?? null
})

function isResolved(path: string): boolean {
  return resolvedFiles.value.has(path)
}

function selectFile(path: string) {
  selectedFilePath.value = path
}

async function handleContinue() {
  continueLoading.value = true
  const result = await chatStore.continueRebase()
  continueLoading.value = false

  if (result.success) {
    emit('close')
  }
}

async function handleAbort() {
  abortLoading.value = true
  // Cancel any in-progress AI resolution first
  await chatStore.cancelConflictResolution()
  abortLoading.value = false
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="chatStore.conflictState"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      >
        <div class="w-full max-w-7xl mx-4 my-8 h-[85vh] bg-retro-dark border border-retro-border rounded-lg shadow-xl flex flex-col overflow-hidden">

          <!-- Header -->
          <div class="flex-shrink-0 px-4 py-3 border-b border-retro-border flex items-center justify-between">
            <div class="flex items-center gap-3">
              <ExclamationTriangleIcon class="w-5 h-5 text-retro-yellow" />
              <h3 class="text-sm font-mono text-retro-text font-semibold">Resolve Conflicts</h3>
              <span class="text-xs font-mono text-retro-muted">
                {{ resolvedCount }}/{{ totalCount }} resolved
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                :disabled="!allResolved || continueLoading || abortLoading"
                class="flex items-center gap-1 px-3 py-1.5 text-xs font-mono rounded border transition-colors
                  bg-retro-green/10 border-retro-green/50 text-retro-green
                  hover:bg-retro-green/20 disabled:opacity-40 disabled:cursor-not-allowed"
                @click="handleContinue"
              >
                {{ continueLoading ? 'Continuing...' : 'Continue Rebase' }}
              </button>
              <button
                type="button"
                :disabled="continueLoading || abortLoading"
                class="px-3 py-1.5 text-xs font-mono rounded border border-retro-red/50 text-retro-red
                  hover:bg-retro-red/10 transition-colors disabled:opacity-40"
                @click="handleAbort"
              >
                {{ abortLoading ? 'Aborting...' : 'Abort' }}
              </button>
            </div>
          </div>

          <!-- Loading state -->
          <div
            v-if="chatStore.conflictState?.loading"
            class="flex-1 flex items-center justify-center text-retro-muted text-sm font-mono"
          >
            Loading conflict files...
          </div>

          <!-- Error state -->
          <div
            v-else-if="chatStore.conflictState?.error"
            class="flex-1 flex items-center justify-center text-retro-red text-sm font-mono"
          >
            {{ chatStore.conflictState.error }}
          </div>

          <!-- Body: three-panel layout [FR-005] -->
          <div v-else class="flex-1 flex overflow-hidden">
            <!-- Left: File list sidebar -->
            <div class="w-56 flex-shrink-0 border-r border-retro-border overflow-y-auto bg-retro-dark">
              <div class="py-1">
                <button
                  v-for="file in files"
                  :key="file.path"
                  type="button"
                  class="w-full text-left px-3 py-2 text-xs font-mono flex items-center gap-2 transition-colors hover:bg-retro-panel"
                  :class="{
                    'bg-retro-panel': selectedFilePath === file.path,
                  }"
                  @click="selectFile(file.path)"
                >
                  <CheckCircleIcon v-if="isResolved(file.path)" class="w-3.5 h-3.5 text-retro-green flex-shrink-0" />
                  <ExclamationCircleIcon v-else class="w-3.5 h-3.5 text-retro-yellow flex-shrink-0" />
                  <span
                    class="truncate"
                    :class="isResolved(file.path) ? 'text-retro-green' : 'text-retro-yellow'"
                  >
                    {{ file.path }}
                  </span>
                </button>
              </div>
            </div>

            <!-- Center: File content viewer (read-only) -->
            <div class="flex-1 flex flex-col overflow-hidden min-w-0">
              <ConflictFileEditor
                v-if="currentFile"
                :file="currentFile"
                :resolved="isResolved(currentFile.path)"
              />
              <div v-else class="flex-1 flex items-center justify-center text-retro-muted text-sm font-mono">
                Select a file to view
              </div>
            </div>

            <!-- Right: Conflict chat panel [FR-008] -->
            <div class="w-80 flex-shrink-0">
              <ConflictChatPanel />
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
