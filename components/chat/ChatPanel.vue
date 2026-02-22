<script setup lang="ts">
import { useChatStore } from '~/stores/chat'
import { useLayoutStore } from '~/stores/layout'
import { useChatStream } from '~/composables/useChatStream'
import ChatMessages from './ChatMessages.vue'
import ChatInput from './ChatInput.vue'
import ChatDebugPanel from './ChatDebugPanel.vue'
import FinalizeConfirm from './FinalizeConfirm.vue'
import RebaseConfirm from './RebaseConfirm.vue'
import ConflictResolutionModal from './ConflictResolutionModal.vue'
import DeleteConfirmModal from './DeleteConfirmModal.vue'
import {
  TrashIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  BugAntIcon,
} from '@heroicons/vue/24/outline'

const chatStore = useChatStore()
const layoutStore = useLayoutStore()
const { disconnectConversation } = useChatStream()

onMounted(async () => {
  try {
    const response = await $fetch<{ cwd: string }>('/api/cwd')
    chatStore.setCwd(response.cwd)
  } catch {
    // Fallback to empty
  }
})

const conversationTitle = computed(() => {
  const conv = chatStore.activeConversation
  return conv?.title || 'New Chat'
})

const showDeleteConfirm = ref(false)

const isChatFullscreen = computed(() => layoutStore.isChatFullscreen)
const showDebugPanel = ref(false)

watch(showDebugPanel, (enabled) => {
  chatStore.setDebugStreamEnabled(enabled)
})

onUnmounted(() => {
  chatStore.setDebugStreamEnabled(false)
})

function handleToggleFullscreen() {
  layoutStore.toggleChatFullscreen()
}

async function handleNewConversation() {
  showDeleteConfirm.value = false
  const currentId = chatStore.activeConversationId
  if (currentId) {
    disconnectConversation(currentId)
    await chatStore.deleteConversation(currentId)
  }
  chatStore.clearMessages()
}

function handleDeleteClick() {
  if (!chatStore.hasMessages) return
  showDeleteConfirm.value = true
}

function handleDeleteCancel() {
  showDeleteConfirm.value = false
}

// Finalize flow
const showFinalizeConfirm = ref(false)
const finalizeStatus = ref<{ type: 'success' | 'error'; message: string } | null>(null)

const isFinalized = computed(() => chatStore.activeConversation?.finalized === true)
const isAutoMode = computed(() => chatStore.activeConversation?.autoMode === true)
const isReadOnly = computed(() => isFinalized.value)

// Compare worktree HEAD vs base branch
const baseCompare = ref<{ ahead: number; behind: number } | null>(null)
const baseCompareLoading = ref(false)

async function refreshBaseCompare() {
  const conv = chatStore.activeConversation
  if (!conv?.worktreePath || !conv?.baseBranch) {
    baseCompare.value = null
    return
  }

  baseCompareLoading.value = true
  try {
    const res = await $fetch<{ ahead: number; behind: number }>('/api/chat/compare', {
      params: {
        worktreePath: conv.worktreePath,
        baseBranch: conv.baseBranch,
      },
    })
    baseCompare.value = res
  } catch {
    baseCompare.value = null
  } finally {
    baseCompareLoading.value = false
  }
}

watch(
  () => [chatStore.activeConversationId, chatStore.activeConversation?.worktreePath, chatStore.activeConversation?.baseBranch, chatStore.activeConversation?.lastCommitTime],
  () => { refreshBaseCompare() },
  { immediate: true }
)

const isSameAsBase = computed(() =>
  baseCompare.value ? baseCompare.value.ahead === 0 && baseCompare.value.behind === 0 : false
)

const canPreview = computed(() => {
  const conv = chatStore.activeConversation
  return conv?.hasWorktree && !conv?.finalized && !chatStore.isActiveConversationStreaming
})

const canFinalize = computed(() => {
  return canPreview.value && !isSameAsBase.value
})

function handleFinalizeClick() {
  showFinalizeConfirm.value = true
  finalizeStatus.value = null
}

