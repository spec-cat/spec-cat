/**
 * POST /api/settings — Write application settings to server-side file storage
 * Accepts partial updates (merges with existing settings).
 */

import { readSpecCatStore, writeSpecCatStore } from '../utils/specCatStore'
import type { SpecCatSettings } from './settings.get'
import { resolveServerProviderSelection } from '~/server/utils/aiProviderSelection'
import { DEFAULT_PROVIDER_ID } from '~/types/aiProvider'

export default defineEventHandler(async (event) => {
  const body = await readBody<Partial<SpecCatSettings>>(event)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  }

  const existing = await readSpecCatStore<Partial<SpecCatSettings>>('settings.json', {})
  const merged = { ...existing, ...body }

  const hasProviderPatch = typeof merged.providerId === 'string' || typeof merged.providerModelKey === 'string' || typeof merged.claudeModel === 'string'
  if (hasProviderPatch) {
    const normalized = await resolveServerProviderSelection({
      providerId: typeof merged.providerId === 'string' ? merged.providerId : DEFAULT_PROVIDER_ID,
      modelKey: typeof merged.providerModelKey === 'string'
        ? merged.providerModelKey
        : typeof merged.claudeModel === 'string'
          ? merged.claudeModel
          : '',
    })

    merged.providerId = normalized.providerId
    merged.providerModelKey = normalized.modelKey
    merged.claudeModel = normalized.providerId === 'claude' ? normalized.modelKey : undefined
  }

  await writeSpecCatStore('settings.json', merged)

  return { success: true, settings: merged }
})
