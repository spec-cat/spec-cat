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
import { isUsableBaseBranchName, resolvePreferredBaseBranch } from '~/server/utils/baseBranch'
import { execGitCommand } from '~/server/utils/gitExec'
import { getChatWorktreePath } from '~/server/utils/worktreePaths'
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
  baseBranch?: string
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
  const worktreePath = getChatWorktreePath(conversationId, body.featureId)

  const requestedBaseBranch = body.baseBranch?.trim()
  if (requestedBaseBranch && !isUsableBaseBranchName(requestedBaseBranch)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid base branch "${requestedBaseBranch}"` })
  }

  let worktreeResult: { success: boolean; worktreePath?: string; branch?: string; baseBranch?: string } = { success: false }
  try {
    const baseBranch = requestedBaseBranch || await resolvePreferredBaseBranch(projectDir)
    if (!baseBranch) {
      throw new Error('Unable to resolve base branch for server job worktree')
    }
    const base = await execGitCommand(
      ['rev-parse', '--verify', `refs/heads/${baseBranch}^{commit}`],
      projectDir,
    ).catch(() => {
      if (requestedBaseBranch) {
        throw createError({ statusCode: 400, statusMessage: `Base branch "${baseBranch}" does not exist` })
      }
      throw new Error(`Base branch "${baseBranch}" does not exist`)
    })

    // Check if branch already exists (for feature branches)
    if (body.featureId) {
      try {
        await execGitCommand(['rev-parse', '--verify', branchName], projectDir)
        // Branch exists — skip worktree creation
        console.log(`[jobs.post] Branch "${branchName}" already exists, skipping worktree creation`)
      } catch {
        // Branch doesn't exist — create worktree
        await execGitCommand(['worktree', 'add', '-b', branchName, worktreePath, base], projectDir)
        worktreeResult = { success: true, worktreePath, branch: branchName, baseBranch }
      }
    } else {
      await execGitCommand(['worktree', 'add', '-b', branchName, worktreePath, base], projectDir)
      worktreeResult = { success: true, worktreePath, branch: branchName, baseBranch }
    }
  } catch (err) {
    if (requestedBaseBranch && typeof err === 'object' && err && 'statusCode' in err) {
      throw err
    }
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
    baseBranch: worktreeResult.baseBranch || requestedBaseBranch,
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
