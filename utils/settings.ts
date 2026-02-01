import type { PermissionMode } from '~/types/chat'
import { CLAUDE_MODELS } from '~/types/claude'
import { DEFAULT_MODEL_KEY } from '~/types/aiProvider'

type Theme = 'dark' | 'light'

export interface NormalizedSettings {
  providerId?: string
  providerModelKey?: string
  autoModeConcurrency?: number
  theme?: Theme
  permissionMode?: PermissionMode
  autoGenerateCommitMessages?: boolean
}

export function normalizeSettings(raw: Record<string, unknown> | null | undefined): NormalizedSettings {
  if (!raw) return {}

  const normalized: NormalizedSettings = {}
  const claudeModel =
    typeof raw.claudeModel === 'string' && CLAUDE_MODELS.some((model) => model.value === raw.claudeModel)
      ? raw.claudeModel
      : undefined

  if (typeof raw.providerId === 'string') {
    normalized.providerId = raw.providerId
    if (typeof raw.providerModelKey === 'string' && raw.providerModelKey.length > 0) {
      normalized.providerModelKey = raw.providerModelKey
    } else if (claudeModel) {
      normalized.providerModelKey = claudeModel
    } else {
      normalized.providerModelKey = DEFAULT_MODEL_KEY
    }
  } else if (claudeModel) {
    normalized.providerId = 'claude'
    normalized.providerModelKey = claudeModel
  }

  if (typeof raw.autoModeConcurrency === 'number' && raw.autoModeConcurrency >= 1) {
    normalized.autoModeConcurrency = raw.autoModeConcurrency
  }

  if (raw.theme === 'dark' || raw.theme === 'light') {
    normalized.theme = raw.theme
  }

  const mode = raw.permissionMode
  if (mode && ['plan', 'ask', 'auto', 'bypass'].includes(String(mode))) {
    normalized.permissionMode = mode as PermissionMode
  }

  if (typeof raw.autoGenerateCommitMessages === 'boolean') {
    normalized.autoGenerateCommitMessages = raw.autoGenerateCommitMessages
  }

  return normalized
}
