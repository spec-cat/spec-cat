import { deleteStoredSession, readStoredSession } from '../../utils/session-store'
import { teardownArchivedSession, teardownSessionRuntime } from '../../utils/session-teardown'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid session id' })
  }

  const session = await readStoredSession(id)
  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  }

  if (session.archived) {
    // Archiving already tore down tmux and the worktree; only the kept
    // sc/<id> branch may remain.
    await teardownArchivedSession(session)
  } else {
    try {
      await teardownSessionRuntime(session)
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error)
      throw createError({ statusCode: 500, statusMessage: details })
    }
  }

  await deleteStoredSession(id)
  return { deleted: true, id }
})
