import type { SpecChunk } from '~/types/specSearch'

const TARGET_MIN_LINES = 15
const TARGET_MAX_LINES = 60
const OVERSIZED_LINES = 80

interface HeadingState {
  h2: string | null
  h3: string | null
}

function extractTags(content: string, pattern: RegExp): string[] {
  const out = new Set<string>()
  for (const match of content.matchAll(pattern)) {
    if (match[0]) out.add(match[0])
  }
  return [...out]
}

function splitOversizedBlock(lines: string[]): string[][] {
  if (lines.length <= OVERSIZED_LINES) return [lines]

  const chunks: string[][] = []
  let cursor = 0

  while (cursor < lines.length) {
    let end = Math.min(cursor + TARGET_MAX_LINES, lines.length)
    if (end < lines.length) {
      for (let i = end; i > cursor + TARGET_MIN_LINES; i--) {
        if (lines[i - 1]?.trim() === '') {
          end = i
          break
        }
      }
    }
    chunks.push(lines.slice(cursor, end))
    cursor = end
  }

  return chunks
}

export function chunkMarkdown(sourcePath: string, content: string): SpecChunk[] {
  const fileType = sourcePath.split('/').pop() ?? 'unknown.md'
  const featureId = sourcePath.split('/').find((part) => /^\d+-.+/.test(part)) ?? 'unknown-feature'
  const lines = content.split(/\r?\n/)

  const chunks: SpecChunk[] = []
  const heading: HeadingState = { h2: null, h3: null }

  let currentLines: string[] = []
  let currentStart = 1

  const flush = (lineNumber: number) => {
    if (currentLines.length === 0) return

    for (const piece of splitOversizedBlock(currentLines)) {
      if (piece.join('\n').trim().length === 0) continue
      const pieceStart = currentStart
      const pieceEnd = Math.min(lineNumber - 1, pieceStart + piece.length - 1)
      const text = piece.join('\n').trim()

      chunks.push({
        sourcePath,
        featureId,
        fileType,
        headingHierarchy: [heading.h2, heading.h3].filter((v): v is string => Boolean(v)),
        content: text,
        lineStart: pieceStart,
        lineEnd: pieceEnd,
        frTags: extractTags(text, /FR-\d{3}[a-z]?/g),
        taskTags: extractTags(text, /T\d{3}/g),
      })

      currentStart = pieceEnd + 1
    }

    currentLines = []
  }

  lines.forEach((line, index) => {
    const lineNo = index + 1
    const h2 = line.match(/^##\s+(.+)$/)
    const h3 = line.match(/^###\s+(.+)$/)

    if (h2 || h3) {
      flush(lineNo)
      currentStart = lineNo
      if (h2) {
        heading.h2 = h2[1].trim()
        heading.h3 = null
      }
      if (h3) {
        heading.h3 = h3[1].trim()
      }
    }

    currentLines.push(line)
  })

  flush(lines.length + 1)

  if (chunks.length === 0) {
    return [{
      sourcePath,
      featureId,
      fileType,
      headingHierarchy: [],
      content,
      lineStart: 1,
      lineEnd: lines.length,
      frTags: extractTags(content, /FR-\d{3}[a-z]?/g),
      taskTags: extractTags(content, /T\d{3}/g),
    }]
  }

  return chunks
}
