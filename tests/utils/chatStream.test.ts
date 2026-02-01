import { describe, expect, it } from 'vitest'
import {
  buildStreamOptsFromConversation,
  createRequestId,
  createSessionId,
  formatToolInputSummary,
  isSpeckitResetCommand,
  parsePermissionRequestFromText,
} from '~/utils/chatStream'

describe('chatStream utils', () => {
  it('detects speckit reset commands', () => {
    expect(isSpeckitResetCommand('/speckit.plan 123')).toBe(true)
    expect(isSpeckitResetCommand('/speckit.unknown 123')).toBe(false)
  })

  it('builds deterministic ids via injected generators', () => {
    const req = createRequestId(() => 1700000000000, () => 0.123456)
    expect(req).toMatch(/^req-1700000000000-/)
    expect(createSessionId(() => 1700000000000)).toBe('session-1700000000000')
  })

  it('builds stream opts with optional worktree gating', () => {
    const conv = { hasWorktree: true, worktreePath: '/tmp/wt', worktreeBranch: 'feat', featureId: '018-test' }
    expect(buildStreamOptsFromConversation(conv, true)).toEqual({
      cwd: '/tmp/wt',
      worktreeBranch: 'feat',
      featureId: '018-test',
    })
    expect(buildStreamOptsFromConversation({ hasWorktree: false, worktreePath: '/tmp/wt' }, true)).toBeUndefined()
  })

  it('formats tool input summary with key priority and fallback', () => {
    expect(formatToolInputSummary({ file_path: '/tmp/a.txt', path: '/tmp/b.txt' })).toBe('/tmp/a.txt')
    expect(formatToolInputSummary({ path: '/tmp/b.txt' })).toBe('/tmp/b.txt')
    expect(formatToolInputSummary({ command: 'x'.repeat(80) })).toBe('x'.repeat(50))
    expect(formatToolInputSummary({ pattern: 'needle' })).toBe('needle')
    expect(formatToolInputSummary({ other: 'short value' })).toBe('short value')
    expect(formatToolInputSummary({ other: 'x'.repeat(120), value: 123 })).toBe('')
  })

  it('parses permission text for write/read/bash and unknown', () => {
    expect(parsePermissionRequestFromText('Need to write to /tmp/file.txt?')).toMatchObject({
      tool: 'Write',
      filePath: '/tmp/file.txt',
    })
    expect(parsePermissionRequestFromText('Can we read /etc/hosts now?')).toMatchObject({
      tool: 'Read',
      filePath: '/etc/hosts',
    })
    expect(parsePermissionRequestFromText('Please run ls -la, thanks')).toMatchObject({
      tool: 'Bash',
      command: 'ls -la',
    })
    expect(parsePermissionRequestFromText('Permission requested for tool', 'MyTool')).toMatchObject({
      tool: 'MyTool',
    })
  })
})
