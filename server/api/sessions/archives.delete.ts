import { deleteStoredSession, listArchivedSessions } from '../../utils/session-store'
import { deleteSessionBranch } from '../../utils/worktree'

export default defineEventHandler(async () => {
  const sessions = await listArchivedSessions()

  for (const session of sessions) {
    if (!session.finalized && session.projectDir && session.worktreeBranch) {
      await deleteSessionBranch(session.projectDir, session.worktreeBranch)
    }
    await deleteStoredSession(session.id)
  }

  return { deleted: true, count: sessions.length }
})
