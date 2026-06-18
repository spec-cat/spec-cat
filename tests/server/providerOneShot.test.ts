import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIProvider } from '~/server/utils/aiProvider'

const registryState = vi.hoisted(() => ({
  provider: null as AIProvider | null,
}))

const interactiveState = vi.hoisted(() => ({
  query: vi.fn(),
}))

vi.mock('~/server/utils/aiProviderRegistry', () => ({
  ensureProvidersInitialized: vi.fn(async () => {}),
  getProvider: vi.fn((providerId: string) => {
    if (registryState.provider?.metadata.id === providerId) {
      return registryState.provider
    }
    return undefined
  }),
}))

vi.mock('~/server/utils/interactiveProviderQuery', () => ({
  queryInteractiveProvider: interactiveState.query,
}))

import { runProviderOneShot } from '~/server/utils/providerOneShot'

function makeProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  const base: AIProvider = {
    metadata: {
      id: 'codex',
      name: 'Codex',
      description: 'mock',
      models: [
        {
          key: 'gpt-5.4',
          label: 'gpt-5.4',
          description: 'mock',
          default: true,
        },
      ],
      capabilities: {
        streaming: true,
        permissions: true,
        resume: true,
        autoCommit: true,
        conflictResolution: true,
      },
    },
    isModelSupported(modelKey: string) {
      return modelKey === 'gpt-5.4'
    },
  }

  return {
    ...base,
    ...overrides,
    metadata: {
      ...base.metadata,
      ...overrides.metadata,
      capabilities: {
        ...base.metadata.capabilities,
        ...overrides.metadata?.capabilities,
      },
      models: overrides.metadata?.models ?? base.metadata.models,
    },
  }
}

describe('runProviderOneShot', () => {
  beforeEach(() => {
    registryState.provider = null
    interactiveState.query.mockReset()
  })

  it('runs the prompt through the interactive PTY session and returns its text', async () => {
    registryState.provider = makeProvider()
    interactiveState.query.mockResolvedValue({ success: true, text: 'resolved content' })

    const result = await runProviderOneShot({
      selection: { providerId: 'codex', modelKey: 'gpt-5.4' },
      prompt: 'resolve this conflict',
      cwd: '/tmp/worktree',
      capability: 'conflictResolution',
    })

    expect(result).toEqual({ success: true, text: 'resolved content' })
    expect(interactiveState.query).toHaveBeenCalledTimes(1)
    expect(interactiveState.query).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'codex',
        modelKey: 'gpt-5.4',
        cwd: '/tmp/worktree',
        prompt: 'resolve this conflict',
        bracketedPaste: true,
        cleanChrome: false,
      }),
    )
  })

  it('fails explicitly when the selected provider lacks conflict resolution capability', async () => {
    registryState.provider = makeProvider({
      metadata: {
        id: 'codex',
        name: 'Codex',
        description: 'mock',
        models: [
          {
            key: 'gpt-5.4',
            label: 'gpt-5.4',
            description: 'mock',
            default: true,
          },
        ],
        capabilities: {
          streaming: true,
          permissions: true,
          resume: true,
          autoCommit: true,
          conflictResolution: false,
        },
      },
    })

    const result = await runProviderOneShot({
      selection: { providerId: 'codex', modelKey: 'gpt-5.4' },
      prompt: 'resolve this conflict',
      cwd: '/tmp/worktree',
      capability: 'conflictResolution',
    })

    expect(result).toEqual({
      success: false,
      error: 'Provider "codex" does not support AI conflict resolution.',
    })
    expect(interactiveState.query).not.toHaveBeenCalled()
  })
})
