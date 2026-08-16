import { describe, expect, test } from 'bun:test'
import { decideBranchFollow, managedSessionBranch } from '../server/utils/branch-follow'
import { isDeletableSessionBranch, sessionWorktreeBranch } from '../server/utils/worktree'

const SESSION_ID = 'abc12345'
const MANAGED = managedSessionBranch(SESSION_ID)

function decide(overrides: Partial<Parameters<typeof decideBranchFollow>[0]> = {}) {
  return decideBranchFollow({
    sessionId: SESSION_ID,
    storedBranch: MANAGED,
    currentBranch: MANAGED,
    baseBranch: 'main',
    ...overrides
  })
}

describe('decideBranchFollow', () => {
  test('adopts the feature branch a speckit step checked out', () => {
    const decision = decide({ currentBranch: '042-spec-browser' })
    expect(decision).toEqual({ follow: true, dropPrevious: true, reason: 'follow' })
  })

  test('does nothing while the branch is unchanged', () => {
    expect(decide().reason).toBe('unchanged')
    expect(decide().follow).toBe(false)
  })

  test('ignores a detached HEAD so a rebase never erases the branch', () => {
    const decision = decide({ currentBranch: '' })
    expect(decision).toEqual({ follow: false, dropPrevious: false, reason: 'detached' })
  })

  test('refuses to adopt a protected trunk', () => {
    for (const branch of ['main', 'master', 'develop', 'dev']) {
      expect(decide({ currentBranch: branch }).follow).toBe(false)
    }
    expect(decide({ currentBranch: 'main' }).reason).toBe('protected')
  })

  test('refuses to adopt the conversation base branch', () => {
    const decision = decide({ currentBranch: 'release-2024', baseBranch: 'release-2024' })
    expect(decision).toEqual({ follow: false, dropPrevious: false, reason: 'base' })
  })

  test('refuses to adopt the shared preview branch', () => {
    const decision = decide({ currentBranch: 'sc/preview', previewBranch: 'sc/preview' })
    expect(decision.reason).toBe('preview')
  })

  test('keeps a branch the conversation did not generate', () => {
    // Second switch: the conversation already moved off sc/<id> onto 042-*, so
    // 042-* holds real work and must survive the move to 043-*.
    const decision = decide({ storedBranch: '042-spec-browser', currentBranch: '043-next' })
    expect(decision).toEqual({ follow: true, dropPrevious: false, reason: 'follow' })
  })

  test('drops nothing when there was no stored branch', () => {
    expect(decide({ storedBranch: '', currentBranch: '042-x' }).dropPrevious).toBe(false)
  })
})

describe('isDeletableSessionBranch', () => {
  test('accepts the provisioned sc/<id> branch', () => {
    expect(isDeletableSessionBranch(MANAGED)).toBe(true)
  })

  test('accepts a followed feature branch', () => {
    expect(isDeletableSessionBranch('042-spec-browser')).toBe(true)
    expect(isDeletableSessionBranch('feature/042-spec-browser')).toBe(true)
  })

  test('rejects protected trunks', () => {
    for (const branch of ['main', 'master', 'develop', 'dev', 'trunk', 'release']) {
      expect(isDeletableSessionBranch(branch)).toBe(false)
    }
  })

  test('rejects the shared preview branch and other sc/ refs', () => {
    expect(isDeletableSessionBranch('sc/preview')).toBe(false)
    expect(isDeletableSessionBranch('sc/short')).toBe(false)
  })

  test('rejects names git would treat as options or path traversal', () => {
    expect(isDeletableSessionBranch('-D')).toBe(false)
    expect(isDeletableSessionBranch('')).toBe(false)
    expect(isDeletableSessionBranch('a branch')).toBe(false)
  })
})

describe('sessionWorktreeBranch', () => {
  test('uses the spec name for a spec-created conversation', () => {
    expect(sessionWorktreeBranch(SESSION_ID, '042-spec-browser')).toBe('042-spec-browser')
  })

  test('keeps the managed sc branch for a regular conversation', () => {
    expect(sessionWorktreeBranch(SESSION_ID)).toBe(MANAGED)
  })

  test('rejects unsafe spec branch names', () => {
    expect(() => sessionWorktreeBranch(SESSION_ID, '-invalid')).toThrow()
    expect(() => sessionWorktreeBranch(SESSION_ID, 'feature/name')).toThrow()
    expect(() => sessionWorktreeBranch(SESSION_ID, 'main')).toThrow()
  })
})
