/**
 * POST /api/rebase/continue
 * After all conflict files are resolved, continue the rebase and complete finalization.
 * Mirrors steps 6-8 of finalize.post.ts.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'
import type { RebaseContinueRequest, FinalizeResponse } from '~/types/chat'

const execAsync = promisify(exec)

async function git(cwd: string, cmd: string, env?: Record<string, string>): Promise<string> {
  const { stdout } = await execAsync(`git ${cmd}`, {
    cwd,
    env: env ? { ...process.env, ...env } : undefined,
  })
  return stdout.trim()
}

export default defineEventHandler(async (event): Promise<FinalizeResponse> => {
  const body = await readBody<RebaseContinueRequest>(event)

  if (!body?.conversationId || !body?.commitMessage) {
    throw createError({ statusCode: 400, message: 'conversationId and commitMessage are required' })
  }

  const { conversationId, commitMessage } = body
  const projectDir = getProjectDir()
  const branchName = body.worktreeBranch || `sc/${conversationId}`
  const worktreePath = body.worktreePath || `/tmp/sc-${conversationId}`

  if (!existsSync(worktreePath)) {
    return { success: false, error: 'Worktree directory not found.' }
  }

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

  try {
    // Continue the rebase (GIT_EDITOR=true skips the editor)
    try {
      await git(worktreePath, 'rebase --continue', { GIT_EDITOR: 'true' })
    } catch (rebaseError) {
      // Check if there are still unresolved conflicts
      let conflictFiles: string[] = []
      try {
        const statusOutput = await git(worktreePath, 'status --porcelain')
        conflictFiles = statusOutput
          .split('\n')
          .filter(line => /^(UU|AA|DU|UD)\s/.test(line))
          .map(line => line.substring(3).trim())
      } catch { /* ignore */ }

      if (conflictFiles.length > 0) {
        return {
          success: false,
          error: 'There are still unresolved conflicts.',
          conflictFiles,
          rebaseInProgress: true,
        }
      }

      // Unknown rebase error
      const msg = rebaseError instanceof Error ? rebaseError.message : String(rebaseError)
      return { success: false, error: `Rebase continue failed: ${msg}` }
    }

    // --- From here, same as finalize.post.ts steps 6-8 ---

    // 6. Checkout baseBranch in main worktree
    const previewBranch = body.previewBranch
    try {
      const currentBranch = await git(projectDir, 'rev-parse --abbrev-ref HEAD')
      if (currentBranch !== baseBranch) {
        await git(projectDir, `checkout "${baseBranch}"`)
      }
    } catch { /* ignore */ }

    // 7. Update base branch ref
    const newHead = await git(worktreePath, 'rev-parse HEAD')
    await git(projectDir, `update-ref refs/heads/${baseBranch} ${newHead}`)

    // 7-1. Sync working directory
    try {
      const mainBranch = await git(projectDir, 'rev-parse --abbrev-ref HEAD')
      if (mainBranch === baseBranch) {
        await git(projectDir, 'reset --hard HEAD')
      }
    } catch { /* skip */ }

    logger.chat.info('Base branch updated after conflict resolution', { baseBranch, newHead })

    // 8. Cleanup worktree + branches
    try {
      await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: projectDir })
    } catch {
      try {
        await rm(worktreePath, { recursive: true, force: true })
      } catch { /* ignore */ }
    }

    await execAsync('git worktree prune', { cwd: projectDir }).catch(() => {})

    try {
      await git(projectDir, `branch -D "${branchName}"`)
    } catch {
      logger.chat.warn('Failed to delete temp branch', { branchName })
    }

    if (previewBranch) {
      try {
        await git(projectDir, `branch -D "${previewBranch}"`)
      } catch { /* preview branch may not exist */ }
    }

    logger.chat.info('Conversation finalized after conflict resolution', { conversationId, newCommit: newHead })

    return { success: true, newCommit: newHead }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.chat.error('Rebase continue failed', { conversationId, error: errorMessage })
    return { success: false, error: errorMessage }
  }
})
