<script setup lang="ts">
import { computed } from 'vue'
import type { AIProviderCapabilities, AIProviderMetadata, AIProviderSelection } from '~/types/aiProvider'
import type { PermissionMode } from '~/types/chat'
import { PERMISSION_MODE_LABELS } from '~/types/chat'

const props = defineProps<{
  providers: AIProviderMetadata[]
  selected: AIProviderSelection
  permissionMode: PermissionMode
  pending?: boolean
  errorMessage?: string | null
}>()

const emit = defineEmits<{
  (e: 'select', selection: AIProviderSelection): void
}>()

const capabilityBadges: Array<{ key: keyof AIProviderCapabilities; label: string }> = [
  { key: 'streaming', label: 'Streaming' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'resume', label: 'Session Resume' },
  { key: 'autoCommit', label: 'Auto Commit' },
]

const requiresPermissions = computed(() => props.permissionMode !== 'bypass')
const permissionModeLabel = computed(() => PERMISSION_MODE_LABELS[props.permissionMode])
const requiresStreaming = computed(() => true)

function isProviderCompatible(provider: AIProviderMetadata) {
  const permissionCompatible = !requiresPermissions.value || provider.capabilities.permissions
  const streamingCompatible = !requiresStreaming.value || provider.capabilities.streaming
  return permissionCompatible && streamingCompatible
}

function providerDisableReason(provider: AIProviderMetadata) {
  if (requiresPermissions.value && !provider.capabilities.permissions) {
    return `${provider.name} cannot be used with ${permissionModeLabel.value} because it does not expose permission prompts.`
  }
  if (requiresStreaming.value && !provider.capabilities.streaming) {
    return `${provider.name} is unavailable because streaming runtime prerequisites are not satisfied.`
  }
  return null
}

function handleSelection(provider: AIProviderMetadata, modelKey: string) {
  if (!isProviderCompatible(provider)) return
  emit('select', { providerId: provider.id, modelKey })
}

function isSelected(providerId: string, modelKey: string) {
  return props.selected.providerId === providerId && props.selected.modelKey === modelKey
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="pending" class="rounded border border-retro-border bg-retro-panel px-4 py-3">
      <p class="text-xs font-mono text-retro-text">Loading providers…</p>
    </div>

    <div v-else-if="errorMessage" class="rounded border border-retro-border bg-retro-panel px-4 py-3">
      <p class="text-xs font-mono text-retro-yellow">Unable to load providers: {{ errorMessage }}</p>
    </div>

    <div v-else-if="providers.length === 0" class="rounded border border-retro-border bg-retro-panel px-4 py-3">
      <p class="text-xs font-mono text-retro-muted">No AI providers are configured on the server. Check with your administrator.</p>
    </div>

    <div v-else class="space-y-4">
      <p v-if="requiresPermissions" class="text-xs font-mono text-retro-muted">
        Permission mode {{ permissionModeLabel }} requires a provider that supports permission prompts. Incompatible providers are disabled.
      </p>
      <p v-if="requiresStreaming" class="text-xs font-mono text-retro-muted">
        Chat currently requires a provider with streaming support. Providers without streaming are shown for preparation but disabled.
      </p>

      <article
        v-for="provider in providers"
        :key="provider.id"
        class="rounded border border-retro-border bg-retro-panel p-4 space-y-3 transition"
        :class="{
          'border-retro-cyan bg-retro-cyan/5': selected.providerId === provider.id,
          'hover:border-retro-muted': selected.providerId !== provider.id,
        }"
      >
        <div class="flex flex-col gap-2">
          <div class="flex flex-col gap-2">
            <div class="flex items-start justify-between gap-3">
              <span class="text-sm font-mono text-retro-text">{{ provider.name }}</span>
              <div v-if="requiresPermissions && !provider.capabilities.permissions" class="text-xs font-mono text-retro-yellow">
                Permissions missing
              </div>
              <div v-else-if="requiresStreaming && !provider.capabilities.streaming" class="text-xs font-mono text-retro-yellow">
                Streaming missing
              </div>
            </div>
            <p class="text-xs text-retro-muted leading-tight">{{ provider.description }}</p>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="badge in capabilityBadges"
                :key="badge.key"
                class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6rem] font-mono uppercase tracking-[0.18em]"
                :class="provider.capabilities[badge.key]
                  ? 'border-retro-cyan/70 text-retro-cyan bg-retro-cyan/10'
                  : 'border-retro-border text-retro-muted bg-retro-dark/60'"
              >
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :class="provider.capabilities[badge.key]
                    ? 'bg-retro-cyan'
                    : 'bg-retro-muted'"
                />
                {{ badge.label }}
              </span>
            </div>
          </div>
        </div>

        <p v-if="providerDisableReason(provider)" class="text-xs font-mono text-retro-yellow">
          {{ providerDisableReason(provider) }}
        </p>

        <div class="space-y-1.5">
          <label
            v-for="model in provider.models"
            :key="model.key"
            class="flex items-start gap-3 px-3 py-2 rounded border cursor-pointer transition-colors"
            :class="[
              isSelected(provider.id, model.key)
                ? 'border-retro-cyan bg-retro-cyan/10'
                : 'border-retro-border bg-retro-panel hover:border-retro-muted',
              !isProviderCompatible(provider) ? 'opacity-60 cursor-not-allowed' : '',
            ]"
          >
            <input
              type="radio"
              name="provider-model"
              :value="`${provider.id}:${model.key}`"
              :checked="isSelected(provider.id, model.key)"
              :disabled="!isProviderCompatible(provider)"
              class="mt-1 h-3.5 w-3.5 text-retro-cyan accent-retro-cyan"
              @change="handleSelection(provider, model.key)"
            >
            <div class="flex-1 space-y-0.5">
              <div class="flex items-center gap-2">
                <span class="text-sm font-mono text-retro-text">{{ model.label }}</span>
                <span v-if="model.default" class="text-[0.55rem] font-mono uppercase tracking-[0.25em] text-retro-cyan border border-retro-cyan rounded-full px-2 py-0.5">
                  Default
                </span>
              </div>
              <p class="text-xs text-retro-muted leading-tight">{{ model.description }}</p>
            </div>
          </label>
        </div>
      </article>
    </div>
  </div>
</template>
