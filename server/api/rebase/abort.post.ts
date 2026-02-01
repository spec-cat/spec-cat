/**
 * POST /api/rebase/abort
 * Abort in-progress rebase and restore worktree to pre-rebase state.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { validateWorktreePath } from '~/server/utils/validateWorktree'
import type { RebaseAbortRequest, RebaseAbortResponse } from '~/types/chat'

const execAsync = promisify(exec)

async function git(cwd: string, cmd: string): Promise<string> {
  const { stdout } = await execAsync(`git ${cmd}`, { cwd })
  return stdout.trim()
}

export default defineEventHandler(async (event): Promise<RebaseAbortResponse> => {
  const body = await readBody<RebaseAbortRequest>(event)

  if (!body?.worktreePath) {
    throw createError({ statusCode: 400, message: 'worktreePath is required' })
  }

  validateWorktreePath(body.worktreePath)

  try {
    await git(body.worktreePath, 'rebase --abort')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
})
