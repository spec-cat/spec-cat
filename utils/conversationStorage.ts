/**
 * Conversation Storage Utility (T033)
 * Handles server-side file persistence for conversations via /api/conversations
 */

import type { ArchivedConversation, Conversation } from '~/types/chat'
import {
  STORAGE_VERSION,
  isValidArchivedConversation,
  isValidConversation,
} from '~/types/chat'

export interface LoadedConversationState {
  conversations: Conversation[]
  archivedConversations: ArchivedConversation[]
  discardedConversations: number
  discardedArchives: number
}

/**
 * Load conversations from server-side storage (T004, T023)
 * Discards only corrupted entries and keeps valid ones.
 */
export async function loadConversations(): Promise<LoadedConversationState> {
  if (typeof window === 'undefined') {
    return {
      conversations: [],
      archivedConversations: [],
      discardedConversations: 0,
      discardedArchives: 0,
    }
  }

  try {
    const data = await $fetch<{
      version?: number
      conversations?: unknown[]
      archivedConversations?: unknown[]
    }>('/api/conversations')

    if (!data || !Array.isArray(data.conversations)) {
      console.warn('[conversationStorage] Invalid data structure from server')
      return {
        conversations: [],
        archivedConversations: [],
        discardedConversations: 0,
        discardedArchives: 0,
      }
    }

    // Handle version migrations here if needed in the future
    if (data.version !== STORAGE_VERSION) {
      console.warn(`[conversationStorage] Storage version mismatch: ${data.version} vs ${STORAGE_VERSION}`)
    }

    const migratedActive = data.conversations.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry
      const record = entry as Record<string, unknown>
      if ('claudeSessionId' in record && !('providerSessionId' in record)) {
        return { ...record, providerSessionId: record.claudeSessionId }
      }
      return entry
    })

    const archivedRaw = Array.isArray(data.archivedConversations) ? data.archivedConversations : []
    const migratedArchived = archivedRaw.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry
      const record = entry as Record<string, unknown>
      if ('claudeSessionId' in record && !('providerSessionId' in record)) {
        return { ...record, providerSessionId: record.claudeSessionId }
      }
      return entry
    })

    const validConversations = migratedActive.filter(isValidConversation)
    const validArchived = migratedArchived.filter(isValidArchivedConversation)

    const discardedConversations = migratedActive.length - validConversations.length
    const discardedArchives = migratedArchived.length - validArchived.length
    if (discardedConversations > 0) {
      console.warn(`[conversationStorage] Discarded ${discardedConversations} corrupted active conversation(s)`)
    }
    if (discardedArchives > 0) {
      console.warn(`[conversationStorage] Discarded ${discardedArchives} corrupted archive conversation(s)`)
    }

    return {
      conversations: validConversations,
      archivedConversations: validArchived,
      discardedConversations,
      discardedArchives,
    }
  } catch (error) {
    console.error('[conversationStorage] Failed to load conversations:', error)
    return {
      conversations: [],
      archivedConversations: [],
      discardedConversations: 0,
      discardedArchives: 0,
    }
  }
}

/**
 * Save conversations to server-side storage
 */
export async function saveConversations(
  conversations: Conversation[],
  archivedConversations: ArchivedConversation[] = [],
): Promise<boolean> {
  if (typeof window === 'undefined') return false

  try {
    await $fetch('/api/conversations', {
      method: 'POST',
      body: {
        version: STORAGE_VERSION,
        conversations,
        archivedConversations,
      },
    })
    return true
  } catch (error) {
    console.error('Failed to save conversations:', error)
    return false
  }
}

/**
 * Save a single conversation to server-side storage (patch/merge on server)
 */
export async function saveConversation(conversation: Conversation): Promise<boolean> {
  if (typeof window === 'undefined') return false

  try {
    await $fetch('/api/conversations/update', {
      method: 'POST',
      body: {
        version: STORAGE_VERSION,
        conversation,
      },
    })
    return true
  } catch (error) {
    console.error('Failed to save conversation:', error)
    return false
  }
}

/**
 * Clear all conversations
 */
export async function clearConversations(): Promise<boolean> {
  if (typeof window === 'undefined') return false

  try {
    await $fetch('/api/conversations', {
      method: 'POST',
      body: { version: STORAGE_VERSION, conversations: [], archivedConversations: [] },
    })
    return true
  } catch (error) {
    console.error('Failed to clear conversations:', error)
    return false
  }
}
