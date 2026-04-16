import { describe, expect, it } from 'vitest'
import {
  buildQueuedMessage,
  createQueuedMessageId,
  removeFromQueue,
} from '~/utils/messageQueue'

describe('createQueuedMessageId', () => {
  it('produces a stable id for injected clock/rng', () => {
    const id = createQueuedMessageId(() => 1700000000000, () => 0.1)
    expect(id).toMatch(/^q-1700000000000-/)
  })

  it('produces distinct ids when rng changes', () => {
    expect(createQueuedMessageId(() => 1, () => 0.1)).not.toBe(
      createQueuedMessageId(() => 1, () => 0.9),
    )
  })
})

describe('buildQueuedMessage', () => {
  it('returns null when both text and attachments are empty', () => {
    expect(buildQueuedMessage({ text: '', attachments: [] })).toBeNull()
    expect(buildQueuedMessage({ text: '   ', attachments: [] })).toBeNull()
  })

  it('trims the text', () => {
    const msg = buildQueuedMessage({ text: '  hello  ', attachments: [] }, () => 'qid')
    expect(msg?.text).toBe('hello')
  })

  it('accepts text-only drafts', () => {
    const msg = buildQueuedMessage({ text: 'hi', attachments: [] }, () => 'qid')
    expect(msg).toEqual({ id: 'qid', text: 'hi', attachments: [] })
  })

  it('accepts attachment-only drafts', () => {
    const att = { id: 'a1', name: 'x.png', mimeType: 'image/png', size: 1, dataUrl: 'd' } as any
    const msg = buildQueuedMessage({ text: '', attachments: [att] }, () => 'qid')
    expect(msg).toEqual({ id: 'qid', text: '', attachments: [att] })
  })

  it('copies attachments into a new array (callers can mutate source)', () => {
    const source: any[] = [{ id: 'a1' }]
    const msg = buildQueuedMessage({ text: 'x', attachments: source }, () => 'qid')
    source.push({ id: 'a2' })
    expect(msg?.attachments).toHaveLength(1)
  })
})

describe('removeFromQueue', () => {
  const queue = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('removes the matching entry and returns a new array', () => {
    const result = removeFromQueue(queue, 'b')
    expect(result.map((q) => q.id)).toEqual(['a', 'c'])
    expect(result).not.toBe(queue)
  })

  it('returns a copy with no changes when id is absent', () => {
    const result = removeFromQueue(queue, 'missing')
    expect(result.map((q) => q.id)).toEqual(['a', 'b', 'c'])
  })

  it('handles empty queue', () => {
    expect(removeFromQueue([], 'x')).toEqual([])
  })
})
