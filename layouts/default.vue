<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { Cog6ToothIcon, SunIcon, MoonIcon } from '@heroicons/vue/24/outline'
import FeaturesPanel from '~/components/features/FeaturesPanel.vue'
import ConversationsPanel from '~/components/conversations/ConversationsPanel.vue'
import ChatPanel from '~/components/chat/ChatPanel.vue'
import GitFileDiffViewer from '~/components/git/GitFileDiffViewer.vue'
import SettingsModal from '~/components/settings/SettingsModal.vue'
import ToastContainer from '~/components/common/ToastContainer.vue'
import { useLayoutStore } from '~/stores/layout'
import { useSettingsStore } from '~/stores/settings'
import { useChatStore } from '~/stores/chat'
import { useGitGraphStore } from '~/stores/gitGraph'
import { useTheme } from '~/composables/useTheme'

const layoutStore = useLayoutStore()
const settingsStore = useSettingsStore()
const chatStore = useChatStore()
const gitGraphStore = useGitGraphStore()
const { isDark, toggleTheme } = useTheme()

const isDiffViewerOpen = computed(() => gitGraphStore.diffViewerFile !== null)
const isChatFullscreen = computed(() => layoutStore.isChatFullscreen)

const showSettings = ref(false)
const workingDirectory = ref('')
const projectName = computed(() => {
  if (!workingDirectory.value) return ''
  const segments = workingDirectory.value.replace(/\/+$/, '').split('/')
  return segments[segments.length - 1] || ''
})

const pageTitle = computed(() =>
  projectName.value ? `spec cat :: ${projectName.value}` : 'spec cat'
)

useHead(() => ({
  title: pageTitle.value,
}))

const handleResize = () => {
  if (typeof window !== 'undefined') {
    layoutStore.updateViewport(window.innerWidth)
  }
}

onMounted(async () => {
  if (typeof window !== 'undefined') {
    layoutStore.updateViewport(window.innerWidth)
    window.addEventListener('resize', handleResize)
  }

  await settingsStore.hydrate()
  await chatStore.initialize()
  await chatStore.loadConversations()

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
  <div class="flex h-screen min-w-[320px] overflow-x-auto bg-retro-black text-retro-text">
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

    <!-- Diff viewer overlay (FR-088): replaces right 3 panels when active -->
    <div v-if="isDiffViewerOpen" class="flex flex-col overflow-hidden border-l border-retro-border" style="flex: 7">
      <GitFileDiffViewer
        :file="gitGraphStore.diffViewerFile!"
        :commit-hash="gitGraphStore.diffViewerCommitHash!"
        :content="gitGraphStore.diffViewerContent"
        :loading="gitGraphStore.diffViewerLoading"
        @close="gitGraphStore.closeFileDiff()"
      />
    </div>

    <!-- Normal layout: right 3 panels -->
    <template v-else>
      <!-- Column 2: Features (flex: 2 = 20%) -->
      <div class="flex flex-col overflow-hidden border-l border-retro-border" style="flex: 2">
        <FeaturesPanel />
      </div>

      <!-- Column 3: Conversations (flex: 2 = 20%) -->
      <div class="flex flex-col overflow-hidden border-l border-retro-border" style="flex: 2">
        <ConversationsPanel />
      </div>

      <!-- Column 4: Chat (flex: 3 = 30%) -->
      <div
        v-if="!isChatFullscreen"
        class="flex flex-col overflow-hidden border-l border-retro-border"
        style="flex: 3"
      >
        <ChatPanel />
      </div>
    </template>

    <!-- Settings modal -->
    <SettingsModal v-if="showSettings" @close="showSettings = false" />

    <!-- Toast notifications -->
    <ToastContainer />

    <!-- Fullscreen chat overlay -->
    <div v-if="isChatFullscreen" class="fixed inset-0 z-40 flex flex-col bg-retro-black">
      <ChatPanel />
    </div>
  </div>
</template>
