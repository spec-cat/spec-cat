/**
 * GET /api/auto-mode/status
 * Returns current Auto Mode state (enabled/disabled, session info)
 */

import { autoModeScheduler } from '~/server/utils/autoModeScheduler'
import type { AutoModeStatusResponse } from '~/types/autoMode'

export default defineEventHandler((): AutoModeStatusResponse => {
  return {
    enabled: autoModeScheduler.isEnabled(),
    session: autoModeScheduler.getSession(),
  }
})
