import { readSpecCatStore } from '../../utils/specCatStore'

interface StoredConversations {
  version: number
  conversations: unknown[]
  archivedConversations: unknown[]
}

const DEFAULTS: StoredConversations = { version: 2, conversations: [], archivedConversations: [] }

export default defineEventHandler(async (event) => {
  const data = await readSpecCatStore<StoredConversations>('conversations.json', DEFAULTS)
  const query = (getQuery(event).q as string | undefined)?.toLowerCase().trim()

  const archives = Array.isArray(data.archivedConversations) ? data.archivedConversations : []
  const filtered = query
    ? archives.filter((entry) => {
        if (!entry || typeof entry !== 'object') return false
        const record = entry as Record<string, unknown>
        const title = typeof record.title === 'string' ? record.title.toLowerCase() : ''
        if (title.includes(query)) return true
        const messages = Array.isArray(record.messages) ? record.messages : []
        return messages.some((msg) => {
          if (!msg || typeof msg !== 'object') return false
          const content = (msg as Record<string, unknown>).content
          return typeof content === 'string' && content.toLowerCase().includes(query)
        })
      })
    : archives

  filtered.sort((a, b) => {
    const left = a && typeof a === 'object' ? (a as Record<string, unknown>).archivedAt : ''
    const right = b && typeof b === 'object' ? (b as Record<string, unknown>).archivedAt : ''
    return new Date(String(right)).getTime() - new Date(String(left)).getTime()
  })

  return { archives: filtered }
})
