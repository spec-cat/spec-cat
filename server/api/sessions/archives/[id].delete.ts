import { deleteStoredSession, readStoredSession } from '../../../utils/session-store'
import { teardownArchivedSession } from '../../../utils/session-teardown'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid session id' })
  }

  const session = await readStoredSession(id)
  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  }
  if (!session.archived) {
    throw createError({ statusCode: 400, statusMessage: 'Session is not archived' })
  }

  await teardownArchivedSession(session)
  await deleteStoredSession(id)

  return { deleted: true, id }
})
