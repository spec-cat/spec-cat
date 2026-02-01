import { describe, expect, it } from 'vitest'
import { parseWorktreePorcelain } from '~/server/utils/worktreeResolver'

describe('worktreeResolver', () => {
  it('parses porcelain output into worktree records', () => {
    const stdout = [
      'worktree /repo',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /tmp/feat',
      'HEAD def456',
      'branch refs/heads/018-feature',
      '',
      'worktree /tmp/detached',
      'HEAD feedbeef',
      'detached',
      '',
    ].join('\n')

    expect(parseWorktreePorcelain(stdout)).toEqual([
      { path: '/repo', head: 'abc123', branch: 'main' },
      { path: '/tmp/feat', head: 'def456', branch: '018-feature' },
      { path: '/tmp/detached', head: 'feedbeef', branch: null },
    ])
  })
})
