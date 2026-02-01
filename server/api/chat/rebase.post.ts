/**
 * POST /api/chat/rebase
 * Rebase worktree branch onto latest base branch WITHOUT squash/finalize.
 * Keeps the worktree intact for continued work.
 *
 * Conflict handling: same as finalize — returns conflict file list for UI resolution.
 */

import { exec, execSync } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'
import type { RebaseSyncRequest, FinalizeResponse } from '~/types/chat'

const execAsync = promisify(exec)

async function git(cwd: string, cmd: string): Promise<string> {
  const { stdout } = await execAsync(`git ${cmd}`, { cwd })
  return stdout.trim()
}

/**
 * Auto-commit any uncommitted changes in the worktree
 */
async function autoCommitChanges(worktreePath: string): Promise<boolean> {
  const status = await git(worktreePath, 'status --porcelain')
  if (!status) return false

  await git(worktreePath, 'add -A')
  // Use stdin (-F -) to safely handle any special characters
  execSync('git commit -F -', { cwd: worktreePath, input: 'auto-commit uncommitted changes', encoding: 'utf-8' })
  return true
}

export default defineEventHandler(async (event): Promise<FinalizeResponse> => {
  const body = await readBody<RebaseSyncRequest>(event)

  if (!body?.conversationId) {
    throw createError({
      statusCode: 400,
      message: 'conversationId is required',
    })
  }

  const { conversationId } = body
  const projectDir = getProjectDir()
  const worktreePath = body.worktreePath || `/tmp/br-${conversationId}`

  // Resolve base branch
  let baseBranch = body.baseBranch
  if (!baseBranch) {
    try {
      await git(projectDir, 'rev-parse --verify main')
      baseBranch = 'main'
    } catch {
      baseBranch = 'master'
    }
  } else {
    // Verify the requested base branch actually exists
    try {
      await git(projectDir, `rev-parse --verify "${baseBranch}"`)
    } catch {
      logger.chat.warn('Requested baseBranch not found, falling back', { requested: baseBranch })
      try {
        await git(projectDir, 'rev-parse --verify main')
        baseBranch = 'main'
      } catch {
        baseBranch = 'master'
      }
    }
  }

  logger.chat.info('Rebasing worktree onto base', { conversationId, baseBranch })

  try {
    // 0. Ensure worktree exists
    if (!existsSync(worktreePath)) {
      return { success: false, error: 'Worktree directory not found. It may have been cleaned up.' }
    }

    // 1. Auto-commit any uncommitted changes
    await autoCommitChanges(worktreePath)

    // 2. Rebase onto latest base branch (no squash)
    try {
      await git(worktreePath, `rebase ${baseBranch}`)
    } catch {
      // Conflict detected — return conflict file list
      logger.chat.warn('Rebase conflict during sync', { conversationId })

      let conflictFiles: string[] = []
      try {
        const diffOutput = await git(worktreePath, 'diff --name-only --diff-filter=U')
        conflictFiles = diffOutput.split('\n').filter(Boolean)
      } catch {
        try {
          const statusOutput = await git(worktreePath, 'status --porcelain')
          conflictFiles = statusOutput
            .split('\n')
            .filter(line => line.startsWith('UU') || line.startsWith('AA') || line.startsWith('DU') || line.startsWith('UD'))
            .map(line => line.substring(3))
        } catch { /* ignore */ }
      }

      return {
        success: false,
        error: `Rebase conflict with "${baseBranch}". Resolve conflicts to continue.`,
        conflictFiles,
        rebaseInProgress: true,
      }
    }

    logger.chat.info('Worktree rebased successfully', { conversationId, baseBranch })

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.chat.error('Rebase sync failed', { conversationId, error: errorMessage })
    return { success: false, error: errorMessage }
  }
})
