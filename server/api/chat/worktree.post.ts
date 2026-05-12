/**
 * POST /api/chat/worktree
 * Creates an isolated git worktree for a chat conversation.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'
import { resolvePreferredBaseBranch } from '~/server/utils/baseBranch'
import { getChatWorktreePath } from '~/server/utils/worktreePaths'

const execAsync = promisify(exec)

export default defineEventHandler(async (event) => {
  const body = await readBody<{ conversationId: string; featureId?: string; baseBranch?: string }>(event)

  if (!body?.conversationId) {
    throw createError({
      statusCode: 400,
      message: 'conversationId is required',
    })
  }

  const { conversationId, featureId } = body
  const requestedBaseBranch = body.baseBranch?.trim()
  const projectDir = getProjectDir()

  // Feature-originated conversations use the featureId as branch name (e.g. "001-auth")
  // New chat conversations use sc/conv-xxx branches
  const branchName = featureId || `sc/${conversationId}`
  const worktreePath = getChatWorktreePath(conversationId, featureId)

  logger.chat.info('Creating chat worktree', { conversationId, branchName, worktreePath })
  const requestStart = process.hrtime.bigint()
  const stepDurations: Record<string, number> = {}

  async function execTimed(step: string, command: string, options?: { logFailure?: boolean }) {
    const start = process.hrtime.bigint()
    try {
      const result = await execAsync(command, { cwd: projectDir })
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000
      stepDurations[step] = durationMs
      logger.chat.debug('Chat worktree step completed', { conversationId, step, durationMs })
      return result
    } catch (error) {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000
      stepDurations[step] = durationMs
      if (options?.logFailure !== false) {
        logger.chat.warn('Chat worktree step failed', { conversationId, step, durationMs })
      }
      throw error
    }
  }

  try {
    // Resolve base branch: use requested branch when provided, otherwise infer
    // a stable non-worktree branch from the main repository state.
    let baseBranch = requestedBaseBranch || ''
    if (!baseBranch) {
      baseBranch = await resolvePreferredBaseBranch(projectDir) || ''
    }
    if (!baseBranch) {
      return {
        success: false,
        error: 'Unable to resolve a base branch for this worktree',
      }
    }
    if (baseBranch.startsWith('sc/')) {
      return {
        success: false,
        error: `Invalid base branch "${baseBranch}"`,
      }
    }
    // Resolve and verify selected base branch HEAD commit in one step.
    let base = ''
    try {
      const { stdout: head } = await execTimed('resolve-base-head', `git rev-parse --verify "refs/heads/${baseBranch}^{commit}"`)
      base = head.trim()
    } catch {
      return {
        success: false,
        error: `Base branch "${baseBranch}" does not exist`,
      }
    }

    // Feature branches must not already exist — each feature gets one branch
    if (featureId) {
      try {
        await execTimed('check-feature-branch-exists', `git rev-parse --verify "${branchName}"`, { logFailure: false })
        // Branch exists — error
        return {
          success: false,
          error: `Branch "${branchName}" already exists. Delete the existing branch or worktree first.`,
        }
      } catch {
        // Branch doesn't exist — good
      }
    }

    // Create worktree with new branch
    await execTimed('worktree-add', `git worktree add -b "${branchName}" "${worktreePath}" "${base}"`)

    const totalDurationMs = Number(process.hrtime.bigint() - requestStart) / 1_000_000
    logger.chat.info('Chat worktree created', {
      conversationId,
      worktreePath,
      branchName,
      baseBranch,
      totalDurationMs,
      steps: stepDurations,
    })

    return {
      success: true,
      worktreePath,
      branch: branchName,
      baseBranch,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const totalDurationMs = Number(process.hrtime.bigint() - requestStart) / 1_000_000
    logger.chat.error('Failed to create chat worktree', {
      conversationId,
      error: errorMessage,
      totalDurationMs,
      steps: stepDurations,
    })

    return {
      success: false,
      error: errorMessage,
    }
  }
})
