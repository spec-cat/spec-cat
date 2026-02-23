<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  XMarkIcon,
  ArrowLeftIcon,
  ClipboardDocumentListIcon,
  QuestionMarkCircleIcon,
  BoltIcon,
  ShieldExclamationIcon,
} from '@heroicons/vue/24/outline'
import { useSettingsStore, type Theme } from '~/stores/settings'
import { useToast } from '~/composables/useToast'
import ProviderSelector from '~/components/settings/ProviderSelector.vue'
import type { AIProviderMetadata, AIProviderSelection } from '~/types/aiProvider'
import { PERMISSION_MODE_LABELS, PERMISSION_MODE_DESCRIPTIONS, type PermissionMode } from '~/types/chat'

const emit = defineEmits<{
  close: []
}>()

const settingsStore = useSettingsStore()
const runtimeConfig = useRuntimeConfig()
const toast = useToast()
const activePage = ref<'main' | 'provider'>('main')
const reindexPending = ref(false)
const appVersion = computed(() => runtimeConfig.public.appVersion || 'unknown')

const THEME_OPTIONS: { value: Theme; label: string; description: string }[] = [
  { value: 'dark', label: 'Dark', description: 'Retro terminal theme with dark backgrounds' },
  { value: 'light', label: 'Light', description: 'Bright theme for well-lit environments' },
]

const PERMISSION_MODE_OPTIONS: { value: PermissionMode; label: string; description: string; icon: typeof ClipboardDocumentListIcon; color: string }[] = [
  { value: 'plan', label: PERMISSION_MODE_LABELS.plan, description: PERMISSION_MODE_DESCRIPTIONS.plan, icon: ClipboardDocumentListIcon, color: 'text-retro-cyan' },
  { value: 'ask', label: PERMISSION_MODE_LABELS.ask, description: PERMISSION_MODE_DESCRIPTIONS.ask, icon: QuestionMarkCircleIcon, color: 'text-retro-green' },
  { value: 'auto', label: PERMISSION_MODE_LABELS.auto, description: PERMISSION_MODE_DESCRIPTIONS.auto, icon: BoltIcon, color: 'text-retro-yellow' },
  { value: 'bypass', label: PERMISSION_MODE_LABELS.bypass, description: PERMISSION_MODE_DESCRIPTIONS.bypass, icon: ShieldExclamationIcon, color: 'text-retro-red' },
]

const { data: providerResponse, pending: providersLoading, error: providersError } = useAsyncData<{ providers: AIProviderMetadata[] }>(
  'ai-providers',
  () => $fetch<{ providers: AIProviderMetadata[] }>('/api/ai/providers'),
  { server: false },
)
const providers = computed(() => providerResponse.value?.providers ?? [])
const providerErrorMessage = computed(() => {
  const err = providersError.value
  if (!err) return null
  return err instanceof Error ? err.message : String(err)
})

const { data: specStatus, refresh: refreshSpecStatus } = useAsyncData(
  'spec-search-status',
  () => $fetch<{
    fileCount: number
    chunkCount: number
    isIndexing: boolean
    currentJob: string | null
    lastIndexedAt: string | null
    schedulerActive: boolean
  }>('/api/specs/status'),
  { server: false, default: () => null },
)

const specStatusSummary = computed(() => {
  const status = specStatus.value
  if (!status) return 'Status unavailable'

  if (status.isIndexing) {
    return `Indexing (${status.currentJob || 'running'})`
  }

  if (!status.schedulerActive) {
    return 'Scheduler inactive'
  }

  return `Indexed ${status.fileCount} files / ${status.chunkCount} chunks`
})

onMounted(() => {
  settingsStore.hydrate()
})

const handleProviderSelection = (selection: AIProviderSelection) => {
  settingsStore.setProviderSelection(selection)
  toast.success('Settings saved')
}

const openProviderSettings = () => {
  activePage.value = 'provider'
}

const goBack = () => {
  activePage.value = 'main'
}

const handleThemeChange = (theme: Theme) => {
  settingsStore.setTheme(theme)
  toast.success('Settings saved')
}

const handlePermissionModeChange = (mode: PermissionMode) => {
  settingsStore.setPermissionMode(mode)
  toast.success('Settings saved')
}

const handleConcurrencyChange = (event: Event) => {
  const value = parseInt((event.target as HTMLInputElement).value, 10)
  if (!isNaN(value)) {
    settingsStore.setAutoModeConcurrency(value)
    toast.success('Settings saved')
  }
}

const handleAutoGenerateCommitMessagesChange = (enabled: boolean) => {
  settingsStore.setAutoGenerateCommitMessages(enabled)
  toast.success('Settings saved')
}

const handleBackdropClick = () => {
  emit('close')
}

