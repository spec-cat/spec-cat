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

    </div>
  </div>
</template>
