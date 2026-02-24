import { existsSync, realpathSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const ALLOWED_ROOT_PREFIXES = ['/tmp/', '/private/tmp/'] as const
const ALLOWED_WORKTREE_NAME_PATTERNS = [
  /^sc-[a-z0-9-]+$/, // Chat worktrees: sc-<conversationId> or sc-<featureId>-<conversationId>
  /^[a-z0-9][a-z0-9-]*-[a-z0-9]{8}$/, // Feature worktrees: <feature-or-branch-name>-<randomId>
] as const

function hasAllowedRootPrefix(path: string): boolean {
  return ALLOWED_ROOT_PREFIXES.some(prefix => path.startsWith(prefix))
}

function hasAllowedWorktreeName(path: string): boolean {
  const dirName = basename(path)
  return ALLOWED_WORKTREE_NAME_PATTERNS.some(pattern => pattern.test(dirName))
}

export function validateWorktreePath(worktreePath: string): void {
  const normalizedInputPath = resolve(worktreePath)
  if (!hasAllowedRootPrefix(normalizedInputPath) || !hasAllowedWorktreeName(normalizedInputPath)) {
    throw createError({ statusCode: 403, message: 'Invalid worktree path' })
  }

  if (!existsSync(normalizedInputPath)) {
    throw createError({ statusCode: 404, message: 'Worktree not found' })
  }

  // Resolve symlinks to avoid rejecting valid tmp aliases (e.g. /tmp -> /private/tmp on macOS).
  let normalizedRealPath = normalizedInputPath
  try {
    normalizedRealPath = realpathSync(normalizedInputPath)
  } catch {
    // Keep normalized input path when realpath is unavailable.
  }

  if (!hasAllowedRootPrefix(normalizedRealPath) || !hasAllowedWorktreeName(normalizedRealPath)) {
    throw createError({ statusCode: 403, message: 'Invalid worktree path' })
  }
}

export function validateFilePath(filePath: string): void {
  if (filePath.includes('..') || filePath.startsWith('/')) {
    throw createError({ statusCode: 403, message: 'Invalid file path' })
  }
}