const handleReindexSpecs = async () => {
  if (reindexPending.value) return
  reindexPending.value = true
  try {
    const response = await $fetch<{ status: string; success: boolean; error?: string }>('/api/specs/reindex', {
      method: 'POST',
      body: {},
    })
    if (!response.success && response.status === 'already-indexing') {
      toast.info('Spec index is already running')
    } else {
      toast.success('Spec reindex started')
    }
    await refreshSpecStatus()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Failed to start spec reindex')
  } finally {
    reindexPending.value = false
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

let statusTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  statusTimer = setInterval(() => {
    void refreshSpecStatus()
  }, 5000)
})
onUnmounted(() => {
  if (statusTimer) clearInterval(statusTimer)
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/70"
        @click="handleBackdropClick"
      />
      <!-- Modal content -->
      <div class="relative w-[90vw] max-w-lg bg-retro-black border border-retro-border rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <!-- Modal header -->
        <div class="flex-shrink-0 h-12 flex items-center justify-between px-4 border-b border-retro-border bg-retro-dark">
          <div class="flex items-center gap-2">
            <button
              v-if="activePage === 'provider'"
              type="button"
              class="p-1.5 rounded text-retro-muted hover:text-retro-text hover:bg-retro-panel transition-colors"
              title="Back"
              @click="goBack"
            >
              <ArrowLeftIcon class="h-4 w-4" />
            </button>
            <h2 class="text-sm font-mono text-retro-text">
              {{ activePage === 'provider' ? 'AI Provider Settings' : 'Settings' }}
            </h2>
          </div>
          <button
            type="button"
            class="p-1.5 rounded text-retro-muted hover:text-retro-text hover:bg-retro-panel transition-colors"
            title="Close"
            @click="emit('close')"
          >
            <XMarkIcon class="h-4 w-4" />
          </button>
        </div>

        <!-- Modal body -->
        <div class="p-6 overflow-y-auto max-h-[70vh] space-y-6">
          <section v-if="activePage === 'main'">
            <div class="space-y-6">
              <!-- Theme Section -->
              <section>
            <h3 class="text-sm font-mono font-semibold text-retro-text mb-1">Theme</h3>
            <p class="text-xs text-retro-muted mb-3">
              Choose between dark and light appearance.
            </p>

            <div class="space-y-1.5">
              <label
                v-for="option in THEME_OPTIONS"
                :key="option.value"
                class="flex items-center gap-3 px-3 py-2 rounded border cursor-pointer transition-colors"
                :class="[
                  settingsStore.theme === option.value
                    ? 'border-retro-cyan bg-retro-cyan/10'
                    : 'border-retro-border bg-retro-panel hover:border-retro-muted'
                ]"
              >
                <input
                  type="radio"
                  name="theme"
                  :value="option.value"
                  :checked="settingsStore.theme === option.value"
                  class="w-3.5 h-3.5 text-retro-cyan accent-retro-cyan"
                  @change="handleThemeChange(option.value)"
                >
                <div class="flex-1">
                  <div class="text-sm font-mono text-retro-text">{{ option.label }}</div>
                  <div class="text-xs text-retro-muted leading-tight">{{ option.description }}</div>
                </div>
              </label>
            </div>
          </section>

              <div class="border-t border-retro-border" />

              <!-- Provider Navigation Section -->
              <section>
                <h3 class="text-sm font-mono font-semibold text-retro-text mb-1">AI Provider</h3>
                <p class="text-xs text-retro-muted mb-3">
                  Configure provider and model settings for new conversations.
                </p>
                <button
                  type="button"
                  class="w-full flex items-center justify-between px-3 py-2 rounded border border-retro-border bg-retro-panel hover:border-retro-muted transition-colors"
                  @click="openProviderSettings"
                >
                  <span class="text-sm font-mono text-retro-text">Provider Settings</span>
                  <span class="text-xs font-mono text-retro-muted">
                    {{ settingsStore.providerSelection.providerId }} / {{ settingsStore.providerSelection.modelKey }}
                  </span>
                </button>
              </section>

              <div class="border-t border-retro-border" />

              <section>
                <h3 class="text-sm font-mono font-semibold text-retro-text mb-1">Spec Search Index</h3>
                <p class="text-xs text-retro-muted mb-3">
                  {{ specStatusSummary }}
                </p>
                <button
                  type="button"
                  class="w-full flex items-center justify-center px-3 py-2 rounded border border-retro-border bg-retro-panel text-retro-text hover:border-retro-muted transition-colors disabled:opacity-60"
                  :disabled="reindexPending || specStatus?.isIndexing"
                  @click="handleReindexSpecs"
                >
                  {{ reindexPending ? 'Starting reindex...' : 'Reindex Specs' }}
                </button>
              </section>

              <div class="border-t border-retro-border" />

              <!-- Default Permission Mode Section -->
              <section>
            <h3 class="text-sm font-mono font-semibold text-retro-text mb-1">Default Permission Mode</h3>
            <p class="text-xs text-retro-muted mb-3">
              Set the default permission mode for all new chat conversations.
            </p>

            <div class="space-y-1.5">
              <label
                v-for="option in PERMISSION_MODE_OPTIONS"
                :key="option.value"
                class="flex items-center gap-3 px-3 py-2 rounded border cursor-pointer transition-colors"
                :class="[
                  settingsStore.permissionMode === option.value
                    ? 'border-retro-cyan bg-retro-cyan/10'
                    : 'border-retro-border bg-retro-panel hover:border-retro-muted'
                ]"
              >
                <input
                  type="radio"
                  name="permission-mode"
                  :value="option.value"
                  :checked="settingsStore.permissionMode === option.value"
                  class="w-3.5 h-3.5 text-retro-cyan accent-retro-cyan"
                  @change="handlePermissionModeChange(option.value)"
                >
                <component :is="option.icon" class="w-4 h-4 flex-shrink-0" :class="option.color" />
                <div class="flex-1">
                  <div class="text-sm font-mono text-retro-text">{{ option.label }}</div>
                  <div class="text-xs text-retro-muted leading-tight">{{ option.description }}</div>
                </div>
              </label>
            </div>
          </section>

              <div class="border-t border-retro-border" />

              <!-- Auto Mode Concurrency Section -->
              <section>
            <h3 class="text-sm font-mono font-semibold text-retro-text mb-1">Auto Mode</h3>
            <p class="text-xs text-retro-muted mb-3">
              Configure how many spec cascades can run in parallel during Auto Mode.
            </p>

            <div class="flex items-center gap-4 px-3 py-2 rounded border border-retro-border bg-retro-panel">
              <label class="font-mono text-retro-text text-sm whitespace-nowrap" for="concurrency-modal">
                Concurrency
              </label>
              <input
                id="concurrency-modal"
                type="range"
                min="1"
                max="10"
                step="1"
                :value="settingsStore.autoModeConcurrency"
                class="flex-1 accent-retro-cyan"
                @change="handleConcurrencyChange"
              >
              <span class="font-mono text-retro-cyan text-sm w-6 text-center">
                {{ settingsStore.autoModeConcurrency }}
              </span>
            </div>
              </section>
            </div>
          </section>

          <section v-else class="space-y-4">
            <div>
              <h3 class="text-sm font-mono font-semibold text-retro-text mb-1">AI Provider</h3>
              <p class="text-xs text-retro-muted mb-3">
                Choose which registered provider and model powers new conversations.
              </p>
            </div>
            <ProviderSelector
              :providers="providers"
              :selected="settingsStore.providerSelection"
              :permissionMode="settingsStore.permissionMode"
              :pending="providersLoading"
              :errorMessage="providerErrorMessage"
              @select="handleProviderSelection"
            />
          </section>

          <div class="border-t border-retro-border" />

          <!-- AI-Generated Commit Messages Section -->
          <section>
            <h3 class="text-sm font-mono font-semibold text-retro-text mb-1">Commit Messages</h3>
            <p class="text-xs text-retro-muted mb-3">
              Choose whether to use AI to generate commit messages automatically.
            </p>

            <div class="space-y-1.5">
              <label
                class="flex items-center gap-3 px-3 py-2 rounded border cursor-pointer transition-colors"
                :class="[
                  !settingsStore.autoGenerateCommitMessages
                    ? 'border-retro-cyan bg-retro-cyan/10'
                    : 'border-retro-border bg-retro-panel hover:border-retro-muted'
                ]"
              >
                <input
                  type="radio"
                  name="commit-messages"
                  :value="false"
                  :checked="!settingsStore.autoGenerateCommitMessages"
                  class="w-3.5 h-3.5 text-retro-cyan accent-retro-cyan"
                  @change="handleAutoGenerateCommitMessagesChange(false)"
                >
                <div class="flex-1">
                  <div class="text-sm font-mono text-retro-text">Template (Recommended)</div>
                  <div class="text-xs text-retro-muted leading-tight">Simple template-based messages. No token usage.</div>
                </div>
              </label>

              <label
                class="flex items-center gap-3 px-3 py-2 rounded border cursor-pointer transition-colors"
                :class="[
                  settingsStore.autoGenerateCommitMessages
                    ? 'border-retro-cyan bg-retro-cyan/10'
                    : 'border-retro-border bg-retro-panel hover:border-retro-muted'
                ]"
              >
                <input
                  type="radio"
                  name="commit-messages"
                  :value="true"
                  :checked="settingsStore.autoGenerateCommitMessages"
                  class="w-3.5 h-3.5 text-retro-cyan accent-retro-cyan"
                  @change="handleAutoGenerateCommitMessagesChange(true)"
                >
                <div class="flex-1">
                  <div class="text-sm font-mono text-retro-text">AI-Generated</div>
                  <div class="text-xs text-retro-muted leading-tight">Uses Claude Haiku to create meaningful commit messages. ~300-500 tokens per commit.</div>
                </div>
              </label>
            </div>
          </section>

          <div class="border-t border-retro-border" />

          <section>
            <h3 class="text-sm font-mono font-semibold text-retro-text mb-1">Spec-Cat</h3>
            <p class="text-xs text-retro-muted mb-3">
              Application version.
            </p>
            <div class="flex items-center justify-between px-3 py-2 rounded border border-retro-border bg-retro-panel">
              <span class="text-sm font-mono text-retro-text">Version</span>
              <span class="text-xs font-mono text-retro-cyan">{{ appVersion }}</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>
