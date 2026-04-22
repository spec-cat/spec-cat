import { describe, expect, it } from 'vitest'
import { parseGitLog, parseGitStatusPorcelain, generateBranchColor, parseUnifiedDiff } from '~/server/utils/gitParsers'

describe('parseGitLog', () => {
  it('returns empty array for blank output', () => {
    expect(parseGitLog('', [], [])).toEqual([])
    expect(parseGitLog('   \n  ', [], [])).toEqual([])
  })

  it('parses a single commit line with all fields', () => {
    const line = 'abc1234567890abc1234567890abc1234567890ab|abc1234|Alice|alice@example.com|1700000000|Initial commit|'
    const commits = parseGitLog(line, [], [])
    expect(commits).toHaveLength(1)
    expect(commits[0]).toEqual({
      hash: 'abc1234567890abc1234567890abc1234567890ab',
      shortHash: 'abc1234',
      author: 'Alice',
      email: 'alice@example.com',
      timestamp: 1700000000,
      message: 'Initial commit',
      parents: [],
      branches: [],
      tags: [],
    })
  })

  it('parses multiple parents separated by space', () => {
    const line = 'h1|h1|Bob|bob@x|1700000001|Merge branch foo|p1 p2 p3'
    const [commit] = parseGitLog(line, [], [])
    expect(commit.parents).toEqual(['p1', 'p2', 'p3'])
  })

  it('returns empty parents array when parent field is missing or empty', () => {
    const withTrailingPipe = 'h1|h1|A|a@x|1700000000|msg|'
    expect(parseGitLog(withTrailingPipe, [], [])[0].parents).toEqual([])

    const noTrailingPipe = 'h1|h1|A|a@x|1700000000|msg'
    expect(parseGitLog(noTrailingPipe, [], [])[0].parents).toEqual([])
  })

  it('filters out blank lines between commits', () => {
    const output = [
      'h1|h1|A|a@x|1700000000|m1|',
      '',
      'h2|h2|B|b@x|1700000001|m2|h1',
    ].join('\n')
    const commits = parseGitLog(output, [], [])
    expect(commits.map(c => c.hash)).toEqual(['h1', 'h2'])
  })

  it('converts timestamp string to number', () => {
    const line = 'h1|h1|A|a@x|1700000000|m|'
    expect(parseGitLog(line, [], [])[0].timestamp).toBe(1700000000)
    expect(typeof parseGitLog(line, [], [])[0].timestamp).toBe('number')
  })

  it('initializes branches and tags as empty arrays (decorations added separately)', () => {
    const line = 'h1|h1|A|a@x|1700000000|m|'
    const [commit] = parseGitLog(line, ['main', 'develop'], ['v1.0'])
    expect(commit.branches).toEqual([])
    expect(commit.tags).toEqual([])
  })
})