async function handleFinalizeConfirm(message: string, targetBranch: string) {
  const convId = chatStore.activeConversationId
  if (!convId) return

  const result = await chatStore.finalizeConversation(convId, message, targetBranch)
  showFinalizeConfirm.value = false

  if (result.success) {
    finalizeStatus.value = { type: 'success', message: `Merged to ${targetBranch}` }
    setTimeout(() => { finalizeStatus.value = null }, 5000)
  } else if (result.rebaseInProgress) {
    finalizeStatus.value = null
  } else {
    const errorMsg = result.conflictFiles?.length
      ? `Conflict in: ${result.conflictFiles.join(', ')}`
      : result.error || 'Finalize failed'
    finalizeStatus.value = { type: 'error', message: errorMsg }
  }
}

function handleFinalizeCancel() {
  showFinalizeConfirm.value = false
}

function handleConflictResolutionClose() {
  if (!chatStore.conflictState && chatStore.activeConversation?.hasWorktree) {
    const baseBranch = chatStore.activeConversation?.baseBranch || 'main'
    finalizeStatus.value = { type: 'success', message: `Rebased onto ${baseBranch}` }
    setTimeout(() => { finalizeStatus.value = null }, 5000)
  } else {
    finalizeStatus.value = null
  }
}

// Preview flow
const previewLoading = ref(false)

const isPreviewActive = computed(() => {
  return !!chatStore.activeConversation?.previewBranch
})

async function handlePreviewToggle() {
  const convId = chatStore.activeConversationId
  if (!convId) return

  previewLoading.value = true
  finalizeStatus.value = null

  const wasActive = isPreviewActive.value
  const result = await chatStore.togglePreview(convId)

  if (result.success) {
    const msg = wasActive
      ? `Switched back to ${chatStore.activeConversation?.baseBranch}`
      : 'Preview active — main worktree updated'
    finalizeStatus.value = { type: 'success', message: msg }
    setTimeout(() => { finalizeStatus.value = null }, 3000)
  } else {
    finalizeStatus.value = { type: 'error', message: result.error || 'Preview toggle failed' }
  }

  previewLoading.value = false
}

// Rebase sync flow
const showRebaseConfirm = ref(false)

function handleRebaseClick() {
  showRebaseConfirm.value = true
  finalizeStatus.value = null
}

async function handleRebaseConfirm(targetBranch: string) {
  const convId = chatStore.activeConversationId
  if (!convId) return

  const result = await chatStore.rebaseConversation(convId, targetBranch)
  showRebaseConfirm.value = false

  if (result.success) {
    finalizeStatus.value = { type: 'success', message: `Rebased onto ${targetBranch}` }
    setTimeout(() => { finalizeStatus.value = null }, 5000)
  } else if (result.rebaseInProgress) {
    finalizeStatus.value = null
  } else {
    finalizeStatus.value = { type: 'error', message: result.error || 'Rebase failed' }
  }
}

function handleRebaseCancel() {
  showRebaseConfirm.value = false
}
</script>

