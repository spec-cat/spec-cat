import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIProvider } from '~/server/utils/aiProvider'
import type { UIStreamEvent } from '~/types/chat'

const registryState = vi.hoisted(() => ({
  provider: null as AIProvider | null,
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
    toCanonicalEvents(data) {
      return [data as UIStreamEvent]
    },
    streamChat(_opts, callbacks) {
      callbacks.onProviderJson({
        type: 'block_start',
        blockId: 'blk-1',
        blockType: 'text',
        text: 'resolved ',
      } as UIStreamEvent)
      callbacks.onProviderJson({
        type: 'block_delta',
        blockId: 'blk-1',
        text: 'content',
      } as UIStreamEvent)
      callbacks.onClose({
        exitCode: 0,
        signal: null,
        nonJsonOutput: [],
      })
      return {
        kill: vi.fn(),
      }
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
  })

  it('runs against the selected provider and collects text output', async () => {
    const captured: Array<Record<string, unknown>> = []
    registryState.provider = makeProvider({
      streamChat(opts, callbacks) {
        captured.push({
          providerId: opts.selection.providerId,
          modelKey: opts.selection.modelKey,
          permissionMode: opts.permissionMode,
          ephemeral: opts.ephemeral,
        })
        callbacks.onProviderJson({
          type: 'block_start',
          blockId: 'blk-1',
          blockType: 'text',
          text: 'resolved ',
        } as UIStreamEvent)
        callbacks.onProviderJson({
          type: 'block_delta',
          blockId: 'blk-1',
          text: 'content',
        } as UIStreamEvent)
        callbacks.onClose({
          exitCode: 0,
          signal: null,
          nonJsonOutput: [],
        })
        return {
          kill: vi.fn(),
        }
      },
    })

    const result = await runProviderOneShot({
      selection: { providerId: 'codex', modelKey: 'gpt-5.4' },
      prompt: 'resolve this conflict',
      cwd: '/tmp/worktree',
      capability: 'conflictResolution',
    })

    expect(result).toEqual({
      success: true,
      text: 'resolved content',
    })
    expect(captured).toEqual([
      {
        providerId: 'codex',
        modelKey: 'gpt-5.4',
        permissionMode: 'bypass',
        ephemeral: true,
      },
    ])
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
  })
})
