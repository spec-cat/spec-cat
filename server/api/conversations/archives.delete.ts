import { readConversationStorageState, writeConversationStorageState } from '../../utils/conversationStore'

export default defineEventHandler(async () => {
  const data = await readConversationStorageState()
  const conversations = Array.isArray(data.conversations) ? data.conversations : []
  const archivedConversations = Array.isArray(data.archivedConversations) ? data.archivedConversations : []

  const deletedCount = archivedConversations.length

  await writeConversationStorageState({
    version: data.version,
    conversations,
    archivedConversations: [],
  })

  return { success: true, deletedCount }
})
