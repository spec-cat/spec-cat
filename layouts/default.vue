<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import {
  ChatBubbleLeftRightIcon,
  CodeBracketSquareIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  MoonIcon,
  QueueListIcon,
  SunIcon,
} from '@heroicons/vue/24/outline'
import FeaturesPanel from '~/components/features/FeaturesPanel.vue'
import ConversationsPanel from '~/components/conversations/ConversationsPanel.vue'
import ChatPanel from '~/components/chat/ChatPanel.vue'
import GitFileDiffViewer from '~/components/git/GitFileDiffViewer.vue'
import SettingsModal from '~/components/settings/SettingsModal.vue'
import ToastContainer from '~/components/common/ToastContainer.vue'
import SplashScreen from '~/components/common/SplashScreen.vue'
import { useLayoutStore } from '~/stores/layout'
import { useSettingsStore } from '~/stores/settings'
import { useChatStore } from '~/stores/chat'
import { useGitGraphStore } from '~/stores/gitGraph'
import { useTheme } from '~/composables/useTheme'
import { useGlobalNotifications } from '~/composables/useGlobalNotifications'
import { useChatStream } from '~/composables/useChatStream'

const layoutStore = useLayoutStore()
const settingsStore = useSettingsStore()
const chatStore = useChatStore()
const gitGraphStore = useGitGraphStore()
const { isDark, toggleTheme } = useTheme()
const { tryResumeStreaming } = useChatStream()
const { resumeActiveServerJobs } = useGlobalNotifications()

const isDiffViewerOpen = computed(() => gitGraphStore.diffViewerFile !== null)
const isMobile = computed(() => layoutStore.isMobile)
const isChatFullscreen = computed(() => layoutStore.isChatFullscreen)
const rightColumnsHidden = computed(() => isChatFullscreen.value)
const chatColumnFlex = computed(() => (isChatFullscreen.value ? 7 : 3))

const showSettings = ref(false)
const workingDirectory = ref('')

type MobilePanelId = 'git' | 'features' | 'conversations' | 'chat'

const activeMobilePanel = ref<MobilePanelId>('chat')
const mobileTabs: Array<{
  id: MobilePanelId
  label: string
  icon: typeof CodeBracketSquareIcon
}> = [
  { id: 'git', label: 'Git', icon: CodeBracketSquareIcon },
  { id: 'features', label: 'Specs', icon: DocumentTextIcon },
  { id: 'conversations', label: 'Threads', icon: QueueListIcon },
  { id: 'chat', label: 'Chat', icon: ChatBubbleLeftRightIcon },
]

const activeMobilePanelLabel = computed(() =>
  mobileTabs.find(tab => tab.id === activeMobilePanel.value)?.label ?? 'Chat'
)

const projectName = computed(() => {
  if (!workingDirectory.value) return ''
  const segments = workingDirectory.value.replace(/\/+$/, '').split('/')
  return segments[segments.length - 1] || ''
})

const pageTitle = computed(() =>
  projectName.value ? `spec cat :: ${projectName.value}` : 'spec cat'
)

function findInterruptedStreamingConversationIds(): string[] {
  return chatStore.conversations
    .filter((conversation) => {
      const lastAssistantMessage = [...conversation.messages]
        .reverse()
        .find(message => message.role === 'assistant')
      return lastAssistantMessage?.status === 'streaming'
    })
    .map(conversation => conversation.id)
}

useHead(() => ({
  title: pageTitle.value,
}))

const handleResize = () => {
  if (typeof window !== 'undefined') {
    layoutStore.updateViewport(window.innerWidth)
  }
}

watch(isMobile, (mobile) => {
  if (mobile && isChatFullscreen.value) {
    layoutStore.setChatFullscreen(false)
  }
})

watch(
  () => chatStore.activeConversationId,
  (conversationId, previousConversationId) => {
    if (
      isMobile.value
      && activeMobilePanel.value === 'conversations'
      && conversationId
      && conversationId !== previousConversationId
    ) {
      activeMobilePanel.value = 'chat'
    }
  },
)

