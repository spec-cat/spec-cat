/**
 * POST /api/jobs — Submit a new job from server-side (scheduler, API trigger)
 *
 * Creates a conversation in the store if it doesn't exist,
 * then submits a job to the queue.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { jobQueue } from '~/server/utils/jobQueue'
import type { ChatJobMessage, JobSource } from '~/server/utils/jobQueue'
import { startPersisting } from '~/server/utils/jobPersister'
import { getProjectDir } from '~/server/utils/projectDir'
import { upsertConversationInStorage } from '~/server/utils/conversationStore'
import { generateConversationId, generateConversationTitle, STORAGE_VERSION } from '~/types/chat'
import type { Conversation, ConversationSource } from '~/types/chat'

const execAsync = promisify(exec)

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

  // Create worktree for isolation (same as client-initiated conversations)
  // Validate featureId to prevent shell injection in git commands
  if (body.featureId && !/^[a-zA-Z0-9_\-]+$/.test(body.featureId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid featureId format (alphanumeric, hyphens, underscores only)' })
  }
  const branchName = body.featureId || `sc/${conversationId}`
  const worktreePath = body.featureId
    ? `/tmp/sc-${body.featureId}-${conversationId}`
    : `/tmp/sc-${conversationId}`

  let worktreeResult: { success: boolean; worktreePath?: string; branch?: string; baseBranch?: string } = { success: false }
  try {
    // Resolve base branch
    const { stdout: baseBranchRaw } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: projectDir })
    const baseBranch = baseBranchRaw.trim()
    const { stdout: baseHead } = await execAsync(`git rev-parse --verify "refs/heads/${baseBranch}^{commit}"`, { cwd: projectDir })
    const base = baseHead.trim()

    // Check if branch already exists (for feature branches)
    if (body.featureId) {
      try {
        await execAsync(`git rev-parse --verify "${branchName}"`, { cwd: projectDir })
        // Branch exists — skip worktree creation
        console.log(`[jobs.post] Branch "${branchName}" already exists, skipping worktree creation`)
      } catch {
        // Branch doesn't exist — create worktree
        await execAsync(`git worktree add -b "${branchName}" "${worktreePath}" "${base}"`, { cwd: projectDir })
        worktreeResult = { success: true, worktreePath, branch: branchName, baseBranch }
      }
    } else {
      await execAsync(`git worktree add -b "${branchName}" "${worktreePath}" "${base}"`, { cwd: projectDir })
      worktreeResult = { success: true, worktreePath, branch: branchName, baseBranch }
    }
  } catch (err) {
    console.warn('[jobs.post] Failed to create worktree for server job:', err instanceof Error ? err.message : err)
  }

  // Create a minimal conversation record in the store
  const conversationCwd = worktreeResult.success ? worktreeResult.worktreePath! : (body.cwd || projectDir)
  const conversation: Conversation = {
    id: conversationId,
    title: body.title || generateConversationTitle(body.message),
    messages: [],
    createdAt: now,
    updatedAt: now,
    cwd: conversationCwd,
    source: source as ConversationSource,
    featureId: body.featureId,
    providerId: body.providerId,
    providerModelKey: body.providerModelKey,
    ...(worktreeResult.success && {
      worktreePath: worktreeResult.worktreePath,
      worktreeBranch: worktreeResult.branch,
      hasWorktree: true,
      baseBranch: worktreeResult.baseBranch,
    }),
  }

  await upsertConversationInStorage(conversation, STORAGE_VERSION)

  const jobMessage: ChatJobMessage = {
    message: body.message,
    conversationId,
    requestId: `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    permissionMode: body.permissionMode || 'bypass',
    cwd: conversationCwd,
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
