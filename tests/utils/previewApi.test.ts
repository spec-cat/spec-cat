import { describe, expect, it } from 'vitest'
import { decidePreviewToggle } from '~/utils/previewApi'

describe('decidePreviewToggle', () => {
  it('returns end-current when toggling the already-active conversation', () => {
    expect(decidePreviewToggle('a', 'a')).toEqual({ kind: 'end-current', id: 'a' })
  })

  it('returns swap when a different conversation is previewing', () => {
    expect(decidePreviewToggle('a', 'b')).toEqual({ kind: 'swap', endId: 'a', startId: 'b' })
  })

  it('returns start when nothing is currently previewing', () => {
    expect(decidePreviewToggle(null, 'a')).toEqual({ kind: 'start', id: 'a' })
  })
})
