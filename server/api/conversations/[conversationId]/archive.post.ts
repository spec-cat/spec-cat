import type { ArchivedConversation } from '~/types/chat'
import { exec } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { promisify } from 'node:util'
import { generateArchivedConversationId } from '~/types/chat'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'
import { readSpecCatStore, writeSpecCatStore } from '../../../utils/specCatStore'

interface StoredConversations {
  version: number
  conversations: unknown[]
  archivedConversations: unknown[]
}

const DEFAULTS: StoredConversations = { version: 2, conversations: [], archivedConversations: [] }
const execAsync = promisify(exec)

async function isWorktreeRegistered(projectDir: string, worktreePath: string): Promise<boolean> {
  const { stdout } = await execAsync('git worktree list --porcelain', { cwd: projectDir })
  return stdout.split('\n').some(line => line === `worktree ${worktreePath}`)
}

async function branchExists(projectDir: string, branch: string): Promise<boolean> {
  try {
    await execAsync(`git rev-parse --verify "${branch}"`, { cwd: projectDir })
    return true
  } catch {
    return false
  }
}

export default defineEventHandler(async (event) => {
  const conversationId = getRouterParam(event, 'conversationId')
  if (!conversationId) {
    throw createError({ statusCode: 400, message: 'Missing conversationId' })
  }

  const data = await readSpecCatStore<StoredConversations>('conversations.json', DEFAULTS)
  const conversations = Array.isArray(data.conversations) ? data.conversations : []
  const archivedConversations = Array.isArray(data.archivedConversations) ? data.archivedConversations : []

  const index = conversations.findIndex((entry) => {
    if (!entry || typeof entry !== 'object') return false
    return (entry as Record<string, unknown>).id === conversationId
  })
  if (index === -1) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  const source = conversations[index] as Record<string, unknown>
  const projectDir = getProjectDir()
  const worktreePath = typeof source.worktreePath === 'string' ? source.worktreePath : ''
  const worktreeBranch = typeof source.worktreeBranch === 'string' ? source.worktreeBranch : ''

  // Enforce cleanup invariant for archived conversations.
  if (worktreePath || worktreeBranch) {
    if (worktreePath) {
      const registered = await isWorktreeRegistered(projectDir, worktreePath)
      if (registered) {
        await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: projectDir })
      } else if (existsSync(worktreePath)) {
        await rm(worktreePath, { recursive: true, force: true })
      }
      await execAsync('git worktree prune', { cwd: projectDir })
    }

    if (worktreeBranch) {
      const exists = await branchExists(projectDir, worktreeBranch)
      if (exists) {
        await execAsync(`git branch -D "${worktreeBranch}"`, { cwd: projectDir })
      }
    }

    const stillRegistered = worktreePath ? await isWorktreeRegistered(projectDir, worktreePath) : false
    if (stillRegistered) {
      logger.chat.error('Archive blocked: worktree still registered after cleanup', { conversationId, worktreePath })
      throw createError({ statusCode: 500, message: 'Failed to remove worktree before archive' })
    }
    const branchStillExists = worktreeBranch ? await branchExists(projectDir, worktreeBranch) : false
    if (branchStillExists) {
      logger.chat.error('Archive blocked: branch still exists after cleanup', { conversationId, worktreeBranch })
      throw createError({ statusCode: 500, message: 'Failed to remove branch before archive' })
    }
  }

  const archivedAt = new Date().toISOString()
  const snapshot: ArchivedConversation = {
    id: generateArchivedConversationId(),
    sourceConversationId: conversationId,
    title: typeof source.title === 'string' ? source.title : 'Untitled',
    messages: Array.isArray(source.messages) ? structuredClone(source.messages) : [],
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : archivedAt,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : archivedAt,
    archivedAt,
    cwd: typeof source.cwd === 'string' ? source.cwd : '',
    providerId: typeof source.providerId === 'string' ? source.providerId : undefined,
    providerModelKey: typeof source.providerModelKey === 'string' ? source.providerModelKey : undefined,
    featureId: typeof source.featureId === 'string' ? source.featureId : undefined,
    baseBranch: typeof source.baseBranch === 'string' ? source.baseBranch : undefined,
  }

  conversations.splice(index, 1)
  archivedConversations.unshift(snapshot)

  await writeSpecCatStore('conversations.json', {
    version: 2,
    conversations,
    archivedConversations,
  })

  return {
    success: true,
    archived: snapshot,
    conversations,
    archivedConversations,
  }
})
