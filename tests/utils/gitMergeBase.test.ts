import { describe, expect, it } from 'vitest'
import { buildMergeBaseMap } from '~/utils/gitMergeBase'

describe('buildMergeBaseMap', () => {
  it('returns empty map when no entries given', () => {
    expect(buildMergeBaseMap([])).toEqual({})
  })

  it('maps branch → mergeBase for populated entries', () => {
    const map = buildMergeBaseMap([
      { branch: 'feature/x', mergeBase: 'abc123' },
      { branch: 'main', mergeBase: 'def456' },
    ])
    expect(map).toEqual({ 'feature/x': 'abc123', main: 'def456' })
  })

  it('skips entries with null branch', () => {
    const map = buildMergeBaseMap([
      { branch: null, mergeBase: 'abc' },
      { branch: 'keep', mergeBase: 'xyz' },
    ])
    expect(map).toEqual({ keep: 'xyz' })
  })

  it('skips entries with null mergeBase', () => {
    const map = buildMergeBaseMap([
      { branch: 'drop', mergeBase: null },
      { branch: 'keep', mergeBase: 'xyz' },
    ])
    expect(map).toEqual({ keep: 'xyz' })
  })

  it('later entries override earlier entries for the same branch', () => {
    const map = buildMergeBaseMap([
      { branch: 'main', mergeBase: 'old' },
      { branch: 'main', mergeBase: 'new' },
    ])
    expect(map).toEqual({ main: 'new' })
  })
})
