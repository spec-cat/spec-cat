import { listArchivedSessions } from '../../utils/session-store'

export default defineEventHandler(async () => {
  const sessions = await listArchivedSessions()
  sessions.sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''))

  return { sessions }
})
