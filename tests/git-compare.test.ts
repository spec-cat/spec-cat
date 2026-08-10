import { describe, expect, test } from 'bun:test'
import { requireRemoteUrl } from '../server/utils/git-access'
import { mergeCompareFiles, parseNameStatusZ, parseNumstatZ, parseRemoteDetails } from '../server/utils/git-state'

describe('Name-status parsing', () => {
  test('parses added, modified, and deleted entries', () => {
    const output = ['A', 'docs/new.md', 'M', 'server/api/git/compare.get.ts', 'D', 'server/legacy.ts', ''].join('\0')

    expect(parseNameStatusZ(output)).toEqual([
      { status: 'A', path: 'docs/new.md' },
      { status: 'M', path: 'server/api/git/compare.get.ts' },
      { status: 'D', path: 'server/legacy.ts' }
    ])
  })

  test('parses renames and copies with score suffixes', () => {
    const output = ['R100', 'old/name.ts', 'new/name.ts', 'C75', 'src/base.ts', 'src/copy.ts', ''].join('\0')

    expect(parseNameStatusZ(output)).toEqual([
      { status: 'R', oldPath: 'old/name.ts', path: 'new/name.ts' },
      { status: 'C', oldPath: 'src/base.ts', path: 'src/copy.ts' }
    ])
  })

  test('keeps paths that contain tabs and newlines intact', () => {
    const output = ['M', 'path with\ttab and\nnewline.txt', ''].join('\0')

    expect(parseNameStatusZ(output)).toEqual([
      { status: 'M', path: 'path with\ttab and\nnewline.txt' }
    ])
  })

  test('returns an empty list for an empty diff', () => {
    expect(parseNameStatusZ('')).toEqual([])
  })
})

describe('Numstat parsing', () => {
  test('parses text file counts', () => {
    const output = ['12\t3\tserver/api/git/compare.get.ts', '0\t7\tserver/legacy.ts', ''].join('\0')

    expect(parseNumstatZ(output)).toEqual([
      { path: 'server/api/git/compare.get.ts', additions: 12, deletions: 3, binary: false },
      { path: 'server/legacy.ts', additions: 0, deletions: 7, binary: false }
    ])
  })

  test('marks binary files that report dashes', () => {
    const output = ['-\t-\tassets/logo.png', ''].join('\0')

    expect(parseNumstatZ(output)).toEqual([
      { path: 'assets/logo.png', additions: 0, deletions: 0, binary: true }
    ])
  })

  test('parses renamed entries with detached path tokens', () => {
    const output = ['5\t1\t', 'old/name.ts', 'new/name.ts', ''].join('\0')

    expect(parseNumstatZ(output)).toEqual([
      { path: 'new/name.ts', oldPath: 'old/name.ts', additions: 5, deletions: 1, binary: false }
    ])
  })

  test('returns an empty list for an empty diff', () => {
    expect(parseNumstatZ('')).toEqual([])
  })
})

describe('Compare file merging', () => {
  test('combines statuses with line counts by new path', () => {
    const nameStatus = parseNameStatusZ(['M', 'src/app.ts', 'R100', 'old/name.ts', 'new/name.ts', 'A', 'assets/logo.png', ''].join('\0'))
    const numstat = parseNumstatZ(['4\t2\tsrc/app.ts', '5\t1\t', 'old/name.ts', 'new/name.ts', '-\t-\tassets/logo.png', ''].join('\0'))

    expect(mergeCompareFiles(nameStatus, numstat)).toEqual([
      { path: 'src/app.ts', status: 'M', oldPath: undefined, additions: 4, deletions: 2 },
      { path: 'new/name.ts', status: 'R', oldPath: 'old/name.ts', additions: 5, deletions: 1 },
      { path: 'assets/logo.png', status: 'A', oldPath: undefined, additions: 0, deletions: 0 }
    ])
  })

  test('defaults counts to zero when numstat has no matching entry', () => {
    expect(mergeCompareFiles([{ status: 'M', path: 'src/app.ts' }], [])).toEqual([
      { path: 'src/app.ts', status: 'M', oldPath: undefined, additions: 0, deletions: 0 }
    ])
  })
})

describe('Remote detail parsing', () => {
  test('collects fetch and push urls per remote', () => {
    const output = [
      'origin\tgit@github.com:eseom/code-cat.git (fetch)',
      'origin\thttps://github.com/eseom/code-cat.git (push)',
      'upstream\thttps://github.com/example/code-cat.git (fetch)',
      'upstream\thttps://github.com/example/code-cat.git (push)'
    ].join('\n')

    expect(parseRemoteDetails(output)).toEqual([
      { name: 'origin', fetchUrl: 'git@github.com:eseom/code-cat.git', pushUrl: 'https://github.com/eseom/code-cat.git' },
      { name: 'upstream', fetchUrl: 'https://github.com/example/code-cat.git', pushUrl: 'https://github.com/example/code-cat.git' }
    ])
  })

  test('returns an empty list when there are no remotes', () => {
    expect(parseRemoteDetails('')).toEqual([])
  })
})

describe('Remote URL validation', () => {
  test.each([
    'git@github.com:eseom/code-cat.git',
    'https://github.com/eseom/code-cat.git',
    'ssh://git@example.com/repo.git',
    '/home/khan/src/code-cat'
  ])('accepts common remote urls: %s', (value) => {
    expect(requireRemoteUrl(value)).toBe(value)
  })

  test.each(['', '   ', '--upload-pack=evil', '-flag', 'x'.repeat(2049), 'https://a.example\nb'])('rejects unsafe remote urls', (value) => {
    expect(() => requireRemoteUrl(value)).toThrow()
  })
})
