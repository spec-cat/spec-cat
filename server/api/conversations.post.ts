/**
 * POST /api/conversations — Write conversations to server-side file storage
 */

import { writeConversationStorageState } from '../utils/conversationStore'
import { STORAGE_VERSION } from '~/types/chat'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    version: number
    conversations: unknown[]
    archivedConversations?: unknown[]
  }>(event)
  if (!body || !Array.isArray(body.conversations)) {
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  }
  if (body.archivedConversations !== undefined && !Array.isArray(body.archivedConversations)) {
    throw createError({ statusCode: 400, message: 'Invalid archivedConversations' })
  }

  await writeConversationStorageState({
    version: body.version ?? STORAGE_VERSION,
    conversations: body.conversations,
    archivedConversations: body.archivedConversations ?? [],
  })

  return { success: true }
})
