import { describe, expect, it, vi } from 'vitest'

// Avoid pulling child_process via gitExec — chatGit only re-exports a thin git()
// wrapper around it, and these tests target the branch-name validators.
vi.mock('~/server/utils/gitExec', () => ({
  execGitCommand: vi.fn(),
}))

import { isSafeBranchName, assertSafeBranchName } from '~/server/utils/chatGit'

describe('isSafeBranchName', () => {
  it('accepts ordinary branch names', () => {
    for (const name of ['main', 'develop', 'sc/conv-123', 'feature/auth', '001-auth', 'release-1.2.3']) {
      expect(isSafeBranchName(name)).toBe(true)
    }
  })

  it('rejects shell-metacharacter and injection attempts', () => {
    for (const name of [
      'x"; rm -rf /; "',
      '$(touch pwned)',
      '`id`',
      'a b',
      'a;b',
      'a|b',
      'a&&b',
      '..',
      'foo..bar',
      'foo@{0}',
      'tip.lock',
      '-x',
      '/leading-slash',
    ]) {
      expect(isSafeBranchName(name)).toBe(false)
    }
  })

  it('rejects non-strings and empty values', () => {
    expect(isSafeBranchName('')).toBe(false)
    expect(isSafeBranchName(undefined)).toBe(false)
    expect(isSafeBranchName(null)).toBe(false)
    expect(isSafeBranchName(123)).toBe(false)
  })
})

describe('assertSafeBranchName', () => {
  it('returns the value for a valid branch', () => {
    expect(assertSafeBranchName('sc/conv-1')).toBe('sc/conv-1')
  })

  it('throws for an invalid branch', () => {
    expect(() => assertSafeBranchName('a; rm -rf /')).toThrow()
  })
})
