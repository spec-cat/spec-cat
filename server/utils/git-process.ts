import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
export const DEFAULT_GIT_MAX_BUFFER = 1024 * 1024 * 8

export type GitProcessOptions = {
  maxBuffer?: number
  env?: NodeJS.ProcessEnv
}

/** Executes Git without altering argv order, cwd, exit errors, stdout, or stderr. */
export function executeGit(cwd: string, args: string[], options: GitProcessOptions = {}) {
  return execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? DEFAULT_GIT_MAX_BUFFER,
    ...(options.env ? { env: options.env } : {})
  })
}

export async function readGit(cwd: string, args: string[], options: GitProcessOptions & { trim?: boolean } = {}) {
  const { stdout } = await executeGit(cwd, args, options)
  return options.trim === false ? stdout : stdout.trim()
}

export function gitErrorMessage(error: unknown, fallback = 'Git command failed'): string {
  if (error && typeof error === 'object') {
    const failure = error as { stderr?: unknown, message?: unknown }
    if (typeof failure.stderr === 'string' && failure.stderr.trim()) return failure.stderr.trim()
    if (typeof failure.message === 'string' && failure.message.trim()) return failure.message.trim()
  }
  return fallback
}
