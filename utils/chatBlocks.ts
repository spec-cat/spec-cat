import type { ChatMessage, ContentBlock, Conversation } from '~/types/chat'
import { buildMessageContentFromBlocks } from '~/utils/contentBlocks'

/**
 * Rebuild the flat `message.content` from the structured contentBlocks.
 * Mutates the message in place; no-op when contentBlocks is missing.
 */
export function syncContentFromBlocks(message: ChatMessage): void {
  if (!message.contentBlocks) return
  message.content = buildMessageContentFromBlocks(message.contentBlocks)
}

/**
 * Decide whether a block change alters data that contributes to the flat
 * `message.content`, so callers can skip the rebuild for no-op edits
 * (e.g. tool status transitions).
 */
export function shouldSyncContentForBlockChange(previous: ContentBlock, next: ContentBlock): boolean {
  if (previous.type !== next.type) return true
  switch (next.type) {
    case 'text':
      return (previous as Extract<ContentBlock, { type: 'text' }>).text !== next.text
    case 'tool_use': {
      const prev = previous as Extract<ContentBlock, { type: 'tool_use' }>
      return prev.name !== next.name || prev.inputSummary !== next.inputSummary
    }
    case 'tool_result': {
      const prev = previous as Extract<ContentBlock, { type: 'tool_result' }>
      return prev.content !== next.content || prev.isError !== next.isError
    }
    default:
      return false
  }
}

/**
 * Locate a message within a conversation list by IDs. Returns null if either
 * the conversation or the message cannot be found.
 */
export function findMessageInConversation(
  conversations: Conversation[],
  conversationId: string,
  messageId: string
): { conv: Conversation; message: ChatMessage } | null {
  const conv = conversations.find(c => c.id === conversationId)
  if (!conv) return null
  const message = conv.messages.find(m => m.id === messageId)
  if (!message) return null
  return { conv, message }
}
