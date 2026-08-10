export type SqlSegment = {
  sql: string
  start: number
  end: number
}

/** Finds the statement containing the cursor, ignoring semicolons in PostgreSQL literals and comments. */
export function sqlSegmentAtCursor(source: string, cursor: number): SqlSegment | null {
  const boundaries = [0]
  let quote: "'" | '"' | null = null
  let dollarTag = ''
  let lineComment = false
  let blockCommentDepth = 0

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!
    const next = source[index + 1] || ''

    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }
    if (blockCommentDepth) {
      if (char === '/' && next === '*') { blockCommentDepth += 1; index += 1 }
      else if (char === '*' && next === '/') { blockCommentDepth -= 1; index += 1 }
      continue
    }
    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1
        dollarTag = ''
      }
      continue
    }
    if (quote) {
      if (char === quote) {
        if (next === quote) index += 1
        else quote = null
      }
      continue
    }

    if (char === '-' && next === '-') { lineComment = true; index += 1; continue }
    if (char === '/' && next === '*') { blockCommentDepth = 1; index += 1; continue }
    if (char === "'" || char === '"') { quote = char; continue }
    if (char === '$') {
      const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
      if (match) { dollarTag = match[0]; index += dollarTag.length - 1; continue }
    }
    if (char === ';') boundaries.push(index + 1)
  }
  if (boundaries.at(-1) !== source.length) boundaries.push(source.length)

  const position = Math.max(0, Math.min(cursor, source.length))
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const rawStart = boundaries[index]!
    const rawEnd = boundaries[index + 1]!
    // A cursor immediately after a delimiter belongs to the next statement.
    if (position < rawStart || (position >= rawEnd && rawEnd !== source.length)) continue
    const raw = source.slice(rawStart, rawEnd)
    const leading = raw.match(/^\s*/)?.[0].length || 0
    const trailing = raw.match(/\s*$/)?.[0].length || 0
    const start = rawStart + leading
    const end = rawEnd - trailing
    if (start < end) return { sql: source.slice(start, end), start, end }
  }
  return null
}

const SQL_KEYWORDS = new Set([
  'all', 'alter', 'and', 'as', 'asc', 'begin', 'between', 'by', 'case', 'check', 'column', 'commit',
  'constraint', 'create', 'cross', 'current_date', 'current_database', 'current_schema', 'current_time',
  'current_timestamp', 'current_user', 'default', 'delete', 'desc', 'distinct', 'do', 'drop', 'else',
  'end', 'except', 'exists', 'false', 'fetch', 'for', 'foreign', 'from', 'full', 'group', 'having',
  'if', 'ilike', 'in', 'index', 'inner', 'insert', 'intersect', 'into', 'is', 'join', 'lateral',
  'left', 'like', 'limit', 'not', 'null', 'offset', 'on', 'or', 'order', 'outer', 'over', 'partition',
  'primary', 'references', 'returning', 'right', 'rollback', 'row', 'rows', 'select', 'set', 'table',
  'then', 'true', 'truncate', 'union', 'unique', 'update', 'using', 'values', 'view', 'when', 'where',
  'window', 'with'
])

/** Produces escaped markup for the lightweight PostgreSQL editor overlay. */
export function highlightSql(source: string): string {
  let html = ''
  let index = 0
  while (index < source.length) {
    const rest = source.slice(index)
    const lineComment = rest.match(/^--[^\n]*/)
    const blockComment = rest.match(/^\/\*[\s\S]*?(?:\*\/|$)/)
    const dollarStart = rest.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
    const quoted = rest.match(/^(?:'(?:''|[^'])*'?|"(?:""|[^"])*"?)/)
    const number = rest.match(/^\b(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\b/i)
    const word = rest.match(/^[A-Za-z_][A-Za-z0-9_$]*/)

    if (lineComment || blockComment) {
      const value = (lineComment || blockComment)![0]
      html += span('comment', value); index += value.length; continue
    }
    if (dollarStart) {
      const tag = dollarStart[0]
      const closing = source.indexOf(tag, index + tag.length)
      const end = closing < 0 ? source.length : closing + tag.length
      html += span('string', source.slice(index, end)); index = end; continue
    }
    if (quoted) {
      const value = quoted[0]
      html += span(source[index] === '"' ? 'identifier' : 'string', value); index += value.length; continue
    }
    if (number) { html += span('number', number[0]); index += number[0].length; continue }
    if (word) {
      html += SQL_KEYWORDS.has(word[0].toLowerCase()) ? span('keyword', word[0]) : escapeHtml(word[0])
      index += word[0].length; continue
    }
    html += escapeHtml(source[index]!); index += 1
  }
  // A final newline needs an extra character to retain its height in a pre.
  return html + (source.endsWith('\n') ? ' ' : '')
}

export function currentSegmentMarkup(source: string, cursor: number): string {
  const segment = sqlSegmentAtCursor(source, cursor)
  if (!segment) return escapeHtml(source) + (source.endsWith('\n') ? ' ' : '')
  return `${escapeHtml(source.slice(0, segment.start))}<mark>${escapeHtml(source.slice(segment.start, segment.end))}</mark>${escapeHtml(source.slice(segment.end))}${source.endsWith('\n') ? ' ' : ''}`
}

function span(kind: string, value: string) {
  return `<span class="sql-${kind}">${escapeHtml(value)}</span>`
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}
