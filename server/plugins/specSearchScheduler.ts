import { startSpecSearchScheduler, stopSpecSearchScheduler } from '../utils/specSearch/scheduler'

export default defineNitroPlugin((nitroApp) => {
  startSpecSearchScheduler().catch((error) => {
    console.error('[spec-search] scheduler startup failed:', error)
  })

  nitroApp.hooks.hook('close', () => {
    stopSpecSearchScheduler()
  })
})
