/**
 * POST /api/rebase/continue-sync
 * Continue rebase after conflict resolution — WITHOUT finalize cleanup.
 * Keeps worktree intact for continued work.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { logger } from '~/server/utils/logger'
import type { RebaseSyncRequest, FinalizeResponse } from '~/types/chat'

const execAsync = promisify(exec)

async function git(cwd: string, cmd: string, env?: Record<string, string>): Promise<string> {
  const { stdout } = await execAsync(`git ${cmd}`, {
    cwd,
    env: env ? { ...process.env, ...env } : undefined,
  })
  return stdout.trim()
}

export default defineEventHandler(async (event): Promise<FinalizeResponse> => {
  const body = await readBody<RebaseSyncRequest>(event)

  if (!body?.conversationId) {
    throw createError({ statusCode: 400, message: 'conversationId is required' })
  }

  const { conversationId } = body
  const worktreePath = body.worktreePath || `/tmp/br-${conversationId}`

  if (!existsSync(worktreePath)) {
    return { success: false, error: 'Worktree directory not found.' }
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

    logger.chat.info('Rebase sync completed after conflict resolution', { conversationId })

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.chat.error('Rebase continue-sync failed', { conversationId, error: errorMessage })
    return { success: false, error: errorMessage }
  }
})
