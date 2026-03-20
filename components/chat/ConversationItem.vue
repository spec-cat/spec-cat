<script setup lang="ts">
/**
 * ConversationItem Component (T042, T050, T027, T028)
 * Displays a single conversation in the list with title, preview, timestamp, and actions.
 * Includes preview state indicator and toggle button (FR-011, FR-012).
 */
import { ref, computed } from 'vue' 
import {
  ArchiveBoxIcon,
  PencilIcon,
  CodeBracketIcon,
  FolderIcon,
} from '@heroicons/vue/24/outline'
import type { Conversation } from '~/types/chat'

const props = defineProps<{
  conversation: Conversation
  isActive: boolean
  isStreaming?: boolean
  isPreviewing?: boolean
}>()

const emit = defineEmits<{
  select: []
  archive: []
  rename: [title: string]
}>()

// Inline editing state (T050)
const isEditing = ref(false)
const editTitle = ref('')

function startEdit() {
  editTitle.value = props.conversation.title
  isEditing.value = true
}

function saveEdit() {
  const trimmedTitle = editTitle.value.trim()
  if (trimmedTitle && trimmedTitle !== props.conversation.title) {
    emit('rename', trimmedTitle)
  }
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
}

// Clipboard copy with toast
const toast = useToast()
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard', 1500)
  } catch {
    toast.error('Failed to copy')
  }
}

// Last message preview (FR-024)
const lastMessagePreview = computed(() => {
  const msgs = props.conversation.messages
  if (!msgs.length) return 'No messages'
  const last = msgs[msgs.length - 1]
  const preview = last.content.slice(0, 60)
  return preview.length < last.content.length ? preview + '...' : preview
})

// Formatted date (FR-024)
const formattedDate = computed(() => {
  const date = new Date(props.conversation.updatedAt)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    // Today - show time
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return `${diffDays} days ago`
  } else {
    return date.toLocaleDateString()
  }
})

</script>

