import { describe, expect, it } from 'vitest'
import {
  MAX_IMAGE_ATTACHMENTS,
  MAX_IMAGE_SIZE_BYTES,
  createAttachmentId,
  formatAttachmentSize,
  validateImageFile,
} from '~/utils/imageAttachments'

describe('formatAttachmentSize', () => {
  it('formats bytes as B', () => {
    expect(formatAttachmentSize(500)).toBe('500 B')
  })

  it('formats KB range with one decimal', () => {
    expect(formatAttachmentSize(2048)).toBe('2.0 KB')
    expect(formatAttachmentSize(1536)).toBe('1.5 KB')
  })

  it('formats MB range with one decimal', () => {
    expect(formatAttachmentSize(2 * 1024 * 1024)).toBe('2.0 MB')
    expect(formatAttachmentSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })

  it('handles boundary at 1 KB', () => {
    expect(formatAttachmentSize(1023)).toBe('1023 B')
    expect(formatAttachmentSize(1024)).toBe('1.0 KB')
  })

  it('handles boundary at 1 MB', () => {
    expect(formatAttachmentSize(1024 * 1024 - 1)).toMatch(/KB/)
    expect(formatAttachmentSize(1024 * 1024)).toBe('1.0 MB')
  })
})

describe('validateImageFile', () => {
  function mockFile(type: string, size: number): File {
    return { type, size } as File
  }

  it('accepts valid image files under limit', () => {
    expect(validateImageFile(mockFile('image/png', 1000))).toEqual({ ok: true })
    expect(validateImageFile(mockFile('image/jpeg', MAX_IMAGE_SIZE_BYTES))).toEqual({ ok: true })
  })

  it('rejects non-image files', () => {
    expect(validateImageFile(mockFile('application/pdf', 100))).toEqual({ ok: false, reason: 'not-image' })
    expect(validateImageFile(mockFile('text/plain', 100))).toEqual({ ok: false, reason: 'not-image' })
  })

  it('rejects images larger than MAX_IMAGE_SIZE_BYTES', () => {
    expect(validateImageFile(mockFile('image/png', MAX_IMAGE_SIZE_BYTES + 1))).toEqual({
      ok: false,
      reason: 'too-large',
    })
  })

  it('allows overriding max size', () => {
    expect(validateImageFile(mockFile('image/png', 500), 1000)).toEqual({ ok: true })
    expect(validateImageFile(mockFile('image/png', 2000), 1000)).toEqual({ ok: false, reason: 'too-large' })
  })
})

describe('createAttachmentId', () => {
  it('produces deterministic id with injected clock/rng', () => {
    const id = createAttachmentId(() => 1700000000000, () => 0.123456)
    expect(id).toMatch(/^att-1700000000000-/)
  })

  it('produces different ids for different random values', () => {
    const id1 = createAttachmentId(() => 1, () => 0.1)
    const id2 = createAttachmentId(() => 1, () => 0.9)
    expect(id1).not.toBe(id2)
  })
})

describe('constants', () => {
  it('MAX_IMAGE_ATTACHMENTS is 4', () => {
    expect(MAX_IMAGE_ATTACHMENTS).toBe(4)
  })

  it('MAX_IMAGE_SIZE_BYTES is 5 MB', () => {
    expect(MAX_IMAGE_SIZE_BYTES).toBe(5 * 1024 * 1024)
  })
})
