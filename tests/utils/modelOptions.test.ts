import { describe, expect, it } from 'vitest'
import {
  buildModelOptions,
  findOptionForSelection,
  getSelectionKey,
  groupModelOptions,
} from '~/utils/modelOptions'
import type { AIProviderMetadata } from '~/types/aiProvider'

function provider(
  id: string,
  name: string,
  models: Array<{ key: string; label: string }>,
  capabilities: { streaming: boolean; permissions: boolean } = { streaming: true, permissions: true },
): AIProviderMetadata {
  return { id, name, models, capabilities } as AIProviderMetadata
}

describe('getSelectionKey', () => {
  it('joins providerId and modelKey with a double colon', () => {
    expect(getSelectionKey({ providerId: 'claude', modelKey: 'sonnet' })).toBe('claude::sonnet')
  })
})

describe('buildModelOptions', () => {
  const claude = provider('claude', 'Claude', [
    { key: 'sonnet', label: 'Sonnet' },
    { key: 'opus', label: 'Opus' },
  ])
  const codex = provider('codex', 'Codex', [
    { key: 'gpt4', label: 'GPT-4' },
  ])

  it('returns flattened options for all providers', () => {
    const options = buildModelOptions([claude, codex], false)
    expect(options).toHaveLength(3)
    expect(options.map((o) => o.key).sort()).toEqual(['claude::opus', 'claude::sonnet', 'codex::gpt4'])
  })

  it('sorts by model label (case-insensitive) then provider name', () => {
    const options = buildModelOptions([claude, codex], false)
    expect(options.map((o) => o.modelLabel)).toEqual(['GPT-4', 'Opus', 'Sonnet'])
  })

  it('marks options incompatible when streaming is unsupported', () => {
    const noStream = provider('x', 'X', [{ key: 'm', label: 'M' }], { streaming: false, permissions: true })
    const [option] = buildModelOptions([noStream], false)
    expect(option.compatible).toBe(false)
  })

  it('marks options incompatible when permissions are required but unsupported', () => {
    const noPerm = provider('y', 'Y', [{ key: 'n', label: 'N' }], { streaming: true, permissions: false })
    const [withoutPerm] = buildModelOptions([noPerm], true)
    const [withPerm] = buildModelOptions([noPerm], false)
    expect(withoutPerm.compatible).toBe(false)
    expect(withPerm.compatible).toBe(true)
  })

  it('disambiguates identically-labelled models across providers', () => {
    const a = provider('a', 'A', [{ key: 'x', label: 'Duplicate' }])
    const b = provider('b', 'B', [{ key: 'y', label: 'Duplicate' }])
    const options = buildModelOptions([a, b], false)
    expect(options[0].label).toBe('Duplicate · A')
    expect(options[1].label).toBe('Duplicate · B')
  })

  it('uses bare model label when not duplicated', () => {
    const a = provider('a', 'A', [{ key: 'x', label: 'Unique' }])
    const [option] = buildModelOptions([a], false)
    expect(option.label).toBe('Unique')
  })

  it('returns empty array for no providers', () => {
    expect(buildModelOptions([], false)).toEqual([])
  })
})

describe('groupModelOptions', () => {
  it('groups options by providerId', () => {
    const claude = provider('claude', 'Claude', [
      { key: 'sonnet', label: 'Sonnet' },
      { key: 'opus', label: 'Opus' },
    ])
    const codex = provider('codex', 'Codex', [{ key: 'gpt', label: 'GPT' }])
    const options = buildModelOptions([claude, codex], false)
    const groups = groupModelOptions(options)
    expect(groups).toHaveLength(2)
    const claudeGroup = groups.find((g) => g.providerId === 'claude')!
    expect(claudeGroup.options.map((o) => o.modelKey).sort()).toEqual(['opus', 'sonnet'])
  })

  it('pins codex first, then claude, then others alphabetically', () => {
    const codex = provider('codex', 'Codex', [{ key: 'c', label: 'C' }])
    const claude = provider('claude', 'Claude', [{ key: 'a', label: 'A' }])
    const zebra = provider('z', 'Zebra', [{ key: 'z', label: 'Z' }])
    const acorn = provider('a', 'Acorn', [{ key: 'a2', label: 'A2' }])
    const options = buildModelOptions([zebra, claude, acorn, codex], false)
    const groups = groupModelOptions(options)
    expect(groups.map((g) => g.providerId)).toEqual(['codex', 'claude', 'a', 'z'])
  })
})

describe('findOptionForSelection', () => {
  const options = buildModelOptions(
    [provider('claude', 'Claude', [{ key: 'sonnet', label: 'Sonnet' }])],
    false,
  )

  it('returns the matching option', () => {
    const match = findOptionForSelection(options, { providerId: 'claude', modelKey: 'sonnet' })
    expect(match?.key).toBe('claude::sonnet')
  })

  it('returns null when selection does not match any option', () => {
    expect(findOptionForSelection(options, { providerId: 'x', modelKey: 'y' })).toBeNull()
  })
})
