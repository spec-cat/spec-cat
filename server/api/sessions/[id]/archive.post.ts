import { readStoredSession, writeStoredSession } from '../../../utils/session-store'
import { teardownSessionRuntime } from '../../../utils/session-teardown'
import { sessionBranchExists } from '../../../utils/worktree'

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
    throw createError({ statusCode: 400, statusMessage: 'Session is already archived' })
  }

  try {
    // The worktree goes away but the sc/<id> branch is kept so the
    // conversation's work survives until the archive is deleted for good.
    await teardownSessionRuntime(session, { keepBranch: true })
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw createError({ statusCode: 500, statusMessage: details })
  }

  const branchKept = Boolean(
    !session.finalized
    && session.projectDir
    && session.worktreeBranch
    && await sessionBranchExists(session.projectDir, session.worktreeBranch)
  )

  const now = new Date().toISOString()
  const archivedSession = {
    ...session,
    archived: true,
    archivedAt: now,
    branchKept,
    previewBranch: undefined,
    updatedAt: now
  }
  await writeStoredSession(archivedSession)

  return { archived: true, session: archivedSession }
})
