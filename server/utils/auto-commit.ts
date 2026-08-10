import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ProviderId } from './session-store'

const execFileAsync = promisify(execFile)
const commitQueue = new Map<string, Promise<AutoCommitResult>>()

export type AutoCommitResult = {
  committed: boolean
  hash?: string
}

export function autoCommitTurn(cwd: string, provider: ProviderId) {
  const previous = commitQueue.get(cwd) || Promise.resolve({ committed: false })
  const next = previous
    .catch(() => ({ committed: false }))
    .then(() => commitChanges(cwd, provider))
    .finally(() => {
      if (commitQueue.get(cwd) === next) commitQueue.delete(cwd)
    })

  commitQueue.set(cwd, next)
  return next
}

async function commitChanges(cwd: string, provider: ProviderId): Promise<AutoCommitResult> {
  const { stdout: status } = await git(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])
  if (!status.trim()) return { committed: false }

  await git(cwd, ['add', '--all'])

  // A file may have returned to its HEAD state between status and staging.
  const staged = await gitExitCode(cwd, ['diff', '--cached', '--quiet'])
  if (staged === 0) return { committed: false }
  if (staged !== 1) throw new Error('Unable to inspect staged changes')

  await git(cwd, ['commit', '-m', `chore: auto-commit after ${provider} turn`])
  const { stdout: hash } = await git(cwd, ['rev-parse', 'HEAD'])
  return { committed: true, hash: hash.trim() }
}

async function git(cwd: string, args: string[]) {
  return execFileAsync('git', args, { cwd })
}

async function gitExitCode(cwd: string, args: string[]) {
  try {
    await git(cwd, args)
    return 0
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && typeof error.code === 'number') {
      return error.code
    }
    throw error
  }
}
