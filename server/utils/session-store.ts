import { mkdir, open, readFile, readdir, realpath, rm, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { getConfiguredProjectRoot } from './git-access'
import { projectStoreRoot } from './project-dir'
import { writeJsonAtomic } from './atomic-write'
import type { SessionListItem, StoredTerminalSession } from '../../types/session'
export type { ProviderId, SessionListItem, SessionRuntimeState, StoredTerminalSession } from '../../types/session'

export const STORE_ROOT = projectStoreRoot()
export const SESSION_DIR = join(STORE_ROOT, 'sessions')
const deletedSessionIds = new Set<string>()
const logWrites = new Map<string, Promise<void>>()
const MAX_LOG_BYTES = 2 * 1024 * 1024
const DELETED_SESSION_GUARD_MS = 60 * 60 * 1000

export const MAX_SESSION_TITLE_LENGTH = 200
export const AUTO_TITLE_MAX_LENGTH = 60

/**
 * Derives a conversation title from the first submitted prompt: whitespace is
 * collapsed and the result is clipped to fit the sidebar. Returns '' when the
 * prompt carries no usable text.
 */
export function summarizePromptTitle(prompt: string): string {
  const line = prompt.replace(/\s+/g, ' ').trim()
  if (!line) return ''
  if (line.length <= AUTO_TITLE_MAX_LENGTH) return line
  return `${line.slice(0, AUTO_TITLE_MAX_LENGTH - 1)}…`
}

/**
 * Validates a conversation title. Returns the trimmed title, or undefined when
 * the trimmed value is empty (which clears the title). Throws on invalid input.
 */
export function normalizeSessionTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    throw new Error('Title must be a string')
  }
  const title = value.trim()
  if (title.length > MAX_SESSION_TITLE_LENGTH) {
    throw new Error(`Title must be at most ${MAX_SESSION_TITLE_LENGTH} characters`)
  }
  return title || undefined
}

export async function listStoredSessions(): Promise<SessionListItem[]> {
  return listSessions((session) => !session.archived)
}

export async function listArchivedSessions(): Promise<SessionListItem[]> {
  return listSessions((session) => session.archived === true)
}

async function listSessions(
  include: (session: StoredTerminalSession) => boolean
): Promise<SessionListItem[]> {
  await mkdir(SESSION_DIR, { recursive: true })

  const projectRoot = await getConfiguredProjectRoot()
  const entries = await readdir(SESSION_DIR, { withFileTypes: true })
  const sessions = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map(async (entry) => {
        const id = entry.name.slice(0, -'.json'.length)
        const session = await readStoredSession(id)
        if (!session || !include(session)) return null
        if (!(await sessionBelongsToProject(session, projectRoot))) return null

        return {
          ...session,
          logBytes: await getFileSize(getSessionLogPath(id))
        }
      })
  )

  return sessions
    .filter((session): session is SessionListItem => Boolean(session))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * The session store is namespaced per project (see projectStoreRoot), so this
 * directory already holds only the launching project's sessions. This check is
 * a defensive backstop against a stray file: it matches on `projectDir` (the
 * main repo root), falling back to `cwd` for sessions written without it.
 */
async function sessionBelongsToProject(
  session: StoredTerminalSession,
  projectRoot: string
): Promise<boolean> {
  if (session.projectDir) {
    return (await normalizePath(session.projectDir)) === projectRoot
  }
  if (session.cwd) {
    return isWithin(await normalizePath(session.cwd), projectRoot)
  }
  return true
}

async function normalizePath(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch {
    return resolve(path)
  }
}

function isWithin(target: string, root: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Lists every stored session across all projects, unfiltered by project or
 * archived state. Boot-time recovery reconciles user-global resources (tmux
 * sessions, the shared worktree root) and must see sessions from every project,
 * otherwise it treats another instance's live session as an orphan and destroys
 * its worktree/tmux. UI listings use the project-scoped listStoredSessions /
 * listArchivedSessions instead.
 */
export async function listAllStoredSessions(): Promise<StoredTerminalSession[]> {
  await mkdir(SESSION_DIR, { recursive: true })

  const entries = await readdir(SESSION_DIR, { withFileTypes: true })
  const sessions = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => readStoredSession(entry.name.slice(0, -'.json'.length)))
  )

  return sessions.filter((session): session is StoredTerminalSession => Boolean(session))
}

export async function readStoredSession(id: string): Promise<StoredTerminalSession | null> {
  try {
    const raw = await readFile(getSessionMetaPath(id), 'utf8')
    const parsed = JSON.parse(raw) as StoredTerminalSession & { claudeBin?: string }
    if (parsed.id !== id || !parsed.tmuxName) {
      throw new Error(`Invalid session metadata for ${id}`)
    }
    return {
      ...parsed,
      provider: parsed.provider === 'codex' ? 'codex' : parsed.provider === 'agy' ? 'agy' : 'claude',
      cliBin: parsed.cliBin || parsed.claudeBin || (parsed.provider === 'codex' ? 'codex' : parsed.provider === 'agy' ? 'agy' : 'claude')
    }
  } catch (error) {
    if (isMissingFile(error)) return null
    throw new Error(`Failed to read session metadata for ${id}`, { cause: error })
  }
}

export async function writeStoredSession(session: StoredTerminalSession) {
  deletedSessionIds.delete(session.id)
  await mkdir(SESSION_DIR, { recursive: true })
  const target = getSessionMetaPath(session.id)
  await writeJsonAtomic(target, session)
}

export async function deleteStoredSession(id: string) {
  deletedSessionIds.add(id)
  await drainSessionLog(id)
  await Promise.all([
    rm(getSessionMetaPath(id), { force: true }),
    rm(getSessionLogPath(id), { force: true })
  ])
  logWrites.delete(id)
  const guardTimer = setTimeout(() => deletedSessionIds.delete(id), DELETED_SESSION_GUARD_MS)
  guardTimer.unref()
}

export function appendSessionLog(id: string, data: string) {
  const previous = logWrites.get(id) || Promise.resolve()
  const next = previous.catch(() => {}).then(async () => {
    if (deletedSessionIds.has(id)) return
    await mkdir(SESSION_DIR, { recursive: true })
    const path = getSessionLogPath(id)
    const handle = await open(path, 'a+')
    try {
      await handle.appendFile(data)
      const { size } = await handle.stat()
      if (size <= MAX_LOG_BYTES) return
      const keep = Math.min(size, MAX_LOG_BYTES)
      const buffer = Buffer.alloc(keep)
      await handle.read(buffer, 0, keep, size - keep)
      await handle.truncate(0)
      await handle.write(buffer, 0, keep, 0)
    } finally {
      await handle.close()
    }
  })
  logWrites.set(id, next)
  void next.finally(() => {
    if (logWrites.get(id) === next) logWrites.delete(id)
  }).catch(() => {})
  return next
}

export async function drainSessionLog(id: string) {
  await logWrites.get(id)?.catch(() => {})
}

/** Returns the persisted terminal stream used for read-only archive browsing. */
export async function readSessionLog(id: string): Promise<string> {
  await drainSessionLog(id)
  try {
    return await readFile(getSessionLogPath(id), 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return ''
    throw error
  }
}

export function isSessionDeleted(id: string) {
  return deletedSessionIds.has(id)
}

export function getSessionMetaPath(id: string) {
  return join(SESSION_DIR, `${id}.json`)
}

export function getSessionLogPath(id: string) {
  return join(SESSION_DIR, `${id}.log`)
}

async function getFileSize(path: string) {
  try {
    const file = await stat(path)
    return file.size
  } catch {
    return 0
  }
}

function isMissingFile(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}
