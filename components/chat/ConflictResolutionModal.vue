<script setup lang="ts">
import { ref, computed } from 'vue'
import { useChatStore } from '~/stores/chat'
import ConflictFileEditor from './ConflictFileEditor.vue'
import {
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  SparklesIcon,
} from '@heroicons/vue/24/outline'

const emit = defineEmits<{
  close: []
}>()

const chatStore = useChatStore()
const selectedFilePath = ref<string | null>(null)
const continueLoading = ref(false)
const abortLoading = ref(false)
const aiResolvingFile = ref<string | null>(null)
const aiResolvingAll = ref(false)

const files = computed(() => chatStore.conflictState?.files ?? [])
const resolvedFiles = computed(() => chatStore.conflictState?.resolvedFiles ?? new Set<string>())
const totalCount = computed(() => files.value.length)
const resolvedCount = computed(() => resolvedFiles.value.size)
const allResolved = computed(() => totalCount.value > 0 && resolvedCount.value >= totalCount.value)

const unresolvedCount = computed(() => totalCount.value - resolvedCount.value)

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

async function handleResolve(filePath: string, content: string) {
  await chatStore.resolveConflictFile(filePath, content)
}

async function handleAiResolve(filePath: string) {
  aiResolvingFile.value = filePath
  await chatStore.aiResolveConflictFile(filePath)
  aiResolvingFile.value = null
}

async function handleAiResolveAll() {
  aiResolvingAll.value = true
  await chatStore.aiResolveAllConflicts()
  aiResolvingAll.value = false
}

async function handleContinue() {
  continueLoading.value = true
  const result = await chatStore.continueRebase()
  continueLoading.value = false

  if (result.success) {
    emit('close')
  }
  // If not success but rebaseInProgress, the store will have refreshed conflictState
}

async function handleAbort() {
  abortLoading.value = true
  await chatStore.abortRebase()
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
        <div class="w-full max-w-5xl mx-4 my-8 h-[80vh] bg-retro-dark border border-retro-border rounded-lg shadow-xl flex flex-col overflow-hidden">

          <!-- Header -->
          <div class="flex-shrink-0 px-4 py-3 border-b border-retro-border flex items-center justify-between">
            <div class="flex items-center gap-3">
              <ExclamationTriangleIcon class="w-5 h-5 text-retro-yellow" />
              <h3 class="text-sm font-mono text-retro-text font-semibold">Resolve Rebase Conflicts</h3>
              <span class="text-xs font-mono text-retro-muted">
                {{ resolvedCount }}/{{ totalCount }} resolved
              </span>
            </div>
            <div class="flex items-center gap-2">
              <!-- AI Resolve All -->
              <button
                v-if="unresolvedCount > 0"
                type="button"
                :disabled="aiResolvingAll || continueLoading || abortLoading"
                class="flex items-center gap-1 px-3 py-1.5 text-xs font-mono rounded border transition-colors
                  bg-retro-orange/10 border-retro-orange/50 text-retro-orange
                  hover:bg-retro-orange/20 disabled:opacity-40 disabled:cursor-not-allowed"
                @click="handleAiResolveAll"
              >
                <SparklesIcon class="w-3.5 h-3.5" />
                {{ aiResolvingAll ? 'AI Resolving...' : `AI Resolve All (${unresolvedCount})` }}
              </button>
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

          <!-- Body: split layout -->
          <div v-else class="flex-1 flex overflow-hidden">
            <!-- File list sidebar -->
            <div class="w-64 flex-shrink-0 border-r border-retro-border overflow-y-auto bg-retro-dark">
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

            <!-- Editor area -->
            <ConflictFileEditor
              v-if="currentFile"
              :file="currentFile"
              :resolved="isResolved(currentFile.path)"
              :ai-resolving="aiResolvingFile === currentFile.path || aiResolvingAll"
              @resolve="handleResolve"
              @ai-resolve="handleAiResolve"
            />
            <div v-else class="flex-1 flex items-center justify-center text-retro-muted text-sm font-mono">
              Select a file to resolve
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
