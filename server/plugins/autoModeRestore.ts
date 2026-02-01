import { autoModeScheduler } from '../utils/autoModeScheduler'

/**
 * Server plugin to restore Auto Mode session on startup.
 * When the server restarts (e.g., HMR, crash recovery), this reads
 * the persisted session file and resumes processing.
 */
export default defineNitroPlugin(() => {
  autoModeScheduler.restoreSession().catch((e) => {
    console.error('[AutoMode] Failed to restore session on startup:', e)
  })
})
