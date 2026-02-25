import { describe, expect, it } from 'vitest'
import { normalizeSettings } from '~/utils/settings'
import { DEFAULT_MODEL_KEY } from '~/types/aiProvider'
import { CLAUDE_MODELS } from '~/types/claude'

describe('settings utils', () => {
  it('normalizes provider settings with defaults', () => {
    expect(normalizeSettings({ providerId: 'codex' })).toMatchObject({
      providerId: 'codex',
      providerModelKey: DEFAULT_MODEL_KEY,
    })
  })

  it('supports claudeModel fallback when providerModelKey is missing', () => {
    const claude = CLAUDE_MODELS[0].value
    expect(normalizeSettings({ providerId: 'claude', claudeModel: claude })).toMatchObject({
      providerId: 'claude',
      providerModelKey: claude,
    })
  })

  it('normalizes other optional values with validation', () => {
    expect(normalizeSettings({
      theme: 'light',
      permissionMode: 'auto',
      autoGenerateCommitMessages: true,
    })).toMatchObject({
      theme: 'light',
      permissionMode: 'auto',
      autoGenerateCommitMessages: true,
    })
    expect(normalizeSettings({ theme: 'blue', permissionMode: 'invalid' })).toEqual({})
  })
})
