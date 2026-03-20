import { describe, expect, it } from 'vitest'
import { normalizeImageAttachments } from '~/server/utils/jobQueue'

describe('normalizeImageAttachments', () => {
  // ── Invalid inputs ───────────────────────────────────

  it('returns empty array for undefined', () => {
    expect(normalizeImageAttachments(undefined)).toEqual([])
  })

  it('returns empty array for null', () => {
    expect(normalizeImageAttachments(null)).toEqual([])
  })

  it('returns empty array for non-array values', () => {
    expect(normalizeImageAttachments('string')).toEqual([])
    expect(normalizeImageAttachments(42)).toEqual([])
    expect(normalizeImageAttachments({})).toEqual([])
    expect(normalizeImageAttachments(true)).toEqual([])
  })

  it('returns empty array for empty array', () => {
    expect(normalizeImageAttachments([])).toEqual([])
  })

  // ── Valid attachments ────────────────────────────────

  it('normalizes a valid image attachment', () => {
    const input = [{
      id: 'img-1',
      name: 'screenshot.png',
      mimeType: 'image/png',
      size: 1024,
      dataUrl: 'data:image/png;base64,abc123',
    }]

    const result = normalizeImageAttachments(input)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'img-1',
      name: 'screenshot.png',
      mimeType: 'image/png',
      size: 1024,
      dataUrl: 'data:image/png;base64,abc123',
    })
  })

  it('normalizes multiple valid attachments', () => {
    const input = [
      { id: 'a', name: 'a.png', mimeType: 'image/png', size: 100, dataUrl: 'data:image/png;base64,a' },
      { id: 'b', name: 'b.jpg', mimeType: 'image/jpeg', size: 200, dataUrl: 'data:image/jpeg;base64,b' },
    ]

    const result = normalizeImageAttachments(input)
    expect(result).toHaveLength(2)
  })

  // ── Filtering invalid items ──────────────────────────

  it('filters out null and undefined items', () => {
    const input = [
      null,
      undefined,
      { id: 'valid', name: 'ok.png', mimeType: 'image/png', size: 100, dataUrl: 'data:image/png;base64,ok' },
    ]

    const result = normalizeImageAttachments(input)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('valid')
  })

  it('filters out items with missing id', () => {
    const input = [{
      name: 'no-id.png',
      mimeType: 'image/png',
      size: 100,
      dataUrl: 'data:image/png;base64,abc',
    }]

    const result = normalizeImageAttachments(input)
    expect(result).toHaveLength(0)
  })

  it('filters out items with non-image mimeType', () => {
    const input = [{
      id: 'doc-1',
      name: 'file.pdf',
      mimeType: 'application/pdf',
      size: 100,
      dataUrl: 'data:image/png;base64,abc',
    }]

    const result = normalizeImageAttachments(input)
    expect(result).toHaveLength(0)
  })

  it('filters out items with zero size', () => {
    const input = [{
      id: 'empty',
      name: 'empty.png',
      mimeType: 'image/png',
      size: 0,
      dataUrl: 'data:image/png;base64,abc',
    }]

    const result = normalizeImageAttachments(input)
    expect(result).toHaveLength(0)
  })

  it('filters out items with negative size', () => {
    const input = [{
      id: 'neg',
      name: 'neg.png',
      mimeType: 'image/png',
      size: -1,
      dataUrl: 'data:image/png;base64,abc',
    }]

    const result = normalizeImageAttachments(input)
    expect(result).toHaveLength(0)
  })

  it('filters out items exceeding 5MB size limit', () => {
    const input = [{
      id: 'big',
      name: 'big.png',
      mimeType: 'image/png',
      size: 5 * 1024 * 1024 + 1, // 5MB + 1 byte
      dataUrl: 'data:image/png;base64,abc',
    }]

    const result = normalizeImageAttachments(input)
    expect(result).toHaveLength(0)
  })

  it('accepts items at exactly 5MB size limit', () => {
    const input = [{
      id: 'exact',
      name: 'exact.png',
      mimeType: 'image/png',
      size: 5 * 1024 * 1024, // exactly 5MB
      dataUrl: 'data:image/png;base64,abc',
    }]

    const result = normalizeImageAttachments(input)
    expect(result).toHaveLength(1)
  })

  it('filters out items with non-data-url dataUrl', () => {
    const input = [{
      id: 'bad-url',
      name: 'bad.png',
      mimeType: 'image/png',
      size: 100,
      dataUrl: 'https://example.com/image.png',
    }]

    const result = normalizeImageAttachments(input)
    expect(result).toHaveLength(0)
  })

  it('filters out items with empty dataUrl', () => {
    const input = [{
      id: 'no-data',
      name: 'no-data.png',
      mimeType: 'image/png',
      size: 100,
      dataUrl: '',
    }]

    const result = normalizeImageAttachments(input)
    expect(result).toHaveLength(0)
  })

  // ── Max attachment count ─────────────────────────────

  it('limits to 4 attachments maximum', () => {
    const makeValid = (i: number) => ({
      id: `img-${i}`,
      name: `img-${i}.png`,
      mimeType: 'image/png',
      size: 100,
      dataUrl: `data:image/png;base64,data${i}`,
    })

    const input = Array.from({ length: 6 }, (_, i) => makeValid(i))
    const result = normalizeImageAttachments(input)

    expect(result).toHaveLength(4)
    expect(result.map(r => r.id)).toEqual(['img-0', 'img-1', 'img-2', 'img-3'])
  })

  // ── Default values for optional fields ───────────────

  it('defaults name to "image" when missing', () => {
    const input = [{
      id: 'no-name',
      mimeType: 'image/png',
      size: 100,
      dataUrl: 'data:image/png;base64,abc',
    }]

    const result = normalizeImageAttachments(input)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('image')
  })

  // ── Mixed valid and invalid ──────────────────────────

  it('correctly filters a mix of valid and invalid items', () => {
    const input = [
      { id: 'ok-1', name: 'a.png', mimeType: 'image/png', size: 100, dataUrl: 'data:image/png;base64,a' },
      null,
      { id: '', name: 'b.png', mimeType: 'image/png', size: 100, dataUrl: 'data:image/png;base64,b' }, // empty id
      { id: 'ok-2', name: 'c.jpg', mimeType: 'image/jpeg', size: 50, dataUrl: 'data:image/jpeg;base64,c' },
      { id: 'bad', name: 'd.txt', mimeType: 'text/plain', size: 100, dataUrl: 'data:image/png;base64,d' }, // wrong mime
    ]

    const result = normalizeImageAttachments(input)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.id)).toEqual(['ok-1', 'ok-2'])
  })

  // ── Image type variants ──────────────────────────────

  it('accepts various image mimeTypes', () => {
    const types = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']

    for (const mimeType of types) {
      const input = [{
        id: `img-${mimeType}`,
        name: 'test.img',
        mimeType,
        size: 100,
        dataUrl: `data:${mimeType};base64,abc`,
      }]
      const result = normalizeImageAttachments(input)
      expect(result).toHaveLength(1)
    }
  })
})
