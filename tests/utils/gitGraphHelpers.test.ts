import { describe, expect, it } from 'vitest'
import {
  extractGitErrorMessage,
  filterCommitsByBranches,
  filterCommitsByQuery,
  normalizeFileStatusKey,
} from '~/utils/gitGraphHelpers'
import type { GitLogCommit } from '~/types/git'

const commit = (overrides: Partial<GitLogCommit>): GitLogCommit => ({
  hash: 'abcdef1234567890',
  shortHash: 'abcdef1',
  author: 'Alice',
  email: 'alice@example.com',
  timestamp: 1,
  message: 'initial commit',
  parents: [],
  branches: ['main'],
  tags: [],
  ...overrides,
})

describe('gitGraphHelpers', () => {
  it('normalizes file status key with fallback', () => {
    expect(normalizeFileStatusKey('a')).toBe('A')
    expect(normalizeFileStatusKey('unknown')).toBe('U')
    expect(normalizeFileStatusKey('zeta')).toBe('M')
  })

  it('extracts git error message by priority', () => {
    expect(extractGitErrorMessage({ data: { message: 'from-data' } }, 'fallback')).toBe('from-data')
    expect(extractGitErrorMessage({ statusMessage: 'from-status' }, 'fallback')).toBe('from-status')
    expect(extractGitErrorMessage({ message: 'from-message' }, 'fallback')).toBe('from-message')
    expect(extractGitErrorMessage({}, 'fallback')).toBe('fallback')
  })

  it('filters commits by query across message/author/refs', () => {
    const commits = [
      commit({ hash: '1', shortHash: '1111111', message: 'fix parser', author: 'Alice', branches: ['main'], tags: [] }),
      commit({ hash: '2', shortHash: '2222222', message: 'docs', author: 'Bob', branches: ['feature/x'], tags: ['v1.0.0'] }),
    ]

    expect(filterCommitsByQuery(commits, 'parser')).toHaveLength(1)
    expect(filterCommitsByQuery(commits, 'feature/x')).toHaveLength(1)
    expect(filterCommitsByQuery(commits, 'v1.0.0')).toHaveLength(1)
  })

  it('filters commits by selected branches', () => {
    const commits = [
      commit({ hash: '1', branches: ['main'] }),
      commit({ hash: '2', branches: ['feature/a'] }),
    ]

    const filtered = filterCommitsByBranches(commits, new Set(['feature/a']))
    expect(filtered.map((c) => c.hash)).toEqual(['2'])
  })
})
