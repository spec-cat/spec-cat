export interface AIProviderCapabilities {
  streaming: boolean
  permissions: boolean
  resume: boolean
  autoCommit?: boolean
  conflictResolution?: boolean
}

export interface AIProviderModel {
  key: string
  label: string
  description: string
  default?: boolean
}

export interface AIProviderMetadata {
  id: string
  name: string
  description: string
  icon?: string
  capabilities: AIProviderCapabilities
  models: AIProviderModel[]
}

export interface AIProviderSelection {
  providerId: string
  modelKey: string
}

export interface CapabilityGuardFailure {
  success: false
  error: string
  providerId?: string
  missingCapability?: keyof AIProviderCapabilities
}

export const DEFAULT_PROVIDER_ID = 'claude'
export const DEFAULT_MODEL_KEY = 'sonnet'
