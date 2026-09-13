import { describe, expect, test } from 'bun:test'
import type { GitCommit } from '../types/app'
import { computeGraphRows, graphSegmentPath, shouldLoadMoreGraph } from '../utils/git-graph'

function commit(hash: string, parents: string[] = []): GitCommit {
  return { hash, shortHash: hash, subject: hash, author: { name: 'A', email: 'a@example.com' }, date: '', parents, refs: [], branches: [], tags: [], lane: 0, color: '#fff' }
}

describe('git graph compatibility', () => {
  test('keeps commit hashes as stable row keys and HEAD geometry', () => {
    const rows = computeGraphRows([commit('head', ['parent']), commit('parent')], 'head')
    expect([...rows.keys()]).toEqual(['head', 'parent'])
    expect(rows.get('head')?.nodeType).toBe('head')
    expect(rows.get('head')?.connections[0]?.type).toBe('vertical-bottom')
    expect(rows.get('parent')?.connections[0]?.type).toBe('vertical-top')
  })

  test('preserves rounded and angular segment paths', () => {
    expect(graphSegmentPath({ type: 'branch-out', fromLane: 0, toLane: 1, color: '#fff', style: 'rounded' })).toContain(' C ')
    expect(graphSegmentPath({ type: 'branch-out', fromLane: 0, toLane: 1, color: '#fff', style: 'angular' })).not.toContain(' C ')
  })

  test('loads only within the existing 200px threshold and 1000-row cap', () => {
    expect(shouldLoadMoreGraph({ scrollTop: 700, clientHeight: 200, scrollHeight: 1000, loaded: 120, limit: 120 })).toBe(true)
    expect(shouldLoadMoreGraph({ scrollTop: 599, clientHeight: 200, scrollHeight: 1000, loaded: 120, limit: 120 })).toBe(false)
    expect(shouldLoadMoreGraph({ scrollTop: 900, clientHeight: 200, scrollHeight: 1000, loaded: 999, limit: 1000 })).toBe(false)
  })
})
