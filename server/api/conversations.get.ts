/**
 * GET /api/conversations — Read conversations from server-side file storage
 */

import { readConversationStorageState } from '../utils/conversationStore'

export default defineEventHandler(async () => {
  return readConversationStorageState()
})
