import { readSessionLog, readStoredSession } from '../../../../utils/session-store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid session id' })
  }

  const session = await readStoredSession(id)
  if (!session || !session.archived) {
    throw createError({ statusCode: 404, statusMessage: 'Archived session not found' })
  }

  return {
    session,
    log: await readSessionLog(id)
  }
})
