import { describe, expect, it } from 'vitest'
import {
  buildCloseReason,
  buildStreamOptsFromConversation,
  createRequestId,
  createSessionId,
  extractProviderSessionId,
  formatToolInputSummary,
  isSpeckitResetCommand,
  parsePermissionRequestFromText,
  summarizeCloseCode,
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

describe('summarizeCloseCode', () => {
  it.each([
    [1000, 'Normal closure'],
    [1001, 'Endpoint is going away (server shutdown or page navigation)'],
    [1002, 'Protocol error'],
    [1003, 'Unsupported data'],
    [1005, 'No status code received from peer (close frame had no code)'],
    [1006, 'Abnormal closure (connection dropped without close frame)'],
    [1007, 'Invalid payload data'],
    [1008, 'Policy violation'],
    [1009, 'Message too big'],
    [1010, 'Missing required extension'],
    [1011, 'Internal server error'],
    [1012, 'Service restart'],
    [1013, 'Try again later (temporary overload)'],
    [1015, 'TLS handshake failure'],
  ])('maps standard code %i to a descriptive label', (code, expected) => {
    expect(summarizeCloseCode(code)).toBe(expected)
  })

  it('labels 4000-4999 as application-specific', () => {
    expect(summarizeCloseCode(4000)).toBe('Application-specific close code')
    expect(summarizeCloseCode(4500)).toBe('Application-specific close code')
    expect(summarizeCloseCode(4999)).toBe('Application-specific close code')
  })

  it('returns unknown for codes outside known ranges', () => {
    expect(summarizeCloseCode(0)).toBe('Unknown close code')
    expect(summarizeCloseCode(3000)).toBe('Unknown close code')
    expect(summarizeCloseCode(5000)).toBe('Unknown close code')
    expect(summarizeCloseCode(1014)).toBe('Unknown close code') // not defined
  })
})

describe('buildCloseReason', () => {
  it('uses event.reason when provided', () => {
    const result = buildCloseReason({ code: 1000, reason: 'Client logout', wasClean: true })
    expect(result).toContain('Client logout')
    expect(result).not.toContain('Normal closure')
  })

  it('falls back to summarized close code when reason is missing', () => {
    const result = buildCloseReason({ code: 1006, wasClean: false })
    expect(result).toContain('Abnormal closure')
  })

  it('falls back to summarized close code when reason is empty string', () => {
    const result = buildCloseReason({ code: 1000, reason: '', wasClean: true })
    expect(result).toContain('Normal closure')
  })

  it('appends last server error when present', () => {
    const result = buildCloseReason(
      { code: 1011, wasClean: false },
      { lastServerError: 'Database unavailable' }
    )
    expect(result).toContain('Last server error: Database unavailable')
  })

  it('appends last socket error when server error is absent', () => {
    const result = buildCloseReason(
      { code: 1006, wasClean: false },
      { lastSocketError: 'ECONNRESET' }
    )
    expect(result).toContain('Last socket error: ECONNRESET')
  })

  it('prefers server error over socket error', () => {
    const result = buildCloseReason(
      { code: 1011, wasClean: false },
      { lastServerError: 'server', lastSocketError: 'socket' }
    )
    expect(result).toContain('Last server error: server')
    expect(result).not.toContain('Last socket error')
  })

  it('includes wasClean status', () => {
    expect(buildCloseReason({ code: 1000, wasClean: true })).toContain('wasClean: yes')
    expect(buildCloseReason({ code: 1006, wasClean: false })).toContain('wasClean: no')
  })

  it('joins parts with pipe separator', () => {
    const result = buildCloseReason(
      { code: 1000, reason: 'bye', wasClean: true },
      { lastServerError: 'err' }
    )
    expect(result).toBe('bye | Last server error: err | wasClean: yes')
  })
})

describe('extractProviderSessionId', () => {
  it('returns null for non-object inputs', () => {
    expect(extractProviderSessionId(null)).toBeNull()
    expect(extractProviderSessionId(undefined)).toBeNull()
    expect(extractProviderSessionId('string')).toBeNull()
    expect(extractProviderSessionId(42)).toBeNull()
  })

  it('extracts session_id from top level', () => {
    expect(extractProviderSessionId({ session_id: 'abc' })).toBe('abc')
  })

  it('extracts various camelCase and snake_case keys', () => {
    expect(extractProviderSessionId({ sessionId: 'a' })).toBe('a')
    expect(extractProviderSessionId({ conversation_id: 'b' })).toBe('b')
    expect(extractProviderSessionId({ conversationId: 'c' })).toBe('c')
    expect(extractProviderSessionId({ thread_id: 'd' })).toBe('d')
    expect(extractProviderSessionId({ threadId: 'e' })).toBe('e')
  })

  it('prefers earlier keys in lookup order', () => {
    // session_id before sessionId in lookup order
    expect(extractProviderSessionId({ sessionId: 'b', session_id: 'a' })).toBe('a')
  })

  it('extracts from nested response object', () => {
    expect(extractProviderSessionId({ response: { session_id: 'nested' } })).toBe('nested')
  })

  it('ignores non-string session id values', () => {
    expect(extractProviderSessionId({ session_id: 123 })).toBeNull()
    expect(extractProviderSessionId({ session_id: null })).toBeNull()
  })

  it('ignores empty string session id', () => {
    expect(extractProviderSessionId({ session_id: '' })).toBeNull()
  })

  it('does not descend into array response', () => {
    expect(extractProviderSessionId({ response: [{ session_id: 'a' }] })).toBeNull()
  })

  it('returns null when no known keys are present', () => {
    expect(extractProviderSessionId({ foo: 'bar' })).toBeNull()
    expect(extractProviderSessionId({})).toBeNull()
  })
})
