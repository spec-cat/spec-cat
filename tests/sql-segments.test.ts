import { describe, expect, test } from 'bun:test'
import { currentSegmentMarkup, highlightSql, sqlSegmentAtCursor } from '../utils/sql-segments'

describe('sqlSegmentAtCursor', () => {
  test('returns only the statement containing the cursor', () => {
    const source = 'select 1;\nselect 2;\nselect 3'
    expect(sqlSegmentAtCursor(source, source.indexOf('2'))?.sql).toBe('select 2;')
  })

  test('treats a cursor after a delimiter as part of the next statement', () => {
    expect(sqlSegmentAtCursor('select 1; select 2;', 9)?.sql).toBe('select 2;')
  })

  test('ignores semicolons in strings, identifiers, and comments', () => {
    const source = `select ';', "a;b"; -- ;\nselect 2 /* ; */;`
    expect(sqlSegmentAtCursor(source, source.indexOf("';'"))?.sql).toBe(`select ';', "a;b";`)
    expect(sqlSegmentAtCursor(source, source.indexOf('2'))?.sql).toBe('-- ;\nselect 2 /* ; */;')
  })

  test('ignores semicolons in PostgreSQL dollar-quoted bodies', () => {
    const source = 'do $$ begin perform 1; end $$;\nselect 2;'
    expect(sqlSegmentAtCursor(source, source.indexOf('perform'))?.sql).toBe('do $$ begin perform 1; end $$;')
  })

  test('returns null for an empty segment', () => {
    expect(sqlSegmentAtCursor('select 1;   ', 11)).toBeNull()
  })
})

describe('highlightSql', () => {
  test('highlights keywords, strings, numbers, and comments', () => {
    const html = highlightSql("select 'x', 42; -- note")
    expect(html).toContain('<span class="sql-keyword">select</span>')
    expect(html).toContain('<span class="sql-string">&#39;x&#39;</span>')
    expect(html).toContain('<span class="sql-number">42</span>')
    expect(html).toContain('<span class="sql-comment">-- note</span>')
  })

  test('escapes user-authored markup', () => {
    expect(highlightSql('select <script>')).not.toContain('<script>')
  })

  test('marks only the current statement', () => {
    expect(currentSegmentMarkup('select 1; select 2;', 17)).toContain('<mark>select 2;</mark>')
  })
})
