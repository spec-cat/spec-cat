import { describe, expect, it } from 'vitest'
import {
  buildContextQuery,
  buildSpecSearchQuery,
  classifyChatCommand,
  formatContextDiagnostics,
  formatSpecSearchResponse,
  parseSpecSearchCommand,
  tokenizeCommandArgs,
  truncateMarkdown,
  type ContextDiagnostics,
} from '~/utils/chatCommands'
import type { SearchResponse } from '~/types/specSearch'

describe('tokenizeCommandArgs', () => {
  it('splits on whitespace', () => {
    expect(tokenizeCommandArgs('a b c')).toEqual(['a', 'b', 'c'])
  })

  it('preserves double-quoted tokens without the quotes', () => {
    expect(tokenizeCommandArgs('"hello world" foo')).toEqual(['hello world', 'foo'])
  })

  it('preserves single-quoted tokens without the quotes', () => {
    expect(tokenizeCommandArgs("'a b' c")).toEqual(['a b', 'c'])
  })

  it('returns empty array for empty input', () => {
    expect(tokenizeCommandArgs('')).toEqual([])
    expect(tokenizeCommandArgs('   ')).toEqual([])
  })
})

describe('parseSpecSearchCommand', () => {
  it('returns null for non-spec-search input', () => {
    expect(parseSpecSearchCommand('/context')).toBeNull()
    expect(parseSpecSearchCommand('hello world')).toBeNull()
  })

  it('accepts both /spec-search and /specsearch prefixes', () => {
    expect(parseSpecSearchCommand('/spec-search foo')?.q).toBe('foo')
    expect(parseSpecSearchCommand('/specsearch foo')?.q).toBe('foo')
  })

  it('is case-insensitive on the prefix', () => {
    expect(parseSpecSearchCommand('/SPEC-SEARCH foo')?.q).toBe('foo')
  })

  it('parses bare query with no flags', () => {
    const cmd = parseSpecSearchCommand('/spec-search my query here')
    expect(cmd).toEqual({ q: 'my query here' })
  })

  it('parses --mode flag (space-separated and =-separated)', () => {
    expect(parseSpecSearchCommand('/spec-search foo --mode keyword')?.mode).toBe('keyword')
    expect(parseSpecSearchCommand('/spec-search foo --mode=semantic')?.mode).toBe('semantic')
    expect(parseSpecSearchCommand('/spec-search foo --mode=hybrid')?.mode).toBe('hybrid')
  })

  it('ignores invalid --mode values', () => {
    const cmd = parseSpecSearchCommand('/spec-search foo --mode=invalid')
    expect(cmd?.mode).toBeUndefined()
  })

  it('parses --feature flag', () => {
    expect(parseSpecSearchCommand('/spec-search q --feature 001-foo')?.featureId).toBe('001-foo')
    expect(parseSpecSearchCommand('/spec-search q --feature=002-bar')?.featureId).toBe('002-bar')
  })

  it('parses --file-type flag', () => {
    expect(parseSpecSearchCommand('/spec-search q --file-type spec')?.fileType).toBe('spec')
    expect(parseSpecSearchCommand('/spec-search q --file-type=plan')?.fileType).toBe('plan')
  })

  it('parses --limit flag and rejects non-positive values', () => {
    expect(parseSpecSearchCommand('/spec-search q --limit 5')?.limit).toBe(5)
    expect(parseSpecSearchCommand('/spec-search q --limit=10')?.limit).toBe(10)
    expect(parseSpecSearchCommand('/spec-search q --limit 0')?.limit).toBeUndefined()
    expect(parseSpecSearchCommand('/spec-search q --limit=-1')?.limit).toBeUndefined()
    expect(parseSpecSearchCommand('/spec-search q --limit=abc')?.limit).toBeUndefined()
  })

  it('combines query tokens with multiple flags', () => {
    const cmd = parseSpecSearchCommand('/spec-search some query --mode=hybrid --limit=3 more query')
    expect(cmd).toEqual({ q: 'some query more query', mode: 'hybrid', limit: 3 })
  })

  it('preserves quoted phrases in query', () => {
    const cmd = parseSpecSearchCommand('/spec-search "exact phrase" --mode=keyword')
    expect(cmd).toEqual({ q: 'exact phrase', mode: 'keyword' })
  })

  it('returns empty q when only flags are given', () => {
    expect(parseSpecSearchCommand('/spec-search --mode=keyword')).toEqual({ q: '', mode: 'keyword' })
  })
})

