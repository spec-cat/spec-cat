/**
 * Shared helpers for chat git endpoints.
 *
 * All chat endpoints that build git commands from user-supplied branch names or
 * paths must route through these helpers to stay shell-injection safe and to
 * reject malformed refs before they reach git.
 */

import { execGitCommand } from './gitExec'

// Git ref names: start with an alphanumeric, then allow the common safe set.
// Deliberately excludes shell metacharacters, whitespace, and the sequences git
// itself forbids in ref names ("..", trailing ".lock", "@{").
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

export function isSafeBranchName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 255 &&
    SAFE_REF_PATTERN.test(value) &&
    !value.includes('..') &&
    !value.includes('@{') &&
    !value.endsWith('.lock')
  )
}

export function assertSafeBranchName(value: unknown, label = 'branch'): string {
  if (!isSafeBranchName(value)) {
    throw createError({ statusCode: 400, message: `Invalid ${label} name` })
  }
  return value
}

/**
 * Run a git command (argv form, no shell) in the given working directory and
 * return its trimmed stdout. Drop-in replacement for the per-endpoint
 * `git(cwd, 'sub command')` string helpers, but injection-safe.
 */
export function git(cwd: string, args: string[]): Promise<string> {
  return execGitCommand(args, cwd)
}
