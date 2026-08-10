import {
  normalizeSessionTitle,
  readStoredSession,
  writeStoredSession
} from '../../utils/session-store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid session id' })
  }

  const body = await readBody<{ title?: unknown }>(event).catch(() => null)
  if (!body || typeof body !== 'object' || !('title' in body)) {
    throw createError({ statusCode: 400, statusMessage: 'Request body must include a title' })
  }

  let title: string | undefined
  try {
    title = normalizeSessionTitle(body.title)
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Invalid title'
    throw createError({ statusCode: 400, statusMessage: details })
  }

  const session = await readStoredSession(id)
  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  }

  const updated = {
    ...session,
    title,
    updatedAt: new Date().toISOString()
  }
  await writeStoredSession(updated)

  return { session: updated }
})
