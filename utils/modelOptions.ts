import type { AIProviderMetadata, AIProviderSelection } from '~/types/aiProvider'

export interface ModelOption {
  key: string
  providerId: string
  providerName: string
  modelKey: string
  modelLabel: string
  label: string
  compatible: boolean
}

export interface ModelOptionGroup {
  providerId: string
  providerName: string
  options: ModelOption[]
}

/**
 * Compose the selection key used by the model picker for fast equality checks.
 * Keep this in sync with the key format produced by buildModelOptions.
 */
export function getSelectionKey(selection: AIProviderSelection): string {
  return `${selection.providerId}::${selection.modelKey}`
}

/**
 * Flatten providers → model options, sorted alphabetically by model label then
 * provider name. When two providers expose a model with the same label, the
 * provider name is appended to disambiguate.
 *
 * Compatibility requires:
 *  - Provider supports streaming
 *  - If the current permission mode requires permission gating, the provider
 *    must also support permissions
 */
export function buildModelOptions(
  providers: readonly AIProviderMetadata[],
  requiresPermissions: boolean,
): ModelOption[] {
  const labelCounts = new Map<string, number>()
  for (const provider of providers) {
    for (const model of provider.models) {
      labelCounts.set(model.label, (labelCounts.get(model.label) ?? 0) + 1)
    }
  }

  const options: ModelOption[] = providers.flatMap((provider) =>
    provider.models.map((model) => {
      const compatible = provider.capabilities.streaming
        && (!requiresPermissions || provider.capabilities.permissions)
      const isDuplicatedModelLabel = (labelCounts.get(model.label) ?? 0) > 1
      return {
        key: `${provider.id}::${model.key}`,
        providerId: provider.id,
        providerName: provider.name,
        modelKey: model.key,
        modelLabel: model.label,
        label: isDuplicatedModelLabel ? `${model.label} · ${provider.name}` : model.label,
        compatible,
      }
    }),
  )

  return options.sort((a, b) =>
    a.modelLabel.localeCompare(b.modelLabel, undefined, { sensitivity: 'base' }) ||
    a.providerName.localeCompare(b.providerName, undefined, { sensitivity: 'base' })
  )
}

/**
 * Group options by provider. Preferred providers (codex, claude) are pinned
 * to the top; the rest are sorted alphabetically by provider name.
 */
export function groupModelOptions(options: readonly ModelOption[]): ModelOptionGroup[] {
  const groupMap = new Map<string, ModelOptionGroup>()
  for (const option of options) {
    const existing = groupMap.get(option.providerId)
    if (existing) {
      existing.options.push(option)
      continue
    }
    groupMap.set(option.providerId, {
      providerId: option.providerId,
      providerName: option.providerName,
      options: [option],
    })
  }

  const providerOrder = new Map<string, number>([
    ['codex', 0],
    ['claude', 1],
  ])
  const groups = Array.from(groupMap.values())
  groups.sort((a, b) => {
    const aOrder = providerOrder.get(a.providerId) ?? 99
    const bOrder = providerOrder.get(b.providerId) ?? 99
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.providerName.localeCompare(b.providerName, undefined, { sensitivity: 'base' })
  })
  return groups
}

/**
 * Find the option matching a provider+model selection, or null when unknown.
 */
export function findOptionForSelection(
  options: readonly ModelOption[],
  selection: AIProviderSelection,
): ModelOption | null {
  const key = getSelectionKey(selection)
  return options.find((option) => option.key === key) ?? null
}
