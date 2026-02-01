import { existsSync } from 'node:fs'

export function validateWorktreePath(worktreePath: string): void {
  if (!worktreePath.startsWith('/tmp/br-')) {
    throw createError({ statusCode: 403, message: 'Invalid worktree path' })
  }
  if (!existsSync(worktreePath)) {
    throw createError({ statusCode: 404, message: 'Worktree not found' })
  }
}

export function validateFilePath(filePath: string): void {
  if (filePath.includes('..') || filePath.startsWith('/')) {
    throw createError({ statusCode: 403, message: 'Invalid file path' })
  }
}
