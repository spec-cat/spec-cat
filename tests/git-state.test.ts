import { describe, expect, test } from 'bun:test'
import { countPorcelainEntries, hashText, parsePorcelainStatus, parseRemotes } from '../server/utils/git-state'

describe('Porcelain status parsing', () => {
  test('classifies untracked, modified, deleted, staged, and partially staged files', () => {
    const output = [
      '?? notes/todo.md',
      ' M app/pages/index.vue',
      ' D server/legacy.ts',
      'M  server/api/git/state.get.ts',
      'MM server/utils/git-state.ts',
      'A  tests/git-state.test.ts',
      ''
    ].join('\n')

    const files = parsePorcelainStatus(output)

    expect(files.untracked).toEqual(['notes/todo.md'])
    expect(files.modified).toEqual(['app/pages/index.vue', 'server/utils/git-state.ts'])
    expect(files.deleted).toEqual(['server/legacy.ts'])
    expect(files.staged).toEqual(['server/api/git/state.get.ts', 'server/utils/git-state.ts', 'tests/git-state.test.ts'])
    expect(files.partiallyStaged).toEqual(['server/utils/git-state.ts'])
  })

  test('uses the new path for renames', () => {
    const files = parsePorcelainStatus('R  old/name.ts -> new/name.ts\n')

    expect(files.staged).toEqual(['new/name.ts'])
    expect(files.partiallyStaged).toEqual([])
  })

  test('unquotes paths that git escapes', () => {
    const files = parsePorcelainStatus('?? "path with \\"quotes\\".md"\n')

    expect(files.untracked).toEqual(['path with "quotes".md'])
  })

  test('returns empty groups for a clean tree', () => {
    const files = parsePorcelainStatus('')

    expect(files.untracked).toEqual([])
    expect(files.modified).toEqual([])
    expect(files.deleted).toEqual([])
    expect(files.staged).toEqual([])
    expect(files.partiallyStaged).toEqual([])
  })

  test('counts porcelain entries while ignoring blank lines', () => {
    expect(countPorcelainEntries('')).toBe(0)
    expect(countPorcelainEntries('?? a.txt\n M b.txt\n')).toBe(2)
  })
})

describe('Hash fingerprints', () => {
  test('is stable for identical input', () => {
    const output = '?? a.txt\n M b.txt\n'

    expect(hashText(output)).toBe(hashText(output))
    expect(hashText(output)).toMatch(/^[0-9a-f]{40}$/)
  })

  test('changes when input changes', () => {
    expect(hashText('?? a.txt\n')).not.toBe(hashText('?? b.txt\n'))
    expect(hashText('')).not.toBe(hashText('\n'))
  })
})

describe('Remote parsing', () => {
  test('deduplicates fetch and push lines per remote', () => {
    const output = [
      'origin\tgit@github.com:eseom/code-cat.git (fetch)',
      'origin\tgit@github.com:eseom/code-cat.git (push)',
      'upstream\thttps://github.com/example/code-cat.git (fetch)',
      'upstream\thttps://github.com/example/code-cat.git (push)'
    ].join('\n')

    expect(parseRemotes(output)).toEqual([
      { name: 'origin', url: 'git@github.com:eseom/code-cat.git' },
      { name: 'upstream', url: 'https://github.com/example/code-cat.git' }
    ])
  })

  test('returns an empty list when there are no remotes', () => {
    expect(parseRemotes('')).toEqual([])
  })
})
