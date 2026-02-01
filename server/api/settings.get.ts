/**
 * GET /api/settings — Read application settings from server-side file storage
 */

import { readSpecCatStore } from '../utils/specCatStore'
import { DEFAULT_MODEL_KEY, DEFAULT_PROVIDER_ID } from '~/types/aiProvider'
import { resolveServerProviderSelection } from '~/server/utils/aiProviderSelection'

export interface SpecCatSettings {
  theme: 'dark' | 'light'
  providerId: string
  providerModelKey: string
  claudeModel?: string
  autoModeConcurrency: number
  panelWidth: number
  permissionMode: string
  autoModeEnabled: boolean
  autoGenerateCommitMessages: boolean
}

const DEFAULTS: SpecCatSettings = {
  theme: 'dark',
  providerId: DEFAULT_PROVIDER_ID,
  providerModelKey: DEFAULT_MODEL_KEY,
  claudeModel: 'sonnet',
  autoModeConcurrency: 3,
  panelWidth: 400,
  permissionMode: 'ask',
  autoModeEnabled: false,
  autoGenerateCommitMessages: false,
}

export default defineEventHandler(async () => {
  const settings = await readSpecCatStore<Partial<SpecCatSettings>>('settings.json', {})
  const base = { ...DEFAULTS, ...settings }
  const normalized = await resolveServerProviderSelection({
    providerId: typeof base.providerId === 'string' ? base.providerId : DEFAULT_PROVIDER_ID,
    modelKey: typeof base.providerModelKey === 'string' ? base.providerModelKey : DEFAULT_MODEL_KEY,
  })

  return {
    ...base,
    providerId: normalized.providerId,
    providerModelKey: normalized.modelKey,
    claudeModel: normalized.providerId === 'claude' ? normalized.modelKey : base.claudeModel,
  }
})
