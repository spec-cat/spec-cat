import { describe, expect, it } from 'vitest'
import { buildCodexExecArgs } from '~/server/utils/codexProvider'
import type { AIProviderStreamOptions } from '~/server/utils/aiProvider'

function makeOpts(overrides: Partial<AIProviderStreamOptions> = {}): AIProviderStreamOptions {
  return {
    message: 'hello',
    selection: { providerId: 'codex', modelKey: 'gpt-5.3-codex' },
    cwd: '/tmp',
    ...overrides,
  }
}

describe('buildCodexExecArgs', () => {
  it('builds a standard exec invocation for new sessions', () => {
    const args = buildCodexExecArgs(makeOpts())
    expect(args).toEqual([
      'exec',
      '--json',
      '--model',
      'gpt-5.3-codex',
      '--sandbox',
      'workspace-write',
      '-',
    ])
  })

  it('builds resume invocation with resume subcommand before options', () => {
    const args = buildCodexExecArgs(makeOpts({
      resumeSessionId: 'thread-123',
      message: 'follow-up',
    }))
    expect(args).toEqual([
      'exec',
      'resume',
      '--json',
      '--model',
      'gpt-5.3-codex',
      '--sandbox',
      'workspace-write',
      'thread-123',
      '-',
    ])
  })

  it('uses writable sandbox flags for ask/plan modes', () => {
    const askArgs = buildCodexExecArgs(makeOpts({ permissionMode: 'ask' }))
    const planArgs = buildCodexExecArgs(makeOpts({ permissionMode: 'plan' }))

    expect(askArgs).toContain('--sandbox')
    expect(askArgs).toContain('workspace-write')
    expect(askArgs).not.toContain('--ask-for-approval')

    expect(planArgs).toContain('--sandbox')
    expect(planArgs).toContain('workspace-write')
    expect(planArgs).not.toContain('--ask-for-approval')
  })

  it('uses codex automation flags for auto and bypass modes', () => {
    const autoArgs = buildCodexExecArgs(makeOpts({ permissionMode: 'auto' }))
    const bypassArgs = buildCodexExecArgs(makeOpts({ permissionMode: 'bypass' }))

    expect(autoArgs).toContain('--full-auto')
    expect(bypassArgs).toContain('--dangerously-bypass-approvals-and-sandbox')
  })

  it('inlines system prompt into the prompt payload when provided', () => {
    const args = buildCodexExecArgs(makeOpts({
      systemPrompt: 'Read specs/018/spec.md first.',
      message: 'implement the task',
    }))

    expect(args.at(-1)).toBe('-')
  })
})
