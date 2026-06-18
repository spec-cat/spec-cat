<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronUpDownIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import type { BranchResponse } from '~/types/git'
import type { AIProviderMetadata } from '~/types/aiProvider'
import { DEFAULT_PROVIDER_ID } from '~/types/aiProvider'
import { useSettingsStore } from '~/stores/settings'
import {
  getSelectableBaseBranchNameFromBranch,
  isSelectableBaseBranchName,
  resolveSelectableBaseBranch,
} from '~/utils/baseBranchSelection'

const props = withDefaults(defineProps<{
  show: boolean
  creating?: boolean
  showProvider?: boolean
}>(), {
  showProvider: true,
})

const emit = defineEmits<{
  close: []
  create: [options: { baseBranch: string; providerId: string }]
}>()

const settingsStore = useSettingsStore()
const branches = ref<string[]>([])
const selectedBranch = ref('')
const providers = ref<AIProviderMetadata[]>([])
const selectedProviderId = ref(DEFAULT_PROVIDER_ID)
const loading = ref(false)
const providersLoading = ref(false)
const error = ref('')
const providerError = ref('')
const formRef = ref<HTMLFormElement | null>(null)

const selectableProviders = computed(() =>
  providers.value.filter(provider => provider.id === 'claude' || provider.id === 'codex')
)

const selectedProvider = computed(() =>
  selectableProviders.value.find(provider => provider.id === selectedProviderId.value) || selectableProviders.value[0]
)

const canCreate = computed(() =>
  !loading.value &&
  !providersLoading.value &&
  !props.creating &&
  selectedBranch.value.length > 0 &&
  branches.value.length > 0 &&
  (
    props.showProvider === false ||
    !!selectedProvider.value
  )
)

function normalizeProviderSelection() {
  if (selectableProviders.value.length === 0) return

  const selected = selectedProvider.value
  if (!selected) {
    selectedProviderId.value = DEFAULT_PROVIDER_ID
    return
  }

  selectedProviderId.value = selected.id
}

async function loadBranches() {
  loading.value = true
  error.value = ''
  try {
    const { cwd } = await $fetch<{ cwd: string }>('/api/cwd')
    const res = await $fetch<BranchResponse>('/api/git/branches', {
      query: { excludeSc: true, workingDirectory: cwd }
    })
    const localBranches = res.branches
      .filter(b => !b.isRemote)
      .map(getSelectableBaseBranchNameFromBranch)
      .filter((branch): branch is string => !!branch)
    const uniqueBranches = Array.from(new Set(localBranches))
      .sort((a, b) => {
        const rank = (branch: string) => {
          if (branch === 'main') return 0
          if (branch === 'master') return 1
          return 2
        }
        const rankDiff = rank(a) - rank(b)
        if (rankDiff !== 0) return rankDiff
        return a.localeCompare(b, undefined, { sensitivity: 'base' })
      })

    branches.value = uniqueBranches
    if (!uniqueBranches.length) {
      selectedBranch.value = ''
      error.value = 'No local branches available for chat creation.'
      return
    }

    selectedBranch.value = resolveSelectableBaseBranch('main', uniqueBranches) || uniqueBranches[0]
  } catch (e) {
    branches.value = []
    selectedBranch.value = ''
    error.value = e instanceof Error ? e.message : 'Failed to load branches'
  } finally {
    loading.value = false
  }
}

async function loadProviders() {
  providersLoading.value = true
  providerError.value = ''
  try {
    await settingsStore.hydrate()
    selectedProviderId.value = settingsStore.providerSelection.providerId

    const res = await $fetch<{ providers: AIProviderMetadata[] }>('/api/ai/providers')
    providers.value = res.providers
    normalizeProviderSelection()
  } catch (e) {
    providers.value = []
    selectedProviderId.value = DEFAULT_PROVIDER_ID
    providerError.value = e instanceof Error ? e.message : 'Failed to load providers'
  } finally {
    providersLoading.value = false
  }
}