<template>
  <div class="h-full flex flex-col bg-retro-black">
    <!-- Header with conversation title and action buttons -->
    <div class="flex-shrink-0 h-12 flex items-center justify-between px-4 border-b border-retro-border bg-retro-dark">
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-xs font-mono text-retro-text truncate">
          {{ conversationTitle }}
        </span>
      </div>

      <div class="flex items-center gap-1">
        <!-- Preview toggle button -->
        <button
          v-if="canPreview"
          :disabled="previewLoading"
          class="p-1.5 rounded hover:bg-retro-panel transition-colors disabled:opacity-40"
          :title="isPreviewActive ? 'End preview: switch back to base branch' : 'Preview: test worktree changes in main worktree'"
          @click="handlePreviewToggle"
        >
          <EyeSlashIcon v-if="isPreviewActive" class="w-4 h-4 text-retro-orange" />
          <EyeIcon v-else class="w-4 h-4 text-retro-cyan" />
        </button>

        <!-- Rebase onto base button -->
        <button
          v-if="canFinalize"
          class="p-1.5 rounded hover:bg-retro-panel transition-colors"
          title="Rebase: sync worktree onto target base branch"
          @click="handleRebaseClick"
        >
          <ArrowPathIcon class="w-4 h-4 text-retro-purple" />
        </button>

        <!-- Finalize button -->
        <button
          v-if="canFinalize"
          class="p-1.5 rounded hover:bg-retro-panel transition-colors"
          title="Finalize: squash & merge to base branch"
          @click="handleFinalizeClick"
        >
          <CheckCircleIcon class="w-4 h-4 text-retro-green" />
        </button>

        <!-- Fullscreen toggle button -->
        <button
          class="p-1.5 rounded hover:bg-retro-panel transition-colors"
          :title="isChatFullscreen ? 'Exit fullscreen chat' : 'Fullscreen chat'"
          @click="handleToggleFullscreen"
        >
          <ArrowsPointingInIcon v-if="isChatFullscreen" class="w-4 h-4 text-retro-muted" />
          <ArrowsPointingOutIcon v-else class="w-4 h-4 text-retro-muted" />
        </button>

        <button
          class="p-1.5 rounded hover:bg-retro-panel transition-colors"
          :title="showDebugPanel ? 'Hide debug stream' : 'Show debug stream'"
          @click="showDebugPanel = !showDebugPanel"
        >
          <BugAntIcon class="w-4 h-4" :class="showDebugPanel ? 'text-retro-yellow' : 'text-retro-muted'" />
        </button>

        <!-- New conversation button -->
        <button
          :disabled="!chatStore.hasMessages"
          class="p-1.5 rounded hover:bg-retro-panel disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="New conversation"
          @click="handleDeleteClick"
        >
          <TrashIcon class="w-4 h-4 text-retro-muted" />
        </button>
      </div>
    </div>

    <DeleteConfirmModal
      :show="showDeleteConfirm"
      :title="conversationTitle"
      @confirm="handleNewConversation"
      @cancel="handleDeleteCancel"
    />

    <!-- Finalize confirmation panel -->
    <FinalizeConfirm
      v-if="showFinalizeConfirm && chatStore.activeConversation?.hasWorktree"
      :base-branch="chatStore.activeConversation.baseBranch || 'main'"
      :worktree-branch="chatStore.activeConversation.worktreeBranch || ''"
      :worktree-path="chatStore.activeConversation.worktreePath || ''"
      @confirm="handleFinalizeConfirm"
      @cancel="handleFinalizeCancel"
    />

    <!-- Rebase confirmation panel -->
    <RebaseConfirm
      v-if="showRebaseConfirm && chatStore.activeConversation?.hasWorktree"
      :base-branch="chatStore.activeConversation.baseBranch || 'main'"
      :worktree-branch="chatStore.activeConversation.worktreeBranch || ''"
      :worktree-path="chatStore.activeConversation.worktreePath || ''"
      @confirm="handleRebaseConfirm"
      @cancel="handleRebaseCancel"
    />

    <!-- Conflict resolution modal -->
    <ConflictResolutionModal
      v-if="chatStore.conflictState"
      @close="handleConflictResolutionClose"
    />

    <!-- Finalize status message -->
    <div
      v-if="finalizeStatus"
      class="flex-shrink-0 px-4 py-2 border-b border-retro-border text-xs font-mono"
      :class="finalizeStatus.type === 'success' ? 'bg-retro-green/10 text-retro-green' : 'bg-retro-red/10 text-retro-red'"
    >
      {{ finalizeStatus.message }}
      <button
        v-if="finalizeStatus.type === 'error'"
        class="ml-2 underline hover:no-underline"
        @click="finalizeStatus = null"
      >
        dismiss
      </button>
    </div>

    <!-- Finalized banner (T032: FR-014) -->
    <div
      v-if="isFinalized"
      class="flex-shrink-0 px-4 py-2 border-b border-retro-border bg-retro-green/10 text-retro-green text-xs font-mono text-center"
    >
      This conversation has been finalized and is read-only.
    </div>

    <!-- Chat messages -->
    <div class="flex-1 min-h-0 flex flex-col">
      <ChatMessages class="flex-1 overflow-hidden" />
      <ChatDebugPanel v-if="showDebugPanel" />
    </div>

    <!-- Chat input -->
    <ChatInput :disabled="isReadOnly" />
  </div>
</template>
