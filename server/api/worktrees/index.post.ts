import { mkdir, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { requireAllowedGitCwd, requireRef } from '../../utils/git-access'
import { runGit } from '../../utils/git-state'
import {
  describeWorktrees,
  getManagedWorktreeRoot,
  isManagedWorktreeChild,
  parseWorktreeList
} from '../../utils/worktree'

type CreateWorktreeBody = {
  cwd?: string
  path?: string
  branch?: string
  baseRef?: string
}

const SAFE_DIR_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/
const MAX_DERIVE_ATTEMPTS = 50

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => null)) as CreateWorktreeBody | null

  let cwd = ''
  let branch = ''
  let baseRef = 'HEAD'
  try {
    cwd = await requireAllowedGitCwd(body?.cwd)
    branch = requireRef(body?.branch, 'branch')
    if (typeof body?.baseRef === 'string' && body.baseRef.trim()) {
      baseRef = requireRef(body.baseRef, 'baseRef')
    }
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Invalid request'
    })
  }

  const root = await runGit(cwd, ['rev-parse', '--show-toplevel']).catch((error) => {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Not a git repository'
    })
  })

  const managedRoot = getManagedWorktreeRoot()
  const worktreePath = await resolveTargetPath(managedRoot, body?.path, branch)
  const branchExists = await refExists(root, `refs/heads/${branch}`)

  if (!branchExists && !await refExists(root, baseRef)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown baseRef: ${baseRef}` })
  }

  await mkdir(managedRoot, { recursive: true })
  try {
    if (branchExists) {
      await runGit(root, ['worktree', 'add', worktreePath, branch])
    } else {
      await runGit(root, ['worktree', 'add', '-b', branch, worktreePath, baseRef])
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create worktree'
    const userError = /already exists|already checked out|already used by worktree|not a valid|invalid reference|unknown revision|is not a commit/i.test(message)
    throw createError({ statusCode: userError ? 400 : 500, statusMessage: message })
  }

  const output = await runGit(root, ['worktree', 'list', '--porcelain'], { trim: false })
  const entries = describeWorktrees(parseWorktreeList(output))
  const created = entries.find((entry) => resolve(entry.path) === worktreePath)
    || entries.find((entry) => entry.branch === branch)

  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Worktree was created but could not be found in the worktree list' })
  }

  setResponseStatus(event, 201)
  return { created: true, worktree: created }
})

/**
 * Worktrees are always placed as direct children of the managed tmp dir.
 * Explicit paths that resolve anywhere else are rejected.
 */
async function resolveTargetPath(managedRoot: string, requestedPath: unknown, branch: string) {
  if (typeof requestedPath === 'string' && requestedPath.trim()) {
    const target = resolve(requestedPath.trim())
    if (!isManagedWorktreeChild(target, managedRoot) || !SAFE_DIR_NAME.test(basename(target))) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Worktree path must be a direct child of the managed worktree directory'
      })
    }
    if (await pathExists(target)) {
      throw createError({ statusCode: 409, statusMessage: `Worktree path already exists: ${target}` })
    }
    return target
  }

  const base = sanitizeBranchDirName(branch)
  for (let attempt = 0; attempt < MAX_DERIVE_ATTEMPTS; attempt += 1) {
    const candidate = join(managedRoot, attempt === 0 ? base : `${base}-${attempt + 1}`)
    if (!await pathExists(candidate)) return candidate
  }
  throw createError({
    statusCode: 409,
    statusMessage: `Unable to derive a free worktree directory for branch ${branch}`
  })
}

function sanitizeBranchDirName(branch: string) {
  const sanitized = branch
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/[.-]+$/, '')
    .slice(0, 100)
  return sanitized || 'worktree'
}

async function pathExists(path: string) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function refExists(repoRoot: string, ref: string) {
  try {
    await runGit(repoRoot, ['rev-parse', '--verify', `${ref}^{commit}`])
    return true
  } catch {
    return false
  }
}
