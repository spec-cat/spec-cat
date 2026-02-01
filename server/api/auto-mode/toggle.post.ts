/**
 * POST /api/auto-mode/toggle
 * Enable or disable Auto Mode
 */

import { autoModeScheduler } from '~/server/utils/autoModeScheduler'
import type { AutoModeToggleResponse } from '~/types/autoMode'

export default defineEventHandler(async (event): Promise<AutoModeToggleResponse> => {
  const body = await readBody<{ enabled: boolean; concurrency?: number }>(event)

  if (typeof body?.enabled !== 'boolean') {
    throw createError({ statusCode: 400, message: 'Missing required field: enabled (boolean)' })
  }

  try {
    const result = await autoModeScheduler.toggle(body.enabled, body.concurrency)
    return { success: true, enabled: result.enabled }
  } catch (e) {
    return {
      success: false,
      enabled: autoModeScheduler.isEnabled(),
      error: e instanceof Error ? e.message : String(e),
    }
  }
})