describe('truncateMarkdown', () => {
  it('returns input unchanged when under limit', () => {
    expect(truncateMarkdown('short', 100)).toBe('short')
  })

  it('trims leading/trailing whitespace', () => {
    expect(truncateMarkdown('  hi  ', 100)).toBe('hi')
  })

  it('truncates long input with trailing ellipsis marker', () => {
    const long = 'x'.repeat(2000)
    const result = truncateMarkdown(long, 10)
    expect(result).toBe(`${'x'.repeat(10)}\n...`)
  })

  it('uses 1400 as default limit', () => {
    const len = 1500
    const result = truncateMarkdown('x'.repeat(len))
    expect(result.length).toBe(1400 + '\n...'.length)
  })
})

describe('classifyChatCommand', () => {
  it('recognizes reset synonyms', () => {
    expect(classifyChatCommand('/reset')).toEqual({ kind: 'reset' })
    expect(classifyChatCommand('/reset-context')).toEqual({ kind: 'reset' })
    expect(classifyChatCommand('/new')).toEqual({ kind: 'reset' })
    expect(classifyChatCommand('/clear')).toEqual({ kind: 'reset' })
  })

  it('recognizes context synonyms', () => {
    expect(classifyChatCommand('/context')).toEqual({ kind: 'context' })
    expect(classifyChatCommand('/ctx')).toEqual({ kind: 'context' })
  })

  it('returns spec-search with parsed command', () => {
    const result = classifyChatCommand('/spec-search foo --mode=hybrid')
    expect(result.kind).toBe('spec-search')
    if (result.kind === 'spec-search') {
      expect(result.command.q).toBe('foo')
      expect(result.command.mode).toBe('hybrid')
    }
  })

  it('returns none for free-form messages', () => {
    expect(classifyChatCommand('hello world')).toEqual({ kind: 'none' })
    expect(classifyChatCommand('how are you?')).toEqual({ kind: 'none' })
  })

  it('does not match partial reset/context forms', () => {
    expect(classifyChatCommand('/reset now')).toEqual({ kind: 'none' })
    expect(classifyChatCommand('/context please')).toEqual({ kind: 'none' })
  })
})

describe('buildContextQuery', () => {
  it('always includes permissionMode', () => {
    expect(buildContextQuery(null, 'ask')).toEqual({ permissionMode: 'ask' })
  })

  it('prefers worktreePath over cwd when hasWorktree=true', () => {
    const q = buildContextQuery(
      { hasWorktree: true, worktreePath: '/wt', cwd: '/wrong' },
      'auto',
    )
    expect(q.cwd).toBe('/wt')
  })

  it('falls back to conv.cwd when no worktree', () => {
    const q = buildContextQuery({ hasWorktree: false, cwd: '/here' }, 'ask')
    expect(q.cwd).toBe('/here')
  })

  it('skips missing optional fields', () => {
    const q = buildContextQuery({ providerId: 'claude' }, 'ask')
    expect(q).toEqual({ permissionMode: 'ask', providerId: 'claude' })
  })

  it('includes all optional fields when present', () => {
    const q = buildContextQuery(
      {
        hasWorktree: true,
        worktreePath: '/wt',
        featureId: 'f1',
        providerId: 'p',
        providerModelKey: 'm',
        providerSessionId: 's',
      },
      'plan',
    )
    expect(q).toEqual({
      permissionMode: 'plan',
      cwd: '/wt',
      featureId: 'f1',
      providerId: 'p',
      providerModelKey: 'm',
      providerSessionId: 's',
    })
  })
})

describe('buildSpecSearchQuery', () => {
  it('defaults mode to hybrid and limit to 5', () => {
    expect(buildSpecSearchQuery({ q: 'x' })).toEqual({
      q: 'x',
      mode: 'hybrid',
      featureId: undefined,
      fileType: undefined,
      limit: '5',
    })
  })

  it('uses command-level featureId over default', () => {
    const q = buildSpecSearchQuery({ q: 'x', featureId: 'cmd' }, { featureId: 'default' })
    expect(q.featureId).toBe('cmd')
  })

  it('falls back to default featureId when command omits it', () => {
    const q = buildSpecSearchQuery({ q: 'x' }, { featureId: 'default' })
    expect(q.featureId).toBe('default')
  })

  it('stringifies limit', () => {
    const q = buildSpecSearchQuery({ q: 'x', limit: 10 })
    expect(q.limit).toBe('10')
  })

  it('preserves mode and fileType from command', () => {
    const q = buildSpecSearchQuery({ q: 'x', mode: 'keyword', fileType: 'spec' })
    expect(q.mode).toBe('keyword')
    expect(q.fileType).toBe('spec')
  })
})

