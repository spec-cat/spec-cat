import { readConversationStorageState, writeConversationStorageState } from '../../../utils/conversationStore'

export default defineEventHandler(async (event) => {
  const archiveId = getRouterParam(event, 'archiveId')
  if (!archiveId) {
    throw createError({ statusCode: 400, message: 'Missing archiveId' })
  }

  const data = await readConversationStorageState()
  const conversations = Array.isArray(data.conversations) ? data.conversations : []
  const archivedConversations = Array.isArray(data.archivedConversations) ? data.archivedConversations : []

  const index = archivedConversations.findIndex((entry) => {
    if (!entry || typeof entry !== 'object') return false
    return (entry as Record<string, unknown>).id === archiveId
  })

  if (index === -1) {
    throw createError({ statusCode: 404, message: 'Archived conversation not found' })
  }

  archivedConversations.splice(index, 1)

  await writeConversationStorageState({
    version: data.version,
    conversations,
    archivedConversations,
  })

  return {
    success: true,
    archivedConversations,
  }
})
