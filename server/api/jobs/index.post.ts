/**
 * POST /api/jobs — Submit a new job from server-side (scheduler, API trigger)
 *
 * Creates a conversation in the store if it doesn't exist,
 * then submits a job to the queue.
 */

import { jobQueue } from '~/server/utils/jobQueue'
import type { ChatJobMessage, JobSource } from '~/server/utils/jobQueue'
import { startPersisting } from '~/server/utils/jobPersister'
import { getProjectDir } from '~/server/utils/projectDir'
import { upsertConversationInStorage } from '~/server/utils/conversationStore'
import { generateConversationId, generateConversationTitle, STORAGE_VERSION } from '~/types/chat'
import type { Conversation, ConversationSource } from '~/types/chat'

interface SubmitJobRequest {
  message: string
  conversationId?: string
  title?: string
  source?: JobSource
  permissionMode?: 'plan' | 'ask' | 'auto' | 'bypass'
  cwd?: string
  featureId?: string
  providerId?: string
  providerModelKey?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<SubmitJobRequest>(event)

  if (!body?.message?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'message is required' })
  }

  const source: JobSource = body.source || 'scheduler'
  const conversationId = body.conversationId || generateConversationId()
  const now = new Date().toISOString()
  const projectDir = getProjectDir()

  // Create a minimal conversation record in the store
  const conversation: Conversation = {
    id: conversationId,
    title: body.title || generateConversationTitle(body.message),
    messages: [],
    createdAt: now,
    updatedAt: now,
    cwd: body.cwd || projectDir,
    source: source as ConversationSource,
    featureId: body.featureId,
    providerId: body.providerId,
    providerModelKey: body.providerModelKey,
  }

  await upsertConversationInStorage(conversation, STORAGE_VERSION)

  const jobMessage: ChatJobMessage = {
    message: body.message,
    conversationId,
    requestId: `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    permissionMode: body.permissionMode || 'bypass',
    cwd: body.cwd || projectDir,
    featureId: body.featureId,
    providerId: body.providerId,
    providerModelKey: body.providerModelKey,
  }

  // Subscribe server-side persister before submitting so no events are missed
  startPersisting(conversationId, body.message)

  const jobId = jobQueue.submit(jobMessage, source)

  return {
    jobId,
    conversationId,
    source,
  }
})
