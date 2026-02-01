import type { Conversation } from '~/types/chat'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { generateConversationId } from '~/types/chat'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'
import { readSpecCatStore, writeSpecCatStore } from '../../../../utils/specCatStore'

interface StoredConversations {
  version: number
  conversations: unknown[]
  archivedConversations: unknown[]
}

const MAX_CONVERSATIONS = 100
const DEFAULTS: StoredConversations = { version: 2, conversations: [], archivedConversations: [] }
const execAsync = promisify(exec)

function randomSuffix(length = 6): string {
  return Math.random().toString(36).slice(2, 2 + length)
}

export default defineEventHandler(async (event) => {
  const archiveId = getRouterParam(event, 'archiveId')
  const body: { baseBranch?: string } =
    await readBody<{ baseBranch?: string }>(event).catch(() => ({} as { baseBranch?: string }))
  if (!archiveId) {
    throw createError({ statusCode: 400, message: 'Missing archiveId' })
  }

  const data = await readSpecCatStore<StoredConversations>('conversations.json', DEFAULTS)
  const conversations = Array.isArray(data.conversations) ? data.conversations : []
  const archivedConversations = Array.isArray(data.archivedConversations) ? data.archivedConversations : []

  if (conversations.length >= MAX_CONVERSATIONS) {
    throw createError({ statusCode: 409, message: 'Active conversation limit reached' })
  }

  const source = archivedConversations.find((entry) => {
    if (!entry || typeof entry !== 'object') return false
    return (entry as Record<string, unknown>).id === archiveId
  }) as Record<string, unknown> | undefined

  if (!source) {
    throw createError({ statusCode: 404, message: 'Archived conversation not found' })
  }
  const archiveIndex = archivedConversations.findIndex((entry) => {
    if (!entry || typeof entry !== 'object') return false
    return (entry as Record<string, unknown>).id === archiveId
  })
  if (archiveIndex === -1) {
    throw createError({ statusCode: 404, message: 'Archived conversation not found' })
  }

  const now = new Date().toISOString()
  const projectDir = getProjectDir()
  const restoredId = generateConversationId()
  const suffix = randomSuffix()
  const worktreeBranch = `br/${restoredId}-${suffix}`
  const worktreePath = `/tmp/br-${restoredId}-${suffix}`

  let baseBranch = body.baseBranch?.trim() || ''
  if (!baseBranch) {
    const { stdout: baseBranchRaw } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: projectDir })
    baseBranch = baseBranchRaw.trim()
  }
  if (baseBranch.startsWith('br/') || baseBranch.startsWith('br/p-')) {
    throw createError({ statusCode: 400, message: `Invalid base branch "${baseBranch}"` })
  }

  try {
    await execAsync(`git show-ref --verify --quiet "refs/heads/${baseBranch}"`, { cwd: projectDir })
  } catch {
    throw createError({ statusCode: 400, message: `Base branch "${baseBranch}" does not exist` })
  }

  const { stdout: headRaw } = await execAsync(`git rev-parse "refs/heads/${baseBranch}"`, { cwd: projectDir })
  const baseHead = headRaw.trim()
  await execAsync(`git worktree add -b "${worktreeBranch}" "${worktreePath}" "${baseHead}"`, { cwd: projectDir })

  logger.chat.info('Restored archived conversation with fresh worktree', {
    archiveId,
    restoredId,
    worktreePath,
    worktreeBranch,
  })

  const restored: Conversation = {
    id: restoredId,
    title: typeof source.title === 'string' ? source.title : 'Restored Conversation',
    messages: Array.isArray(source.messages) ? structuredClone(source.messages) : [],
    createdAt: now,
    updatedAt: now,
    cwd: worktreePath,
    providerId: typeof source.providerId === 'string' ? source.providerId : undefined,
    providerModelKey: typeof source.providerModelKey === 'string' ? source.providerModelKey : undefined,
    featureId: typeof source.featureId === 'string' ? source.featureId : undefined,
    baseBranch,
    restoredFromArchiveId: archiveId,
    worktreePath,
    worktreeBranch,
    hasWorktree: true,
    // Explicitly reset runtime fields from archive source.
    providerSessionId: undefined,
    previewBranch: undefined,
    finalized: undefined,
  }

  conversations.unshift(restored)
  archivedConversations.splice(archiveIndex, 1)

  await writeSpecCatStore('conversations.json', {
    version: 2,
    conversations,
    archivedConversations,
  })

  return {
    success: true,
    conversation: restored,
    conversations,
    archivedConversations,
  }
})
