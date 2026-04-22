import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { STORAGE_VERSION } from '~/types/chat'
import { getSpecCatDataDir, readSpecCatStore } from './specCatStore'
import { getProjectDir } from './projectDir'
import { isUsableBaseBranchName, resolveConversationBaseBranch } from './baseBranch'

export interface StoredConversations {
  version: number
  conversations: unknown[]
  archivedConversations: unknown[]
}

interface ArchivedConversationsFile {
  version: number
  archivedConversations: unknown[]
}

interface ConversationLikeRecord {
  baseBranch?: unknown
  worktreeBranch?: unknown
}

const LEGACY_FILENAME = 'conversations.json'
const ARCHIVED_FILENAME = 'archived-conversations.json'
const CONVERSATIONS_DIRNAME = 'conversations'
const DEFAULTS: StoredConversations = {
  version: STORAGE_VERSION,
  conversations: [],
  archivedConversations: [],
}

function getConversationsDirPath(): string {
  return join(getSpecCatDataDir(), CONVERSATIONS_DIRNAME)
}

function getConversationFilePath(conversationId: string): string {
  return join(getConversationsDirPath(), `${conversationId}.json`)
}

function isSafeConversationId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]+$/.test(value)
}

function getRecordId(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object') return null
  const value = (entry as Record<string, unknown>).id
  return isSafeConversationId(value) ? value : null
}

async function ensureDataDir(): Promise<void> {
  const root = getSpecCatDataDir()
  if (!existsSync(root)) {
    await mkdir(root, { recursive: true })
  }
}

