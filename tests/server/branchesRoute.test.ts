import { beforeAll, describe, expect, it, vi } from 'vitest'

let parseBranchRefRow: typeof import('~/server/api/git/branches.get').parseBranchRefRow

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('getQuery', () => ({}))
  ;({ parseBranchRefRow } = await import('~/server/api/git/branches.get'))
})

describe('git branches route parser', () => {
  it('parses a normal for-each-ref row', () => {
    const parsed = parseBranchRefRow([
      ' ',
      'refs/heads/main',
      'main',
      'b2f09ba150c403b469b653c4b676113983f611af',
      'us/main',
      '2026-04-23T11:31:50+09:00',
    ].join('\t'))

    expect(parsed).toEqual({
      headMarker: ' ',
      refName: 'refs/heads/main',
      shortName: 'main',
      tip: 'b2f09ba150c403b469b653c4b676113983f611af',
      upstreamShort: 'us/main',
      commitDateRaw: '2026-04-23T11:31:50+09:00',
    })
  })

  it('repairs a shifted preview-mode row where refName is missing', () => {
    const parsed = parseBranchRefRow([
      ' ',
      'main',
      'b2f09ba150c403b469b653c4b676113983f611af',
      'us/main',
      '2026-04-23T11:31:50+09:00',
    ].join('\t'))

    expect(parsed).toEqual({
      headMarker: ' ',
      refName: 'refs/heads/main',
      shortName: 'main',
      tip: 'b2f09ba150c403b469b653c4b676113983f611af',
      upstreamShort: 'us/main',
      commitDateRaw: '2026-04-23T11:31:50+09:00',
    })
  })

  it('rejects rows that still lack required fields after normalization', () => {
    expect(parseBranchRefRow(' \t\t\t\t')).toBe(null)
  })
})
