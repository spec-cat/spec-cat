import { markInterruptedStreamingConversations } from '../utils/conversationStore'

export default defineNitroPlugin(() => {
  markInterruptedStreamingConversations()
    .then((count) => {
      if (count > 0) {
        console.log(`[chat-recovery] Marked ${count} interrupted streaming conversation(s) after server restart`)
      }
    })
    .catch((error) => {
      console.error('[chat-recovery] Failed to reconcile interrupted streaming conversations:', error)
    })
})