describe('formatContextDiagnostics', () => {
  const diag: ContextDiagnostics = {
    generatedAt: '2026-01-01T00:00:00Z',
    requestedCwd: '/a',
    effectiveCwd: '/b',
    providerId: 'claude',
    providerModelKey: 'sonnet',
    permissionMode: 'ask',
    providerSessionId: 'sid',
    sessionState: 'resume',
    featureId: '001-foo',
    specContext: { active: true, reason: 'matched', files: ['spec.md'] },
    instructionFiles: [
      { path: '/a/CLAUDE.md', source: 'cwd', kind: 'file', hint: 'root', mtime: '2026-01-01' },
    ],
  }

  it('includes all headline fields', () => {
    const out = formatContextDiagnostics(diag)
    expect(out).toContain('## Context Snapshot')
    expect(out).toContain('- Time: 2026-01-01T00:00:00Z')
    expect(out).toContain('- Session state: **resume**')
    expect(out).toContain('- Provider: `claude` / `sonnet`')
    expect(out).toContain('- Feature: `001-foo`')
  })

  it('marks empty provider session id explicitly', () => {
    const out = formatContextDiagnostics({ ...diag, providerSessionId: null })
    expect(out).toContain('Provider session ID: `(empty)`')
  })

  it('falls back to "(none)" markers when feature/spec/files are empty', () => {
    const out = formatContextDiagnostics({
      ...diag,
      featureId: null,
      specContext: { active: false, reason: 'none', files: [] },
      instructionFiles: [],
    })
    expect(out).toContain('Feature: `(none)`')
    expect(out).toContain('- (none)')
    expect(out).toContain('- (none detected from current cwd ancestry)')
  })

  it('formats spec context as yes/no', () => {
    const active = formatContextDiagnostics(diag)
    const inactive = formatContextDiagnostics({
      ...diag,
      specContext: { active: false, reason: 'n/a', files: [] },
    })
    expect(active).toContain('Active on next turn: **yes**')
    expect(inactive).toContain('Active on next turn: **no**')
  })
})

describe('formatSpecSearchResponse', () => {
  const emptyResponse: SearchResponse = {
    mode: 'keyword',
    totalCount: 0,
    searchTime: 12,
    results: [],
  } as SearchResponse

  it('returns no-results message when results are empty', () => {
    const out = formatSpecSearchResponse({ q: 'test' }, emptyResponse)
    expect(out).toContain('No matching indexed chunks were found.')
  })

  it('includes optional filter lines only when set', () => {
    const out = formatSpecSearchResponse({ q: 'x', featureId: 'f1', fileType: 'spec' }, emptyResponse)
    expect(out).toContain('Feature filter: `f1`')
    expect(out).toContain('File type filter: `spec`')
  })

  it('formats each result with heading hierarchy and score', () => {
    const response: SearchResponse = {
      mode: 'hybrid',
      totalCount: 1,
      searchTime: 34,
      results: [
        {
          matchType: 'semantic',
          score: 0.87654,
          chunk: {
            sourcePath: 'specs/001/spec.md',
            lineStart: 10,
            headingHierarchy: ['H1', 'H2'],
            content: 'This is the matched content block.',
          },
        },
      ],
    } as unknown as SearchResponse

    const out = formatSpecSearchResponse({ q: 'test' }, response)
    expect(out).toContain('### 1. `specs/001/spec.md:10`')
    expect(out).toContain('Match: `semantic` (score: 0.877)')
    expect(out).toContain('Headings: H1 > H2')
    expect(out).toContain('This is the matched content block.')
  })

  it('includes warning line when present', () => {
    const withWarning: SearchResponse = {
      ...emptyResponse,
      warning: 'Index is stale',
    } as SearchResponse
    const out = formatSpecSearchResponse({ q: 'q' }, withWarning)
    expect(out).toContain('- Warning: Index is stale')
  })
})