async function ensureConversationsDir(): Promise<void> {
  const dir = getConversationsDirPath()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

async function readArchivedFile(): Promise<ArchivedConversationsFile> {
  const data = await readSpecCatStore<ArchivedConversationsFile>(ARCHIVED_FILENAME, {
    version: STORAGE_VERSION,
    archivedConversations: [],
  })

  return {
    version: typeof data.version === 'number' ? data.version : STORAGE_VERSION,
    archivedConversations: Array.isArray(data.archivedConversations) ? data.archivedConversations : [],
  }
}

async function writeArchivedFile(data: ArchivedConversationsFile): Promise<void> {
  await ensureDataDir()
  const filePath = join(getSpecCatDataDir(), ARCHIVED_FILENAME)
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

async function readConversationFiles(): Promise<unknown[]> {
  const dir = getConversationsDirPath()
  if (!existsSync(dir)) return []

  const entries = await readdir(dir, { withFileTypes: true })
  const conversations: unknown[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const filePath = join(dir, entry.name)
    try {
      const raw = await readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      conversations.push(parsed)
    } catch {
      // Skip corrupted conversation files and continue.
    }
  }

  return conversations
}

async function migrateLegacyStoreIfNeeded(
  conversationsFromFiles: unknown[],
  archivedFromFile: ArchivedConversationsFile,
): Promise<{ conversations: unknown[]; archived: ArchivedConversationsFile }> {
  const legacy = await readSpecCatStore<StoredConversations>(LEGACY_FILENAME, DEFAULTS)
  const legacyConversations = Array.isArray(legacy.conversations) ? legacy.conversations : []
  const legacyArchived = Array.isArray(legacy.archivedConversations) ? legacy.archivedConversations : []

  const mergedConversations = conversationsFromFiles.slice()
  const existingConversationIds = new Set<string>()
  for (const conv of mergedConversations) {
    const id = getRecordId(conv)
    if (id) existingConversationIds.add(id)
  }

  let conversationsChanged = false
  for (const legacyConversation of legacyConversations) {
    const id = getRecordId(legacyConversation)
    if (!id || existingConversationIds.has(id)) continue
    mergedConversations.push(legacyConversation)
    existingConversationIds.add(id)
    conversationsChanged = true
  }

  const archived = archivedFromFile.archivedConversations.slice()
  const archivedIds = new Set<string>()
  for (const item of archived) {
    const id = getRecordId(item)
    if (id) archivedIds.add(id)
  }

  let archivedChanged = false
  for (const legacyArchive of legacyArchived) {
    const id = getRecordId(legacyArchive)
    if (!id || archivedIds.has(id)) continue
    archived.push(legacyArchive)
    archivedIds.add(id)
    archivedChanged = true
  }

  if (conversationsChanged) {
    await ensureConversationsDir()
    for (const item of mergedConversations) {
      const id = getRecordId(item)
      if (!id) continue
      await writeFile(getConversationFilePath(id), JSON.stringify(item, null, 2), 'utf-8')
    }
  }

  const resolvedVersion = typeof legacy.version === 'number'
    ? legacy.version
    : archivedFromFile.version

  if (archivedChanged || (legacyArchived.length > 0 && !existsSync(join(getSpecCatDataDir(), ARCHIVED_FILENAME)))) {
    await writeArchivedFile({
      version: resolvedVersion,
      archivedConversations: archived,
    })
  }

  return {
    conversations: mergedConversations,
    archived: {
      version: resolvedVersion,
      archivedConversations: archived,
    },
  }
}

async function normalizeBaseBranches(state: StoredConversations): Promise<StoredConversations> {
  const projectDir = getProjectDir()
  let activeChanged = false
  let archivedChanged = false

  const conversations = await Promise.all(state.conversations.map(async (entry) => {
    if (!entry || typeof entry !== 'object') return entry
    const record = entry as Record<string, unknown> & ConversationLikeRecord
    if (typeof record.baseBranch !== 'string' || record.baseBranch.trim().length === 0) {
      return entry
    }
    if (isUsableBaseBranchName(record.baseBranch)) {
      return entry
    }
    const normalized = await resolveConversationBaseBranch({
      cwd: projectDir,
      storedBaseBranch: record.baseBranch,
      worktreeBranch: typeof record.worktreeBranch === 'string' ? record.worktreeBranch : null,
    })
    if (!normalized || normalized === record.baseBranch) {
      return entry
    }
    activeChanged = true
    return { ...record, baseBranch: normalized }
  }))

  const archivedConversations = await Promise.all(state.archivedConversations.map(async (entry) => {
    if (!entry || typeof entry !== 'object') return entry
    const record = entry as Record<string, unknown> & ConversationLikeRecord
    if (typeof record.baseBranch !== 'string' || record.baseBranch.trim().length === 0) {
      return entry
    }
    if (isUsableBaseBranchName(record.baseBranch)) {
      return entry
    }
    const normalized = await resolveConversationBaseBranch({
      cwd: projectDir,
      storedBaseBranch: record.baseBranch,
    })
    if (!normalized || normalized === record.baseBranch) {
      return entry
    }
    archivedChanged = true
    return { ...record, baseBranch: normalized }
  }))

  if (!activeChanged && !archivedChanged) {
    return state
  }

  const normalizedState: StoredConversations = {
    version: state.version,
    conversations,
    archivedConversations,
  }

  await writeConversationStorageState(normalizedState)
  return normalizedState
}

export async function readConversationStorageState(): Promise<StoredConversations> {
  const conversationsFromFiles = await readConversationFiles()
  const archivedFromFile = await readArchivedFile()
  const migrated = await migrateLegacyStoreIfNeeded(conversationsFromFiles, archivedFromFile)

  return normalizeBaseBranches({
    version: typeof migrated.archived.version === 'number'
      ? migrated.archived.version
      : STORAGE_VERSION,
    conversations: migrated.conversations,
    archivedConversations: migrated.archived.archivedConversations,
  })
}

export async function writeConversationStorageState(state: StoredConversations): Promise<void> {
  await ensureConversationsDir()

  const conversations = Array.isArray(state.conversations) ? state.conversations : []
  const archivedConversations = Array.isArray(state.archivedConversations) ? state.archivedConversations : []
  const version = typeof state.version === 'number' ? state.version : STORAGE_VERSION

  const expectedFiles = new Set<string>()
  for (const conversation of conversations) {
    const id = getRecordId(conversation)
    if (!id) continue
    expectedFiles.add(`${id}.json`)
    await writeFile(getConversationFilePath(id), JSON.stringify(conversation, null, 2), 'utf-8')
  }

  const dir = getConversationsDirPath()
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    if (expectedFiles.has(entry.name)) continue
    await rm(join(dir, entry.name), { force: true })
  }

  await writeArchivedFile({
    version,
    archivedConversations,
  })
}

export async function upsertConversationInStorage(conversation: unknown, version?: number): Promise<void> {
  const id = getRecordId(conversation)
  if (!id) {
    throw new Error('Conversation id is missing or invalid')
  }

  await ensureConversationsDir()
  await writeFile(getConversationFilePath(id), JSON.stringify(conversation, null, 2), 'utf-8')

  if (typeof version === 'number') {
    const archived = await readArchivedFile()
    if (archived.version !== version) {
      await writeArchivedFile({ ...archived, version })
    }
  }
}

export async function removeConversationFromStorage(conversationId: string): Promise<void> {
  if (!isSafeConversationId(conversationId)) {
    throw new Error('Conversation id is invalid')
  }
  await rm(getConversationFilePath(conversationId), { force: true })
}
