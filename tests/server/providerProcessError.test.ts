import { describe, expect, it } from 'vitest'
import { summarizeProviderProcessError } from '~/server/utils/providerProcessError'

describe('summarizeProviderProcessError', () => {
  it('returns codex permission guidance when codex home is not writable', () => {
    const summary = summarizeProviderProcessError([
      'failed to create session: Permission denied',
    ])

    expect(summary).toContain('failed to create session: Permission denied')
    expect(summary).toContain('sudo chown -R $(whoami) ~/.codex')
  })

  it('returns codex rollout path guidance for broken resume state', () => {
    const summary = summarizeProviderProcessError([
      'state db missing rollout path for thread abc123',
    ])

    expect(summary).toContain('state db missing rollout path for thread')
    expect(summary).toContain('Retry with a fresh session')
  })

  it('returns provider-agnostic auth guidance for claude auth failures', () => {
    const summary = summarizeProviderProcessError([
      'Claude API request failed: Unauthorized (401)',
    ])

    expect(summary).toContain('Unauthorized')
    expect(summary).toContain('claude login')
  })

  it('returns actionable generic lines when no known hint pattern matches', () => {
    const summary = summarizeProviderProcessError([
      'spawn claude ENOENT',
      'Error: command failed',
      'socket hang up',
    ])

    expect(summary).toContain('spawn claude ENOENT')
    expect(summary).toContain('Error: command failed')
  })
})
