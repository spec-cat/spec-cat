import { readSpecCatStore } from '~/server/utils/specCatStore'
import { DEFAULT_MODEL_KEY, DEFAULT_PROVIDER_ID, type AIProviderCapabilities, type AIProviderSelection, type CapabilityGuardFailure } from '~/types/aiProvider'
import { ensureProvidersInitialized, getProvider } from '~/server/utils/aiProviderRegistry'

function getProviderDefaultModelKey(providerId: string): string {
  const provider = getProvider(providerId)
  if (!provider) return DEFAULT_MODEL_KEY
  const defaultModel = provider.metadata.models.find((model) => model.default)
  return defaultModel?.key || provider.metadata.models[0]?.key || DEFAULT_MODEL_KEY
}

export function normalizeSelection(selection: AIProviderSelection): AIProviderSelection {
  const provider = getProvider(selection.providerId)
  if (!provider) {
    const fallbackProvider = getProvider(DEFAULT_PROVIDER_ID)
    return {
      providerId: fallbackProvider?.metadata.id || DEFAULT_PROVIDER_ID,
      modelKey: getProviderDefaultModelKey(DEFAULT_PROVIDER_ID),
    }
  }

  if (provider.isModelSupported(selection.modelKey)) {
    return selection
  }

  return {
    providerId: selection.providerId,
    modelKey: getProviderDefaultModelKey(selection.providerId),
  }
}

export async function getServerProviderSelection(): Promise<AIProviderSelection> {
  await ensureProvidersInitialized()
  const settings = await readSpecCatStore<Record<string, unknown>>('settings.json', {})
  const providerId = typeof settings.providerId === 'string'
    ? settings.providerId
    : DEFAULT_PROVIDER_ID

  const modelKey = typeof settings.providerModelKey === 'string' && settings.providerModelKey.length > 0
    ? settings.providerModelKey
    : typeof settings.claudeModel === 'string'
      ? settings.claudeModel
      : DEFAULT_MODEL_KEY

  return normalizeSelection({ providerId, modelKey })
}

export async function resolveServerProviderSelection(selection: AIProviderSelection): Promise<AIProviderSelection> {
  await ensureProvidersInitialized()
  return normalizeSelection(selection)
}

export async function getServerProviderSelectionWithProvider() {
  const selection = await getServerProviderSelection()
  return {
    selection,
    provider: getProvider(selection.providerId),
  }
}

function capabilityLabel(capability: keyof AIProviderCapabilities): string {
  switch (capability) {
    case 'autoCommit':
      return 'auto-commit'
    case 'conflictResolution':
      return 'AI conflict resolution'
    default:
      return capability
  }
}

export function buildCapabilityGuardFailure(
  selection: AIProviderSelection,
  capability: keyof AIProviderCapabilities,
  nextStep?: string,
): CapabilityGuardFailure {
  const suffix = nextStep ? ` ${nextStep}` : ''
  return {
    success: false,
    error: `Provider "${selection.providerId}" does not support ${capabilityLabel(capability)}.${suffix}`.trim(),
    providerId: selection.providerId,
    missingCapability: capability,
  }
}

export async function guardProviderCapability(
  selection: AIProviderSelection,
  capability: keyof AIProviderCapabilities,
  nextStep?: string,
): Promise<{ selection: AIProviderSelection } | { failure: CapabilityGuardFailure }> {
  await ensureProvidersInitialized()
  const normalized = normalizeSelection(selection)
  const provider = getProvider(normalized.providerId)
  if (!provider?.metadata.capabilities[capability]) {
    return { failure: buildCapabilityGuardFailure(normalized, capability, nextStep) }
  }
  return { selection: normalized }
}

export async function guardServerProviderCapability(
  capability: keyof AIProviderCapabilities,
  nextStep?: string,
): Promise<{ selection: AIProviderSelection } | { failure: CapabilityGuardFailure }> {
  const selection = await getServerProviderSelection()
  return guardProviderCapability(selection, capability, nextStep)
}