watch(() => props.show, async (show) => {
  if (show) {
    await nextTick()
    formRef.value?.focus()
    loadBranches()
    if (props.showProvider !== false) {
      loadProviders()
    }
  }
})

watch(selectedProviderId, () => {
  normalizeProviderSelection()
})

function handleCreate() {
  if (!canCreate.value) return
  emit('create', {
    baseBranch: selectedBranch.value,
    providerId: props.showProvider === false ? settingsStore.providerSelection.providerId : selectedProviderId.value,
  })
}

function handleEnterSubmit(event: KeyboardEvent) {
  const target = event.target
  if (target instanceof HTMLElement && target.closest('button')) return
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return

  event.preventDefault()
  handleCreate()
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
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        @click.self="emit('close')"
      >
        <div class="w-full max-w-md mx-4 bg-retro-dark border border-retro-border rounded-lg shadow-xl">
          <div class="px-4 py-3 border-b border-retro-border flex items-center justify-between">
            <h3 class="text-sm font-mono text-retro-text font-semibold">New Conversation</h3>
            <button
              type="button"
              class="p-1 text-retro-muted hover:text-retro-text transition-colors"
              :disabled="creating"
              @click="emit('close')"
            >
              <XMarkIcon class="w-4 h-4" />
            </button>
          </div>

          <form ref="formRef" tabindex="-1" @submit.prevent="handleCreate" @keydown.enter.exact="handleEnterSubmit">
            <div class="px-4 py-4 space-y-4">
              <div class="space-y-2">
                <label class="block text-xs font-mono text-retro-muted">Base Branch</label>
                <div class="relative">
                  <select
                    v-model="selectedBranch"
                    :disabled="loading || creating || branches.length === 0"
                    class="w-full appearance-none bg-retro-black border border-retro-border rounded px-2 py-1.5 pr-7 text-xs font-mono text-retro-cyan focus:outline-none focus:border-retro-cyan disabled:opacity-40"
                  >
                    <option v-if="loading" value="">Loading branches...</option>
                    <option
                      v-for="branch in branches"
                      :key="branch"
                      :value="branch"
                    >
                      {{ branch }}
                    </option>
                  </select>
                  <ChevronUpDownIcon class="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-retro-muted pointer-events-none" />
                </div>
              </div>

              <div v-if="showProvider !== false" class="space-y-2">
                <div class="space-y-2">
                  <label class="block text-xs font-mono text-retro-muted">Provider</label>
                  <div class="relative">
                    <select
                      v-model="selectedProviderId"
                      :disabled="providersLoading || creating || selectableProviders.length === 0"
                      class="w-full appearance-none bg-retro-black border border-retro-border rounded px-2 py-1.5 pr-7 text-xs font-mono text-retro-cyan focus:outline-none focus:border-retro-cyan disabled:opacity-40"
                    >
                      <option v-if="providersLoading" value="">Loading...</option>
                      <option
                        v-for="provider in selectableProviders"
                        :key="provider.id"
                        :value="provider.id"
                      >
                        {{ provider.name }}
                      </option>
                    </select>
                    <ChevronUpDownIcon class="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-retro-muted pointer-events-none" />
                  </div>
                </div>
              </div>

              <p v-if="error" class="text-xs font-mono text-retro-red">{{ error }}</p>
              <p v-else-if="providerError" class="text-xs font-mono text-retro-red">{{ providerError }}</p>
              <p v-else class="text-xs font-mono text-retro-muted">
                Provider is fixed after the conversation is created.
              </p>
            </div>

            <div class="px-4 py-3 border-t border-retro-border flex items-center gap-2 justify-end">
              <button
                type="button"
                class="px-3 py-1.5 text-xs font-mono rounded border border-retro-border text-retro-muted hover:text-retro-text hover:border-retro-text/30 transition-colors disabled:opacity-40"
                :disabled="creating"
                @click="emit('close')"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="!canCreate"
                class="px-3 py-1.5 text-xs font-mono rounded border bg-retro-cyan/10 border-retro-cyan/50 text-retro-cyan hover:bg-retro-cyan/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {{ creating ? 'Creating...' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