<template>
  <div
    class="p-3 rounded border cursor-pointer transition-colors"
    :class="[
      isPreviewing && isActive
        ? 'border-retro-magenta bg-retro-magenta/15 ring-1 ring-retro-magenta/40'
        : isPreviewing
          ? 'border-retro-magenta/40 bg-retro-magenta/5'
          : isActive
            ? 'border-retro-cyan/80 bg-retro-cyan/8'
            : 'border-retro-border hover:border-retro-cyan/40',
      isStreaming && isPreviewing && isActive ? 'streaming-preview-active-border'
        : isStreaming && isPreviewing ? 'streaming-preview-border'
        : isStreaming ? 'streaming-border' : '',
      conversation.finalized ? 'opacity-50' : ''
    ]"
    @click="emit('select')"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1 min-w-0">
        <!-- Title editing mode -->
        <div v-if="isEditing" class="flex gap-2" @click.stop>
          <input
            v-model="editTitle"
            @keyup.enter="saveEdit"
            @keyup.escape="cancelEdit"
            @blur="saveEdit"
            class="flex-1 px-2 py-1 text-sm font-mono bg-retro-black border border-retro-cyan rounded text-retro-text focus:outline-none focus:ring-1 focus:ring-retro-cyan"
            autofocus
          />
        </div>

        <!-- Title display mode -->
        <div v-else class="flex items-center gap-2">
          <h3 class="text-sm font-mono text-retro-text truncate">
            {{ conversation.title }}
          </h3>
          <!-- Finalized badge (FR-014) -->
          <span
            v-if="conversation.finalized"
            class="text-xs font-mono text-retro-green bg-retro-green/10 px-1.5 py-0.5 rounded flex-shrink-0"
          >
            finalized
          </span>
          <!-- Previewing badge (T027: FR-012) -->
          <span
            v-else-if="isPreviewing"
            class="text-xs font-mono px-1.5 py-0.5 rounded border border-retro-magenta/30 flex-shrink-0"
            :class="isActive ? 'text-retro-magenta bg-retro-magenta/15' : 'text-retro-magenta/80 bg-retro-magenta/5'"
          >
            previewing
          </span>
          <!-- Streaming badge -->
          <span
            v-if="isStreaming"
            class="text-xs font-mono text-retro-cyan bg-retro-cyan/10 px-1.5 py-0.5 rounded border border-retro-cyan/30 flex-shrink-0"
          >
            streaming
          </span>
        </div>


        <!-- Preview and timestamp -->
        <p class="text-xs text-retro-muted mt-1 truncate">
          {{ lastMessagePreview }}
        </p>
        <p class="text-xs text-retro-muted/60 mt-1">
          {{ formattedDate }}
        </p>
        <!-- Worktree info (click to copy) -->
        <div v-if="conversation.worktreeBranch || conversation.baseBranch" class="mt-1.5 flex flex-wrap gap-1" @click.stop>
          <button
            v-if="conversation.baseBranch"
            @click="copyToClipboard(conversation.baseBranch!)"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono rounded border border-retro-cyan/30 text-retro-cyan hover:border-retro-cyan hover:bg-retro-cyan/10 transition-colors max-w-full"
            title="Click to copy base branch"
          >
            <CodeBracketIcon class="w-3 h-3 flex-shrink-0" />
            <span class="truncate">base: {{ conversation.baseBranch }}</span>
          </button>
          <button
            @click="copyToClipboard(conversation.worktreeBranch!)"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono rounded border border-retro-green/30 text-retro-green hover:border-retro-green hover:bg-retro-green/10 transition-colors max-w-full"
            title="Click to copy branch"
          >
            <CodeBracketIcon class="w-3 h-3 flex-shrink-0" />
            <span class="truncate">{{ conversation.worktreeBranch }}</span>
          </button>
          <button
            v-if="conversation.worktreePath"
            @click="copyToClipboard(conversation.worktreePath!)"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono rounded border border-retro-muted/30 text-retro-muted hover:border-retro-muted hover:bg-retro-muted/10 transition-colors max-w-full"
            title="Click to copy path"
          >
            <FolderIcon class="w-3 h-3 flex-shrink-0" />
            <span class="truncate">{{ conversation.worktreePath }}</span>
          </button>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="flex gap-1 flex-shrink-0" @click.stop>
        <button
          @click="startEdit"
          class="p-1 hover:bg-retro-panel rounded transition-colors"
          title="Rename conversation"
        >
          <PencilIcon class="w-4 h-4 text-retro-muted hover:text-retro-cyan" />
        </button>
        <button
          @click="emit('archive')"
          class="p-1 hover:bg-retro-cyan/20 rounded transition-colors"
          title="Archive conversation"
        >
          <ArchiveBoxIcon class="w-4 h-4 text-retro-muted hover:text-retro-cyan" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.streaming-border {
  position: relative;
  overflow: hidden;
  border-color: rgb(var(--color-retro-cyan) / 0.4) !important;
  background-image: linear-gradient(
    270deg,
    rgb(var(--color-retro-cyan) / 0.04),
    rgb(var(--color-retro-cyan) / 0.12),
    rgb(var(--color-retro-cyan) / 0.04),
    rgb(var(--color-retro-cyan) / 0.12)
  ) !important;
  background-size: 300% 100% !important;
  background-color: transparent !important;
  animation: streaming-bg-sweep 3s ease-in-out infinite;
}

.streaming-preview-border {
  position: relative;
  overflow: hidden;
  border-color: rgb(var(--color-retro-magenta) / 0.3) !important;
  background-image: linear-gradient(
    270deg,
    rgb(var(--color-retro-magenta) / 0.03),
    rgb(var(--color-retro-magenta) / 0.08),
    rgb(var(--color-retro-magenta) / 0.03),
    rgb(var(--color-retro-magenta) / 0.08)
  ) !important;
  background-size: 300% 100% !important;
  background-color: transparent !important;
  animation: streaming-bg-sweep 3s ease-in-out infinite;
}

.streaming-preview-active-border {
  position: relative;
  overflow: hidden;
  border-color: rgb(var(--color-retro-magenta) / 0.7) !important;
  box-shadow: 0 0 0 1px rgb(var(--color-retro-magenta) / 0.3);
  background-image: linear-gradient(
    270deg,
    rgb(var(--color-retro-cyan) / 0.06),
    rgb(var(--color-retro-magenta) / 0.18),
    rgb(var(--color-retro-cyan) / 0.06),
    rgb(var(--color-retro-magenta) / 0.18)
  ) !important;
  background-size: 300% 100% !important;
  background-color: transparent !important;
  animation: streaming-bg-sweep 3s ease-in-out infinite;
}

@keyframes streaming-bg-sweep {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}
</style>
