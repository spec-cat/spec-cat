import { listStoredSessions } from '../utils/session-store'
import { readSessionInsights } from '../utils/session-preview'
import { inspectProviderSession } from '../utils/providers/claude'

export default defineEventHandler(async () => {
  const sessions = await listStoredSessions()

  return {
    sessions: await Promise.all(
      sessions.map(async (session) => {
        const [runtime, insights] = await Promise.all([
          inspectProviderSession(session),
          readSessionInsights(session.id)
        ])
        return {
          ...session,
          runtime,
          preview: insights.preview,
          linkedFeatures: insights.features
        }
      })
    )
  }
})
