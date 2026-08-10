import { readStoredSession, writeStoredSession } from '../../../../utils/session-store'
import {
  createSessionWorktree,
  recreateSessionWorktree,
  sessionBranchExists
} from '../../../../utils/worktree'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid session id' })
  }

  const session = await readStoredSession(id)
  if (!session || !session.archived) {
    throw createError({ statusCode: 404, statusMessage: 'Archived session not found' })
  }

  // The terminal attach flow only provisions a worktree for brand-new
  // sessions, so the worktree must exist again before a client attaches.
  // Recreate the kept branch at its archived tip and provision a new worktree.
  // The branch is whatever the conversation ended up on — the `sc/<id>` branch
  // it was created with, or a feature branch it later followed. If the branch
  // was removed externally, start from the base branch.
  let cwd = session.cwd
  let worktreeBranch = session.worktreeBranch
  if (!session.finalized && session.projectDir && session.worktreeBranch) {
    const worktree = (await sessionBranchExists(session.projectDir, session.worktreeBranch))
      ? await recreateSessionWorktree(session.projectDir, session.id, session.worktreeBranch)
      : await createSessionWorktree(session.projectDir, session.id, session.baseBranch)
    cwd = worktree.worktreePath
    worktreeBranch = worktree.branch
  }

  const restored = {
    ...session,
    cwd,
    worktreeBranch,
    archived: undefined,
    archivedAt: undefined,
    branchKept: undefined,
    updatedAt: new Date().toISOString()
  }
  await writeStoredSession(restored)

  return { restored: true, session: restored }
})
