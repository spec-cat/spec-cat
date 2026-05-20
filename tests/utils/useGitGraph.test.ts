import { describe, expect, it } from 'vitest'
import { useGitGraph } from '~/composables/useGitGraph'
import type { GitLogCommit } from '~/types/git'

function commit(
  shortHash: string,
  parents: string[] = [],
  isHead = false,
): GitLogCommit {
  return {
    hash: shortHash.padEnd(40, '0'),
    shortHash,
    author: 'Tester',
    email: 'tester@example.com',
    timestamp: 1,
    message: shortHash,
    parents: parents.map(parent => parent.padEnd(40, '0')),
    branches: [],
    tags: [],
    isHead,
  }
}

describe('useGitGraph', () => {
  it('keeps the first visible git-log chain on lane 0 when HEAD is lower in the list', () => {
    const mainTip = commit('main-tip', ['main-1'])
    const mainParent = commit('main-1', ['head-tip'])
    const headTip = commit('head-tip', ['base'], true)
    const base = commit('base')

    const { computeGraphRows } = useGitGraph()
    const rows = computeGraphRows([mainTip, mainParent, headTip, base])

    expect(rows.get(mainTip.hash)?.lane).toBe(0)
    expect(rows.get(mainParent.hash)?.lane).toBe(0)
    expect(rows.get(headTip.hash)?.lane).toBe(0)
    expect(rows.get(headTip.hash)?.nodeType).toBe('head')
  })
})