describe('generateBranchColor', () => {
  it('returns a valid hex color from the fixed palette', () => {
    const color = generateBranchColor('main')
    expect(color).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('is deterministic: same branch name produces same color', () => {
    expect(generateBranchColor('feature/auth')).toBe(generateBranchColor('feature/auth'))
    expect(generateBranchColor('main')).toBe(generateBranchColor('main'))
  })

  it('returns one of the twelve defined palette colors', () => {
    const palette = [
      '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
      '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
      '#06B6D4', '#84CC16', '#F43F5E', '#A855F7',
    ]
    const names = ['main', 'develop', 'feat/a', 'feat/b', 'bugfix', 'release', 'hotfix', 'x', '']
    for (const name of names) {
      expect(palette).toContain(generateBranchColor(name))
    }
  })

  it('handles empty string without throwing', () => {
    expect(() => generateBranchColor('')).not.toThrow()
    expect(generateBranchColor('')).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('distributes different branch names across colors', () => {
    const colors = new Set<string>()
    for (let i = 0; i < 50; i++) {
      colors.add(generateBranchColor(`branch-${i}`))
    }
    // Expect at least several distinct colors from a 12-color palette
    expect(colors.size).toBeGreaterThan(3)
  })
})

describe('parseGitStatusPorcelain', () => {
  it('preserves a leading space on the first porcelain line', () => {
    const output = [
      ' M AGENTS.md',
      'M  app/api/chat.ts',
    ].join('\n')

    const { stagedFiles, unstagedFiles } = parseGitStatusPorcelain(output)

    expect(stagedFiles).toEqual([
      { path: 'app/api/chat.ts', status: 'M', staged: true, unstaged: false },
    ])
    expect(unstagedFiles).toEqual([
      { path: 'AGENTS.md', status: 'M', staged: false, unstaged: true },
    ])
  })

  it('returns empty arrays for blank porcelain output', () => {
    expect(parseGitStatusPorcelain('')).toEqual({ stagedFiles: [], unstagedFiles: [] })
    expect(parseGitStatusPorcelain(' \n')).toEqual({ stagedFiles: [], unstagedFiles: [] })
  })
})

describe('parseUnifiedDiff', () => {
  it('returns empty result for blank input', () => {
    expect(parseUnifiedDiff('')).toEqual({ lines: [], truncated: false })
    expect(parseUnifiedDiff('   \n\n  ')).toEqual({ lines: [], truncated: false })
  })

  it('skips metadata headers (diff --git, index, ---, +++)', () => {
    const input = [
      'diff --git a/foo.txt b/foo.txt',
      'index abc..def 100644',
      '--- a/foo.txt',
      '+++ b/foo.txt',
    ].join('\n')
    expect(parseUnifiedDiff(input).lines).toEqual([])
  })

  it('parses hunk header and sets line numbers', () => {
    const input = '@@ -10,3 +20,4 @@ context'
    const { lines } = parseUnifiedDiff(input)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual({ type: 'header', content: '@@ -10,3 +20,4 @@ context' })
  })

  it('tracks line numbers from hunk header through content lines', () => {
    const input = [
      '@@ -10,3 +20,3 @@',
      ' ctx1',
      '-old1',
      '+new1',
      ' ctx2',
    ].join('\n')
    const { lines } = parseUnifiedDiff(input)
    expect(lines).toEqual([
      { type: 'header', content: '@@ -10,3 +20,3 @@' },
      { type: 'context', content: 'ctx1', oldLineNumber: 10, newLineNumber: 20 },
      { type: 'delete', content: 'old1', oldLineNumber: 11 },
      { type: 'add', content: 'new1', newLineNumber: 21 },
      { type: 'context', content: 'ctx2', oldLineNumber: 12, newLineNumber: 22 },
    ])
  })

  it('parses hunk header without counts (single-line)', () => {
    const input = [
      '@@ -5 +5 @@',
      '-old',
      '+new',
    ].join('\n')
    const { lines } = parseUnifiedDiff(input)
    expect(lines[1]).toMatchObject({ type: 'delete', oldLineNumber: 5 })
    expect(lines[2]).toMatchObject({ type: 'add', newLineNumber: 5 })
  })

  it('skips "\\ No newline at end of file" markers', () => {
    const input = [
      '@@ -1,1 +1,1 @@',
      '-old',
      '\\ No newline at end of file',
      '+new',
      '\\ No newline at end of file',
    ].join('\n')
    const { lines } = parseUnifiedDiff(input)
    expect(lines.filter(l => l.content.includes('No newline'))).toHaveLength(0)
    expect(lines.filter(l => l.type === 'delete' || l.type === 'add')).toHaveLength(2)
  })

  it('treats empty lines as context lines with empty content', () => {
    const input = [
      '@@ -1,3 +1,3 @@',
      ' line1',
      '',
      ' line3',
    ].join('\n')
    const { lines } = parseUnifiedDiff(input)
    expect(lines[2]).toEqual({ type: 'context', content: '', oldLineNumber: 2, newLineNumber: 2 })
  })

  it('truncates when exceeding max lines', () => {
    const hunkLines = ['@@ -1,100 +1,100 @@']
    for (let i = 0; i < 20; i++) hunkLines.push(`+line${i}`)
    const { lines, truncated } = parseUnifiedDiff(hunkLines.join('\n'), 5)
    expect(lines).toHaveLength(5)
    expect(truncated).toBe(true)
  })

  it('does not truncate when within limit', () => {
    const input = [
      '@@ -1,2 +1,2 @@',
      '+a',
      '+b',
    ].join('\n')
    const { truncated } = parseUnifiedDiff(input, 100)
    expect(truncated).toBe(false)
  })

  it('handles consecutive hunks with independent line counters', () => {
    const input = [
      '@@ -1,1 +1,1 @@',
      '+first',
      '@@ -50,1 +60,1 @@',
      '+second',
    ].join('\n')
    const { lines } = parseUnifiedDiff(input)
    expect(lines[1]).toMatchObject({ content: 'first', newLineNumber: 1 })
    expect(lines[3]).toMatchObject({ content: 'second', newLineNumber: 60 })
  })

  it('preserves leading whitespace in context content', () => {
    const input = [
      '@@ -1,1 +1,1 @@',
      '   indented context',
    ].join('\n')
    const { lines } = parseUnifiedDiff(input)
    // First char is the diff marker ' ', rest is '  indented context'
    expect(lines[1].content).toBe('  indented context')
  })
})
