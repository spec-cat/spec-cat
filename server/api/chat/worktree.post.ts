/**
 * POST /api/chat/worktree
 * Creates an isolated git worktree for a chat conversation.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'
import { readAutoModeSpecState } from '~/server/utils/autoModeSpecState'

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
  const specState = featureId ? await readAutoModeSpecState() : {}
  const providerSessionId = featureId ? specState[featureId]?.sessionId : undefined

  // Feature-originated conversations use the featureId as branch name (e.g. "001-auth")
  // New chat conversations use sc/conv-xxx branches
  const branchName = featureId || `sc/${conversationId}`
  const worktreePath = featureId
    ? `/tmp/sc-${featureId}-${conversationId}`
    : `/tmp/sc-${conversationId}`

  logger.chat.info('Creating chat worktree', { conversationId, branchName, worktreePath })

  try {
    // Resolve base branch: use requested branch when provided, otherwise current branch.
    let baseBranch = requestedBaseBranch || ''
    if (!baseBranch) {
      const { stdout: baseBranchRaw } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: projectDir })
      baseBranch = baseBranchRaw.trim()
    }
    if (baseBranch.startsWith('sc/')) {
      return {
        success: false,
        error: `Invalid base branch "${baseBranch}"`,
      }
    }
    try {
      await execAsync(`git show-ref --verify --quiet "refs/heads/${baseBranch}"`, { cwd: projectDir })
    } catch {
      return {
        success: false,
        error: `Base branch "${baseBranch}" does not exist`,
      }
    }

    // Resolve selected base branch HEAD commit.
    const { stdout: head } = await execAsync(`git rev-parse "refs/heads/${baseBranch}"`, { cwd: projectDir })
    const base = head.trim()

    // Feature branches must not already exist — each feature gets one branch
    if (featureId) {
      try {
        await execAsync(`git rev-parse --verify "${branchName}"`, { cwd: projectDir })
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
    await execAsync(`git worktree add -b "${branchName}" "${worktreePath}" "${base}"`, {
      cwd: projectDir,
    })

    logger.chat.info('Chat worktree created', { conversationId, worktreePath, branchName, baseBranch })

    return {
      success: true,
      worktreePath,
      branch: branchName,
      baseBranch,
      providerSessionId,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.chat.error('Failed to create chat worktree', { conversationId, error: errorMessage })

    return {
      success: false,
      error: errorMessage,
    }
  }
})
