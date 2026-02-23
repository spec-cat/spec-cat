/**
 * POST /api/conversations/update — Patch a single conversation in storage
 */

import { readSpecCatStore, writeSpecCatStore } from '../../utils/specCatStore'
import { isValidConversation, STORAGE_VERSION } from '~/types/chat'

interface StoredConversations {
  version: number
  conversations: unknown[]
  archivedConversations: unknown[]
}

const DEFAULTS: StoredConversations = { version: STORAGE_VERSION, conversations: [], archivedConversations: [] }

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    version?: number
    conversation?: unknown
  }>(event)

  if (!body || !body.conversation) {
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  }

  if (!isValidConversation(body.conversation)) {
    throw createError({ statusCode: 400, message: 'Invalid conversation' })
  }

  const stored = await readSpecCatStore<StoredConversations>('conversations.json', DEFAULTS)
  const conversations = Array.isArray(stored.conversations) ? stored.conversations.slice() : []

  const updated = body.conversation
  const index = conversations.findIndex((item) => {
    if (!item || typeof item !== 'object') return false
    return (item as { id?: string }).id === updated.id
  })

  if (index >= 0) {
    conversations[index] = updated
  } else {
    conversations.unshift(updated)
  }

  await writeSpecCatStore('conversations.json', {
    version: body.version ?? stored.version ?? STORAGE_VERSION,
    conversations,
    archivedConversations: Array.isArray(stored.archivedConversations) ? stored.archivedConversations : [],
  })

  return { success: true }
})
