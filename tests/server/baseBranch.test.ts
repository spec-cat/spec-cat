import { beforeEach, describe, expect, it, vi } from 'vitest'

const { execGitCommand } = vi.hoisted(() => ({
  execGitCommand: vi.fn<(args: string[], cwd?: string) => Promise<string>>(),
}))

vi.mock('~/server/utils/gitExec', () => ({
  execGitCommand,
}))

import {
  resolveConversationBaseBranch,
  resolvePreferredBaseBranch,
} from '~/server/utils/baseBranch'

function mockGitResponses(responses: Record<string, string>) {
  execGitCommand.mockImplementation(async (args: string[]) => {
    const key = args.join(' ')
    if (!(key in responses)) {
      throw new Error(`Unexpected git command: ${key}`)
    }
    return responses[key]
  })
}

describe('baseBranch helpers', () => {
  beforeEach(() => {
    execGitCommand.mockReset()
  })

  it('prefers the current non-worktree branch when HEAD is attached', async () => {
    mockGitResponses({
      'rev-parse --abbrev-ref HEAD': 'release/1.2',
      'rev-parse --verify refs/heads/release/1.2^{commit}': 'abc123',
    })

    await expect(resolvePreferredBaseBranch('/repo')).resolves.toBe('release/1.2')
  })

  it('falls back to the default branch instead of returning a detached HEAD hash', async () => {
    const headHash = '0123456789abcdef0123456789abcdef01234567'
    mockGitResponses({
      'rev-parse --abbrev-ref HEAD': 'HEAD',
      'symbolic-ref refs/remotes/origin/HEAD': 'refs/remotes/origin/main',
      'rev-parse --verify refs/heads/main^{commit}': 'fedcba',
      'rev-parse HEAD': headHash,
      [`for-each-ref --format=%(refname:short) --points-at ${headHash} refs/heads`]: 'main\nrelease/1.0',
    })

    await expect(resolvePreferredBaseBranch('/repo')).resolves.toBe('main')
  })

  it('normalizes a stored base hash back to the matching branch name', async () => {
    const mergeBase = '89abcdef0123456789abcdef0123456789abcdef'
    mockGitResponses({
      'symbolic-ref refs/remotes/origin/HEAD': 'refs/remotes/origin/main',
      'rev-parse --verify refs/heads/main^{commit}': 'fedcba',
      'rev-parse --verify refs/heads/018-codex-provider-integration^{commit}': 'worktree-head',
      'for-each-ref --format=%(refname:short) refs/heads': 'main\nrelease/1.0\n018-codex-provider-integration\nsc/preview',
      'merge-base main 018-codex-provider-integration': mergeBase,
      'merge-base release/1.0 018-codex-provider-integration': '1111111111111111111111111111111111111111',
    })

    await expect(resolveConversationBaseBranch({
      cwd: '/repo',
      storedBaseBranch: mergeBase,
      worktreeBranch: '018-codex-provider-integration',
    })).resolves.toBe('main')
  })
})
