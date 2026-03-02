import type { AIProvider } from './aiProvider'

const providers = new Map<string, AIProvider>()
let registryInitialized = false

export async function ensureProvidersInitialized() {
  if (registryInitialized) return
  registryInitialized = true
  const providerImports = [
    ['claude', () => import('~/server/utils/claudeProvider')],
    ['codex', () => import('~/server/utils/codexProvider')],
    ['gemini', () => import('~/server/utils/geminiProvider')],
  ] as const

  await Promise.all(providerImports.map(async ([providerId, loader]) => {
    try {
      await loader()
    } catch (error) {
      console.error(`[AI Provider Registry] Failed to initialize provider "${providerId}"`, error)
    }
  }))
}

export function registerProvider(provider: AIProvider) {
  if (providers.has(provider.metadata.id)) {
    console.warn(`[AI Provider Registry] Duplicate provider id "${provider.metadata.id}" detected. Overwriting previous registration.`)
  }
  providers.set(provider.metadata.id, provider)
}

export function getProvider(providerId: string): AIProvider | undefined {
  return providers.get(providerId)
}

export function listProviders(): AIProvider[] {
  return Array.from(providers.values())
}

export async function listProviderMetadata() {
  await ensureProvidersInitialized()
  return listProviders().map((provider) => provider.metadata)
}
