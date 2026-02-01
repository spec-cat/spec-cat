<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '~/stores/settings'
import { useToast } from '~/composables/useToast'
import ProviderSelector from '~/components/settings/ProviderSelector.vue'
import type { AIProviderSelection } from '~/types/aiProvider'

const settingsStore = useSettingsStore()
const toast = useToast()

onMounted(() => {
  settingsStore.hydrate()
})

const { data: providerData, pending: providersPending, error: providersError } =
  await useAsyncData('ai-providers', () => $fetch('/api/ai/providers'))
const providers = computed(() => providerData.value?.providers ?? [])
const providerErrorMessage = computed(() => {
  const err = providersError.value
  if (!err) return null
  return err instanceof Error ? err.message : String(err)
})

const handleProviderSelection = (selection: AIProviderSelection) => {
  settingsStore.setProviderSelection(selection)
  toast.success('Settings saved')
}

const handleConcurrencyChange = (event: Event) => {
  const value = parseInt((event.target as HTMLInputElement).value, 10)
  if (!isNaN(value)) {
    settingsStore.setAutoModeConcurrency(value)
    toast.success('Settings saved')
  }
}
</script>

<template>
  <div class="p-6 max-w-2xl">
    <h1 class="text-2xl font-bold text-retro-cyan font-mono">Settings</h1>
    <p class="mt-2 text-retro-muted">Configure your Spec Cat preferences.</p>

    <div class="mt-8 space-y-8">
      <section>
        <h2 class="text-lg font-mono text-retro-text mb-4">AI Provider</h2>
        <p class="text-sm text-retro-muted mb-4">
          Select the provider and model that should power new conversations.
        </p>

        <ProviderSelector
          :providers="providers"
          :selected="settingsStore.providerSelection"
          :permissionMode="settingsStore.permissionMode"
          :pending="providersPending"
          :errorMessage="providerErrorMessage"
          @select="handleProviderSelection"
        />
      </section>

      <!-- Auto Mode Concurrency Section (T021: FR-016) -->
      <section>
        <h2 class="text-lg font-mono text-retro-text mb-4">Auto Mode</h2>
        <p class="text-sm text-retro-muted mb-4">
          Configure how many spec cascades can run in parallel during Auto Mode.
        </p>

        <div class="flex items-center gap-4 p-3 rounded border border-retro-border bg-retro-panel">
          <label class="font-mono text-retro-text text-sm whitespace-nowrap" for="concurrency-page">
            Concurrency
          </label>
          <input
            id="concurrency-page"
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
  </div>
</template>
