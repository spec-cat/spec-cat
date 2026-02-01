/**
 * POST /api/conversations — Write conversations to server-side file storage
 */

import { writeSpecCatStore } from '../utils/specCatStore'

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

  await writeSpecCatStore('conversations.json', {
    version: body.version ?? 2,
    conversations: body.conversations,
    archivedConversations: body.archivedConversations ?? [],
  })

  return { success: true }
})
