<script setup lang="ts">
import { useChatStore } from '~/stores/chat'
import { useLayoutStore } from '~/stores/layout'
import { useChatStream } from '~/composables/useChatStream'
import TerminalPanel from './TerminalPanel.vue'
import FinalizeConfirm from './FinalizeConfirm.vue'
import RebaseConfirm from './RebaseConfirm.vue'
import ConflictResolutionModal from './ConflictResolutionModal.vue'
import DeleteConfirmModal from './DeleteConfirmModal.vue'
import {
  TrashIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
} from '@heroicons/vue/24/outline'

const chatStore = useChatStore()
const layoutStore = useLayoutStore()
const { disconnectConversation, abort } = useChatStream()
const terminalPanelRef = ref<InstanceType<typeof TerminalPanel> | null>(null)

function focusChatInput() {
  nextTick(() => {
    terminalPanelRef.value?.focusTerminal()
  })
}

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

function handleToggleFullscreen() {
  layoutStore.toggleChatFullscreen()
}

async function handleNewConversation() {
  showDeleteConfirm.value = false
  const currentId = chatStore.activeConversationId
  if (currentId) {
    // Abort first when streaming so the server job is told to stop and the
    // streaming flag is cleared — disconnect alone leaks both.
    if (chatStore.isConversationStreaming(currentId)) {
      abort(currentId)
    }
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

type FinalizeStatus = { type: 'success' | 'error'; message: string }

interface ConversationPanelState {
  showFinalizeConfirm: boolean
  showRebaseConfirm: boolean
  finalizeStatus: FinalizeStatus | null
  finalizeCommitMessage: string
  finalizeTargetBranch: string
  rebaseTargetBranch: string
}

function createConversationPanelState(): ConversationPanelState {
  return {
    showFinalizeConfirm: false,
    showRebaseConfirm: false,
    finalizeStatus: null,
    finalizeCommitMessage: '',
    finalizeTargetBranch: '',
    rebaseTargetBranch: '',
  }
}

const conversationPanelStates = reactive<Record<string, ConversationPanelState>>({})

function getConversationPanelState(conversationId: string): ConversationPanelState {
  conversationPanelStates[conversationId] ??= createConversationPanelState()
  return conversationPanelStates[conversationId]
}

const activePanelState = computed(() => {
  const id = chatStore.activeConversationId
  return id ? getConversationPanelState(id) : null
})

const showFinalizeConfirm = computed({
  get: () => activePanelState.value?.showFinalizeConfirm ?? false,
  set: (value: boolean) => {
    const id = chatStore.activeConversationId
    if (id) getConversationPanelState(id).showFinalizeConfirm = value
  },
})

const showRebaseConfirm = computed({
  get: () => activePanelState.value?.showRebaseConfirm ?? false,
  set: (value: boolean) => {
    const id = chatStore.activeConversationId
    if (id) getConversationPanelState(id).showRebaseConfirm = value
  },
})

const finalizeStatus = computed({
  get: () => activePanelState.value?.finalizeStatus ?? null,
  set: (value: FinalizeStatus | null) => {
    const id = chatStore.activeConversationId
    if (id) getConversationPanelState(id).finalizeStatus = value
  },
})

const finalizeCommitMessage = computed({
  get: () => activePanelState.value?.finalizeCommitMessage ?? '',
  set: (value: string) => {
    const id = chatStore.activeConversationId
    if (id) getConversationPanelState(id).finalizeCommitMessage = value
  },
})

const finalizeTargetBranch = computed({
  get: () => activePanelState.value?.finalizeTargetBranch ?? '',
  set: (value: string) => {
    const id = chatStore.activeConversationId
    if (id) getConversationPanelState(id).finalizeTargetBranch = value
  },
})

const rebaseTargetBranch = computed({
  get: () => activePanelState.value?.rebaseTargetBranch ?? '',
  set: (value: string) => {
    const id = chatStore.activeConversationId
    if (id) getConversationPanelState(id).rebaseTargetBranch = value
  },
})

function setConversationStatus(conversationId: string, status: FinalizeStatus | null) {
  getConversationPanelState(conversationId).finalizeStatus = status
}

function clearConversationStatusLater(conversationId: string, status: FinalizeStatus, delayMs: number) {
  setTimeout(() => {
    const state = conversationPanelStates[conversationId]
    if (state?.finalizeStatus === status) {
      state.finalizeStatus = null
    }
  }, delayMs)
}

const isFinalized = computed(() => chatStore.activeConversation?.finalized === true)
const isReadOnly = computed(() => isFinalized.value)

// Compare worktree HEAD vs base branch
const baseCompare = ref<{ ahead: number; behind: number } | null>(null)
const baseCompareLoading = ref(false)

let baseCompareSeq = 0
async function refreshBaseCompare() {
  const conv = chatStore.activeConversation
  if (!conv?.worktreePath || !conv?.baseBranch) {
    baseCompareSeq++
    baseCompare.value = null
    return
  }

  const seq = ++baseCompareSeq
  baseCompareLoading.value = true
  try {
    const res = await $fetch<{ ahead: number; behind: number }>('/api/chat/compare', {
      params: {
        worktreePath: conv.worktreePath,
        baseBranch: conv.baseBranch,
      },
    })
    // Ignore stale responses that resolved after a newer request started.
    if (seq !== baseCompareSeq) return
    baseCompare.value = res
  } catch {
    if (seq !== baseCompareSeq) return
    baseCompare.value = null
  } finally {
    if (seq === baseCompareSeq) baseCompareLoading.value = false
  }
}

watch(
  () => [
    chatStore.activeConversationId,
    chatStore.activeConversation?.worktreePath,
    chatStore.activeConversation?.baseBranch,
    chatStore.activeConversation?.lastCommitTime,
    chatStore.activeConversation?.updatedAt,
    chatStore.isActiveConversationStreaming,
  ],
  () => { refreshBaseCompare() },
  { immediate: true }
)

watch(
  () => chatStore.activeConversationId,
  () => {
    focusChatInput()
  },
)

const isSameAsBase = computed(() =>
  baseCompare.value ? baseCompare.value.ahead === 0 && baseCompare.value.behind === 0 : false
)

const canPreview = computed(() => {
  const conv = chatStore.activeConversation
  return conv?.hasWorktree && !conv?.finalized
})

const canFinalize = computed(() => {
  const conv = chatStore.activeConversation
  return !!conv?.hasWorktree && !conv?.finalized && !chatStore.isActiveConversationStreaming && !isSameAsBase.value
})

const canRebase = computed(() => {
  const conv = chatStore.activeConversation
  return !!conv?.hasWorktree && !conv?.finalized
})

function handleFinalizeClick() {
  const id = chatStore.activeConversationId
  if (!id) return
  const state = getConversationPanelState(id)
  state.showFinalizeConfirm = true
  state.finalizeStatus = null
}

async function handleFinalizeConfirm(message: string, targetBranch: string) {
  const convId = chatStore.activeConversationId
  if (!convId) return

  const result = await chatStore.finalizeConversation(convId, message, targetBranch)
  getConversationPanelState(convId).showFinalizeConfirm = false

  if (result.success) {
    const status: FinalizeStatus = { type: 'success', message: `Merged to ${targetBranch}` }
    setConversationStatus(convId, status)
    clearConversationStatusLater(convId, status, 5000)
  } else if (result.rebaseInProgress) {
    setConversationStatus(convId, null)
  } else {
    const errorMsg = result.conflictFiles?.length
      ? `Conflict in: ${result.conflictFiles.join(', ')}`
      : result.error || 'Finalize failed'
    setConversationStatus(convId, { type: 'error', message: errorMsg })
  }
}

function handleFinalizeCancel() {
  const id = chatStore.activeConversationId
  if (id) getConversationPanelState(id).showFinalizeConfirm = false
}

function handleConflictResolutionClose() {
  const conv = chatStore.activeConversation
  if (!chatStore.conflictState && conv?.hasWorktree) {
    const baseBranch = conv.baseBranch || 'main'
    const status: FinalizeStatus = { type: 'success', message: `Rebased onto ${baseBranch}` }
    setConversationStatus(conv.id, status)
    clearConversationStatusLater(conv.id, status, 5000)
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
  setConversationStatus(convId, null)

  const wasActive = isPreviewActive.value
  const result = await chatStore.togglePreview(convId)

  if (result.success) {
    const msg = wasActive
      ? `Switched back to ${chatStore.activeConversation?.baseBranch}`
      : 'Preview active — main worktree updated'
    const status: FinalizeStatus = { type: 'success', message: msg }
    setConversationStatus(convId, status)
    clearConversationStatusLater(convId, status, 3000)
  } else {
    setConversationStatus(convId, { type: 'error', message: result.error || 'Preview toggle failed' })
  }

  previewLoading.value = false
}

function handleRebaseClick() {
  const id = chatStore.activeConversationId
  if (!id) return
  const state = getConversationPanelState(id)
  state.showRebaseConfirm = true
  state.finalizeStatus = null
}

async function handleRebaseConfirm(targetBranch: string) {
  const convId = chatStore.activeConversationId
  if (!convId) return

  const result = await chatStore.rebaseConversation(convId, targetBranch)
  getConversationPanelState(convId).showRebaseConfirm = false

  if (result.success) {
    const status: FinalizeStatus = { type: 'success', message: `Rebased onto ${targetBranch}` }
    setConversationStatus(convId, status)
    clearConversationStatusLater(convId, status, 5000)
  } else if (result.rebaseInProgress) {
    setConversationStatus(convId, null)
  } else {
    setConversationStatus(convId, { type: 'error', message: result.error || 'Rebase failed' })
  }
}

function handleRebaseCancel() {
  const id = chatStore.activeConversationId
  if (id) getConversationPanelState(id).showRebaseConfirm = false
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
          class="p-1.5 rounded text-retro-muted hover:text-retro-cyan hover:bg-retro-panel transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :title="isPreviewActive ? 'End preview: switch back to base branch' : 'Preview: test worktree changes in main worktree'"
          @click="handlePreviewToggle"
        >
          <EyeSlashIcon v-if="isPreviewActive" class="w-4 h-4 text-retro-cyan" />
          <EyeIcon v-else class="w-4 h-4" />
        </button>

        <!-- Rebase onto base button -->
        <button
          v-if="canRebase"
          :disabled="chatStore.isActiveConversationStreaming"
          class="p-1.5 rounded text-retro-muted hover:text-retro-cyan hover:bg-retro-panel transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :title="chatStore.isActiveConversationStreaming ? 'Rebase unavailable while Claude is responding' : 'Rebase: sync worktree onto target base branch'"
          @click="handleRebaseClick"
        >
          <svg
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="7" cy="4.5" r="1.5" fill="currentColor" />
            <circle cx="18" cy="20" r="1.5" fill="currentColor" />
            <circle cx="12" cy="7" r="1.4" fill="currentColor" opacity="0.9" />
            <path
              d="M7 6V16M7 16L4.5 13.5M7 16L9.5 13.5"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M8.4 7H12.5C15.5376 7 18 9.46243 18 12.5V18.5"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M15.5 16L18 18.5L20.5 16"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>

        <!-- Finalize button -->
        <button
          v-if="canFinalize"
          class="p-1.5 rounded text-retro-muted hover:text-retro-cyan hover:bg-retro-panel transition-colors"
          title="Finalize: squash & merge to base branch"
          @click="handleFinalizeClick"
        >
          <CheckCircleIcon class="w-4 h-4" />
        </button>

        <!-- Fullscreen toggle button -->
        <button
          class="p-1.5 rounded text-retro-muted hover:text-retro-cyan hover:bg-retro-panel transition-colors"
          :title="isChatFullscreen ? 'Exit fullscreen chat' : 'Fullscreen chat'"
          @click="handleToggleFullscreen"
        >
          <ArrowsPointingInIcon v-if="isChatFullscreen" class="w-4 h-4" />
          <ArrowsPointingOutIcon v-else class="w-4 h-4" />
        </button>

        <!-- New conversation button -->
        <button
          :disabled="!chatStore.hasMessages"
          class="p-1.5 rounded text-retro-muted hover:text-retro-cyan hover:bg-retro-panel disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="New conversation"
          @click="handleDeleteClick"
        >
          <TrashIcon class="w-4 h-4" />
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
      :conversation-id="chatStore.activeConversation.id"
      :base-branch="chatStore.activeConversation.baseBranch || 'main'"
      :worktree-branch="chatStore.activeConversation.worktreeBranch || ''"
      :worktree-path="chatStore.activeConversation.worktreePath || ''"
      v-model:commit-message="finalizeCommitMessage"
      v-model:target-branch="finalizeTargetBranch"
      @confirm="handleFinalizeConfirm"
      @cancel="handleFinalizeCancel"
    />

    <!-- Rebase confirmation panel -->
    <RebaseConfirm
      v-if="showRebaseConfirm && chatStore.activeConversation?.hasWorktree"
      :base-branch="chatStore.activeConversation.baseBranch || 'main'"
      :worktree-branch="chatStore.activeConversation.worktreeBranch || ''"
      :worktree-path="chatStore.activeConversation.worktreePath || ''"
      v-model:target-branch="rebaseTargetBranch"
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

    <!-- Claude terminal -->
    <div class="flex-1 min-h-0">
      <TerminalPanel ref="terminalPanelRef" :disabled="isReadOnly" />
    </div>
  </div>
</template>
