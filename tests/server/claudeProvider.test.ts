import { describe, expect, it } from 'vitest'
import { buildClaudeExecArgs } from '~/server/utils/claudeProvider'
import type { AIProviderStreamOptions } from '~/server/utils/aiProvider'

function makeOpts(overrides: Partial<AIProviderStreamOptions> = {}): AIProviderStreamOptions {
  return {
    message: 'hello',
    selection: { providerId: 'claude', modelKey: 'sonnet' },
    cwd: '/tmp',
    ...overrides,
  }
}

describe('buildClaudeExecArgs', () => {
  it('does not include --plan in plan mode', () => {
    const args = buildClaudeExecArgs(makeOpts({ permissionMode: 'plan' }), 'claude-sonnet-4-20250514')
    expect(args).not.toContain('--plan')
  })

  it('keeps ask/plan compatible with approved tools', () => {
    const askArgs = buildClaudeExecArgs(makeOpts({
      permissionMode: 'ask',
      approvedTools: ['Read', 'Bash'],
    }), 'claude-sonnet-4-20250514')
    const planArgs = buildClaudeExecArgs(makeOpts({
      permissionMode: 'plan',
      approvedTools: ['Read', 'Bash'],
    }), 'claude-sonnet-4-20250514')

    expect(askArgs).toContain('--allowedTools')
    expect(askArgs).toContain('Read,Bash')
    expect(planArgs).toContain('--allowedTools')
    expect(planArgs).toContain('Read,Bash')
  })

  it('uses automation flags for auto and bypass modes', () => {
    const autoArgs = buildClaudeExecArgs(makeOpts({ permissionMode: 'auto' }), 'claude-sonnet-4-20250514')
    const bypassArgs = buildClaudeExecArgs(makeOpts({ permissionMode: 'bypass' }), 'claude-sonnet-4-20250514')

    expect(autoArgs).toContain('--allowedTools')
    expect(autoArgs).toContain('Read,Glob,Grep,Edit,Write,Bash,WebFetch,WebSearch')
    expect(bypassArgs).toContain('--dangerously-skip-permissions')
  })
})
