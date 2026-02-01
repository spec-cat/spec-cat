/**
 * PUT /api/rebase/resolve
 * Write resolved content for a single conflict file and git add it.
 */

import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { validateWorktreePath, validateFilePath } from '~/server/utils/validateWorktree'
import type { ResolveFileRequest, ResolveFileResponse } from '~/types/chat'

const execAsync = promisify(exec)

async function git(cwd: string, cmd: string): Promise<string> {
  const { stdout } = await execAsync(`git ${cmd}`, { cwd })
  return stdout.trim()
}

export default defineEventHandler(async (event): Promise<ResolveFileResponse> => {
  const body = await readBody<ResolveFileRequest>(event)

  if (!body?.worktreePath || !body?.filePath || body?.content === undefined) {
    throw createError({ statusCode: 400, message: 'worktreePath, filePath, and content are required' })
  }

  validateWorktreePath(body.worktreePath)
  validateFilePath(body.filePath)

  try {
    // Write resolved content to disk
    const fullPath = join(body.worktreePath, body.filePath)
    await writeFile(fullPath, body.content, 'utf-8')

    // Stage the resolved file
    await git(body.worktreePath, `add "${body.filePath}"`)

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
})
