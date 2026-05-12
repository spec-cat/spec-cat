import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const CHAT_WORKTREE_PREFIX = 'sc-'
const WORKTREE_NAME_PATTERNS = [
  /^sc-[a-z0-9-]+$/,
  /^[a-z0-9][a-z0-9-]*-[a-z0-9]{8}$/,
] as const

export function getSpecCatTmpDir(): string {
  return join(homedir(), '.spec-cat', 'tmp')
}

export function ensureSpecCatTmpDir(): string {
  const tmpDir = getSpecCatTmpDir()
  mkdirSync(tmpDir, { recursive: true })
  return tmpDir
}

export function getChatWorktreePath(conversationId: string, featureId?: string): string {
  const name = featureId
    ? `${CHAT_WORKTREE_PREFIX}${featureId}-${conversationId}`
    : `${CHAT_WORKTREE_PREFIX}${conversationId}`
  return join(ensureSpecCatTmpDir(), name)
}

export function getFeatureWorktreePath(branchName: string, randomId: string): string {
  return join(ensureSpecCatTmpDir(), `${branchName}-${randomId}`)
}

export function isSpecCatWorktreePath(worktreePath: string): boolean {
  const normalizedRoot = `${resolve(getSpecCatTmpDir())}/`
  const normalizedPath = resolve(worktreePath)
  return normalizedPath.startsWith(normalizedRoot)
    && WORKTREE_NAME_PATTERNS.some(pattern => pattern.test(basename(normalizedPath)))
}

export function getChatWorktreeIdFromPath(worktreePath: string): string {
  const normalizedRoot = `${resolve(getSpecCatTmpDir())}/`
  const normalizedPath = resolve(worktreePath)
  if (!normalizedPath.startsWith(normalizedRoot)) return ''

  const relativePath = normalizedPath.slice(normalizedRoot.length)
  if (!relativePath.startsWith(CHAT_WORKTREE_PREFIX)) return ''

  return relativePath.slice(CHAT_WORKTREE_PREFIX.length)
}
