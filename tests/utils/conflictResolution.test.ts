import { describe, expect, it } from 'vitest'
import {
  batchFiles,
  buildDetectedConflictsMessage,
  buildStartResolutionMessage,
  createConflictChatMessage,
  filterUnresolvedFiles,
  summarizeAiResolution,
} from '~/utils/conflictResolution'
import type { ConflictFile } from '~/types/chat'

describe('createConflictChatMessage', () => {
  it('produces a message with id, timestamp, and default type=info', () => {
    const msg = createConflictChatMessage('system', 'hello')
    expect(msg.role).toBe('system')
    expect(msg.content).toBe('hello')
    expect(msg.type).toBe('info')
    expect(typeof msg.id).toBe('string')
    expect(typeof msg.timestamp).toBe('number')
  })

  it('supports injected now/random for deterministic ids', () => {
    const msg = createConflictChatMessage('user', 'x', 'info', undefined, () => 1700000000000, () => 0.123456)
    expect(msg.id).toMatch(/^conflict-msg-1700000000000-/)
    expect(msg.timestamp).toBe(1700000000000)
  })

  it('forwards fileRef when provided', () => {
    const msg = createConflictChatMessage('assistant', 'done', 'success', '/a/b.ts')
    expect(msg.fileRef).toBe('/a/b.ts')
  })
})

describe('summarizeAiResolution', () => {
  it('returns succeeded=true when no failures', () => {
    expect(summarizeAiResolution(3, 0)).toEqual({
      message: expect.stringContaining('All 3 files resolved successfully'),
      succeeded: true,
    })
  })

  it('singularizes when successCount is 1', () => {
    expect(summarizeAiResolution(1, 0).message).toContain('All 1 file resolved successfully')
  })

  it('returns succeeded=false when there are failures', () => {
    const result = summarizeAiResolution(2, 1)
    expect(result.succeeded).toBe(false)
    expect(result.message).toContain('2 succeeded, 1 failed')
  })
})

describe('batchFiles', () => {
  it('splits into fixed-size batches preserving order', () => {
    expect(batchFiles([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns a single batch when input fits', () => {
    expect(batchFiles(['a', 'b'], 5)).toEqual([['a', 'b']])
  })

  it('returns an empty array for empty input', () => {
    expect(batchFiles([], 3)).toEqual([])
  })

  it('throws when batchSize is not positive', () => {
    expect(() => batchFiles([1, 2], 0)).toThrow()
    expect(() => batchFiles([1, 2], -1)).toThrow()
  })
})

describe('filterUnresolvedFiles', () => {
  const files: ConflictFile[] = [
    { path: '/a.ts', content: '', status: 'unresolved' } as ConflictFile,
    { path: '/b.ts', content: '', status: 'unresolved' } as ConflictFile,
    { path: '/c.ts', content: '', status: 'unresolved' } as ConflictFile,
  ]

  it('returns all files when no resolved paths', () => {
    expect(filterUnresolvedFiles(files, new Set())).toHaveLength(3)
  })

  it('excludes resolved paths', () => {
    const result = filterUnresolvedFiles(files, new Set(['/b.ts']))
    expect(result.map((f) => f.path)).toEqual(['/a.ts', '/c.ts'])
  })

  it('returns empty when all resolved', () => {
    const result = filterUnresolvedFiles(files, new Set(['/a.ts', '/b.ts', '/c.ts']))
    expect(result).toEqual([])
  })
})

describe('buildDetectedConflictsMessage', () => {
  it('pluralizes based on count', () => {
    expect(buildDetectedConflictsMessage(1)).toContain('1 conflicted file.')
    expect(buildDetectedConflictsMessage(5)).toContain('5 conflicted files.')
  })

  it('includes the guidance prompt tail', () => {
    expect(buildDetectedConflictsMessage(1)).toContain('Resolve Conflicts Automatically')
  })
})

describe('buildStartResolutionMessage', () => {
  it('pluralizes based on count', () => {
    expect(buildStartResolutionMessage(1)).toContain('1 file ')
    expect(buildStartResolutionMessage(4)).toContain('4 files ')
  })

  it('mentions parallel execution', () => {
    expect(buildStartResolutionMessage(2)).toContain('(parallel)')
  })
})
