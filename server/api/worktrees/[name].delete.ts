import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { requireAllowedGitCwd, requireRef } from '../../utils/git-access'
import { runGit } from '../../utils/git-state'
import { listStoredSessions } from '../../utils/session-store'
import {
  describeWorktrees,
  getManagedWorktreeRoot,
  isManagedWorktreeChild,
  parseWorktreeList
} from '../../utils/worktree'

const SAFE_DIR_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/

export default defineEventHandler(async (event) => {
  const name = decodeURIComponent(getRouterParam(event, 'name') || '')
  if (!SAFE_DIR_NAME.test(name) || name.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid worktree name' })
  }

  const query = getQuery(event)
  const cwd = await requireAllowedGitCwd(query.cwd).catch((error) => {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Invalid git working directory'
    })
  })
  const deleteBranch = query.deleteBranch === 'true' || query.deleteBranch === '1'

  const managedRoot = getManagedWorktreeRoot()
  const targetPath = join(managedRoot, name)
  if (!isManagedWorktreeChild(targetPath, managedRoot)) {
    throw createError({ statusCode: 400, statusMessage: 'Worktree is outside the managed worktree directory' })
  }

  const root = await runGit(cwd, ['rev-parse', '--show-toplevel']).catch((error) => {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Not a git repository'
    })
  })

  const output = await runGit(root, ['worktree', 'list', '--porcelain'], { trim: false })
  const entries = describeWorktrees(parseWorktreeList(output))
  const main = entries.find((entry) => entry.isMain)
  const target = entries.find((entry) => resolve(entry.path) === resolve(targetPath))

  if (!target) {
    throw createError({ statusCode: 404, statusMessage: `Worktree ${name} not found in this repository` })
  }
  if (target.isMain) {
    throw createError({ statusCode: 400, statusMessage: 'Refusing to remove the main worktree' })
  }

  const sessions = await listStoredSessions()
  const owner = sessions.find((session) =>
    name === `sc-${session.id}` || (target.branch !== null && session.worktreeBranch === target.branch)
  )
  if (owner) {
    throw createError({
      statusCode: 409,
      statusMessage: `Worktree belongs to active conversation ${owner.id}`
    })
  }

  try {
    await runGit(root, ['worktree', 'remove', '--force', targetPath])
  } catch {
    // Mirrors deleteSessionWorktree: fall back to deleting the directory so
    // prune can drop the stale registration.
    await rm(targetPath, { recursive: true, force: true })
  }
  await runGit(root, ['worktree', 'prune'])

  let branchDeleted = false
  if (deleteBranch && target.branch && !target.detached) {
    const branch = requireRef(target.branch, 'branch')
    // Never delete the branch currently checked out in the main worktree.
    if (branch !== main?.branch) {
      branchDeleted = await runGit(root, ['branch', '-D', branch])
        .then(() => true)
        .catch(() => false)
    }
  }

  return {
    deleted: true,
    name,
    path: targetPath,
    branch: target.branch,
    branchDeleted
  }
})
