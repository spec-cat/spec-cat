/**
 * GET /api/conversations — Read conversations from server-side file storage
 */

import { readSpecCatStore } from '../utils/specCatStore'

interface StoredConversations {
  version: number
  conversations: unknown[]
  archivedConversations: unknown[]
}

const DEFAULTS: StoredConversations = { version: 2, conversations: [], archivedConversations: [] }

export default defineEventHandler(async () => {
  return readSpecCatStore<StoredConversations>('conversations.json', DEFAULTS)
})
