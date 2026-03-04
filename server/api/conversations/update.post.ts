/**
 * POST /api/conversations/update — Patch a single conversation in storage
 */

import { upsertConversationInStorage } from '../../utils/conversationStore'
import { isValidConversation, STORAGE_VERSION } from '~/types/chat'

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

  await upsertConversationInStorage(
    body.conversation,
    body.version ?? STORAGE_VERSION,
  )

  return { success: true }
})
