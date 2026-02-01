/**
 * GET /api/rebase/conflicts?worktreePath=...
 * Read conflicted file contents from a worktree with an in-progress rebase.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { validateWorktreePath } from '~/server/utils/validateWorktree'
import type { ConflictFile, ConflictListResponse } from '~/types/chat'

const execAsync = promisify(exec)

async function git(cwd: string, cmd: string): Promise<string> {
  const { stdout } = await execAsync(`git ${cmd}`, { cwd })
  return stdout.trim()
}

export default defineEventHandler(async (event): Promise<ConflictListResponse> => {
  const query = getQuery(event)
  const worktreePath = query.worktreePath as string

  if (!worktreePath) {
    throw createError({ statusCode: 400, message: 'worktreePath is required' })
  }

  validateWorktreePath(worktreePath)

  // Get conflict file list
  let conflictEntries: Array<{ path: string; status: string }> = []

  try {
    const statusOutput = await git(worktreePath, 'status --porcelain')
    conflictEntries = statusOutput
      .split('\n')
      .filter(line => /^(UU|AA|DU|UD)\s/.test(line))
      .map(line => ({
        status: line.substring(0, 2),
        path: line.substring(3).trim(),
      }))
  } catch {
    throw createError({ statusCode: 500, message: 'Failed to read git status' })
  }

  // Read file content for each conflicted file
  const files: ConflictFile[] = await Promise.all(
    conflictEntries.map(async (entry) => {
      let content = ''
      try {
        content = await readFile(join(worktreePath, entry.path), 'utf-8')
      } catch {
        content = '(unable to read file)'
      }
      return {
        path: entry.path,
        content,
        status: entry.status,
      }
    })
  )

  return { files, worktreePath }
})
