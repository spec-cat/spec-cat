import { describe, expect, it } from 'vitest'

import {
  getSelectableBaseBranchNameFromBranch,
  getSelectableBaseBranchLabel,
  isSelectableBaseBranchName,
  resolveSelectableBaseBranch,
} from '~/utils/baseBranchSelection'

describe('baseBranchSelection helpers', () => {
  it('accepts regular branch names and rejects hash-like targets', () => {
    expect(isSelectableBaseBranchName('main')).toBe(true)
    expect(isSelectableBaseBranchName('release/1.0')).toBe(true)
    expect(isSelectableBaseBranchName('sc/conv-123')).toBe(false)
    expect(isSelectableBaseBranchName('19dd6b935b45502ca71fb23915a05e420ea2e05c')).toBe(false)
  })

  it('prefers a valid requested branch when it is selectable', () => {
    expect(resolveSelectableBaseBranch('release/1.0', ['main', 'release/1.0'])).toBe('release/1.0')
  })

  it('falls back from hash-like targets to main when available', () => {
    expect(resolveSelectableBaseBranch(
      '19dd6b935b45502ca71fb23915a05e420ea2e05c',
      ['main', 'release/1.0'],
    )).toBe('main')
  })

  it('uses a neutral loading label for non-branch values', () => {
    expect(getSelectableBaseBranchLabel('19dd6b935b45502ca71fb23915a05e420ea2e05c')).toBe('Loading branches...')
    expect(getSelectableBaseBranchLabel('main')).toBe('main')
  })

  it('recovers a selectable branch name from malformed branch API payloads', () => {
    expect(getSelectableBaseBranchNameFromBranch({
      name: 'b2f09ba150c403b469b653c4b676113983f611af',
      ref: 'main',
    })).toBe('main')

    expect(getSelectableBaseBranchNameFromBranch({
      name: 'sc/preview',
      ref: 'refs/heads/sc/preview',
    })).toBe(null)

    expect(getSelectableBaseBranchNameFromBranch({
      name: 'main',
      ref: 'refs/heads/main',
    })).toBe('main')
  })
})
