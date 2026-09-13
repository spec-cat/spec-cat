import { deleteStoredSession, listArchivedSessions } from '../../utils/session-store'
import { teardownArchivedSession } from '../../utils/session-teardown'

export default defineEventHandler(async () => {
  const sessions = await listArchivedSessions()

  for (const session of sessions) {
    await teardownArchivedSession(session)
    await deleteStoredSession(session.id)
  }

  return { deleted: true, count: sessions.length }
})