onMounted(async () => {
  if (typeof window !== 'undefined') {
    layoutStore.updateViewport(window.innerWidth)
    window.addEventListener('resize', handleResize)
  }

  await settingsStore.hydrate()
  await chatStore.initialize()
  await chatStore.loadConversations()

  // Resume every conversation that was mid-stream before page reload.
  // The per-conversation resume path verifies server job state before
  // marking the card as streaming.
  const streamingConversationIds = findInterruptedStreamingConversationIds()
  await Promise.allSettled(
    streamingConversationIds.map(conversationId => tryResumeStreaming(conversationId)),
  )
  await resumeActiveServerJobs()

  try {
    const response = await $fetch<{ cwd: string }>('/api/cwd')
    workingDirectory.value = response.cwd
  } catch {
    workingDirectory.value = ''
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleResize)
  }
})
</script>

<template>
  <div class="h-screen min-w-[320px] overflow-hidden bg-retro-black text-retro-text">
    <div v-if="isMobile" class="flex h-full flex-col overflow-hidden">
      <header class="flex-shrink-0 border-b border-retro-border bg-retro-panel">
        <div class="flex h-14 items-center justify-between gap-3 px-3">
          <div class="flex items-center gap-2 min-w-0">
            <img alt="SpecCat" src="/app-logo.svg" class="w-5 h-5 text-retro-cyan mb-1" />
            <div class="min-w-0">
              <div class="text-xs font-bold text-retro-cyan font-mono uppercase tracking-wider">SPECCAT</div>
              <div class="text-[11px] text-retro-muted font-mono truncate">
                {{ projectName ? `${projectName} / ${activeMobilePanelLabel}` : activeMobilePanelLabel }}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="p-2 rounded transition-colors text-retro-muted hover:text-retro-text hover:bg-retro-black"
              :title="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
              @click="toggleTheme"
            >
              <SunIcon v-if="isDark" class="w-5 h-5" />
              <MoonIcon v-else class="w-5 h-5" />
            </button>
            <button
              type="button"
              class="p-2 rounded transition-colors text-retro-muted hover:text-retro-text hover:bg-retro-black"
              title="Settings"
              @click="showSettings = true"
            >
              <Cog6ToothIcon class="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main class="relative flex-1 min-h-0 overflow-hidden">
        <section
          v-show="activeMobilePanel === 'git'"
          class="absolute inset-0 flex flex-col overflow-hidden"
          aria-label="Git"
        >
          <GitGraph :working-directory="workingDirectory" :is-active="activeMobilePanel === 'git'" />
        </section>
        <section
          v-show="activeMobilePanel === 'features'"
          class="absolute inset-0 flex flex-col overflow-hidden"
          aria-label="Specs"
        >
          <FeaturesPanel />
        </section>
        <section
          v-show="activeMobilePanel === 'conversations'"
          class="absolute inset-0 flex flex-col overflow-hidden"
          aria-label="Conversations"
        >
          <ConversationsPanel />
        </section>
        <section
          v-show="activeMobilePanel === 'chat'"
          class="absolute inset-0 flex flex-col overflow-hidden"
          aria-label="Chat"
        >
          <ChatPanel />
        </section>

        <div
          v-if="isDiffViewerOpen"
          class="absolute inset-0 z-30 flex flex-col overflow-hidden bg-retro-black"
        >
          <GitFileDiffViewer
            :file="gitGraphStore.diffViewerFile!"
            :commit-hash="gitGraphStore.diffViewerCommitHash!"
            :content="gitGraphStore.diffViewerContent"
            :loading="gitGraphStore.diffViewerLoading"
            @close="gitGraphStore.closeFileDiff()"
          />
        </div>
      </main>

      <nav
        class="flex-shrink-0 border-t border-retro-border bg-retro-panel"
        aria-label="Mobile primary navigation"
      >
        <div class="grid h-16 grid-cols-4">
          <button
            v-for="tab in mobileTabs"
            :key="tab.id"
            type="button"
            class="flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-mono transition-colors"
            :class="activeMobilePanel === tab.id
              ? 'text-retro-cyan bg-retro-cyan/10'
              : 'text-retro-muted hover:text-retro-text hover:bg-retro-black'"
            :aria-current="activeMobilePanel === tab.id ? 'page' : undefined"
            @click="activeMobilePanel = tab.id"
          >
            <component :is="tab.icon" class="h-5 w-5 flex-shrink-0" />
            <span class="truncate">{{ tab.label }}</span>
          </button>
        </div>
      </nav>
    </div>

    <div v-else class="flex h-full overflow-x-auto">
      <!-- Column 1: Git Tree (flex: 3 = 30%) -->
      <div class="flex flex-col overflow-hidden" style="flex: 3">
      <div class="flex-shrink-0 h-14 flex items-center justify-between px-4 border-b border-retro-border bg-retro-panel">
        <div class="flex items-center gap-2 min-w-0">
          <img alt="SpecCat" src="/app-logo.svg" class="w-5 h-5 text-retro-cyan mb-1" />
          <span class="text-sm font-bold text-retro-cyan font-mono uppercase tracking-wider flex-shrink-0">SPECCAT</span>
          <span v-if="projectName" class="text-xs text-retro-muted font-mono truncate">/ {{ projectName }}</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="p-2 rounded transition-colors text-retro-muted hover:text-retro-text hover:bg-retro-panel"
            :title="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
            @click="toggleTheme"
          >
            <SunIcon v-if="isDark" class="w-5 h-5" />
            <MoonIcon v-else class="w-5 h-5" />
          </button>
          <button
            type="button"
            class="p-2 rounded transition-colors text-retro-muted hover:text-retro-text hover:bg-retro-panel"
            title="Settings"
            @click="showSettings = true"
          >
            <Cog6ToothIcon class="w-5 h-5" />
          </button>
        </div>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto">
        <GitGraph :working-directory="workingDirectory" />
      </div>
    </div>

    <!-- Right 3 panels (always mounted) -->
    <div class="relative flex min-w-0" style="flex: 7">
      <!-- Column 2: Features (flex: 2 = 20%) -->
      <div
        v-if="!rightColumnsHidden"
        class="flex flex-col overflow-hidden border-l border-retro-border"
        style="flex: 2"
      >
        <FeaturesPanel />
      </div>

      <!-- Column 3: Conversations (flex: 2 = 20%) -->
      <div
        v-if="!rightColumnsHidden"
        class="flex flex-col overflow-hidden border-l border-retro-border"
        style="flex: 2"
      >
        <ConversationsPanel />
      </div>

      <!-- Column 4: Chat (flex: 3 = 30%) -->
      <div
        class="flex flex-col overflow-hidden border-l border-retro-border"
        :style="{ flex: chatColumnFlex }"
      >
        <ChatPanel />
      </div>

      <!-- Diff viewer overlay (FR-088): overlays right panels without unmounting -->
      <div
        v-if="isDiffViewerOpen"
        class="absolute inset-0 z-30 flex flex-col overflow-hidden border-l border-retro-border bg-retro-black"
      >
        <GitFileDiffViewer
          :file="gitGraphStore.diffViewerFile!"
          :commit-hash="gitGraphStore.diffViewerCommitHash!"
          :content="gitGraphStore.diffViewerContent"
          :loading="gitGraphStore.diffViewerLoading"
          @close="gitGraphStore.closeFileDiff()"
        />
      </div>
    </div>
    </div>

    <!-- Settings modal -->
    <SettingsModal v-if="showSettings" @close="showSettings = false" />

    <!-- Toast notifications -->
    <ToastContainer />

    <!-- Splash screen -->
    <SplashScreen />

    <!-- Nuxt page outlet for route content -->
    <slot />
  </div>
</template>
