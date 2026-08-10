import { describe, expect, test } from 'bun:test'
import { extractSessionPreview } from '../server/utils/session-preview'

describe('extractSessionPreview', () => {
  test('returns the last content line without ANSI sequences', () => {
    const raw = '\x1b[2J\x1b[1;1HHello world\r\n\x1b[32mDone editing the file\x1b[0m\r\n'
    expect(extractSessionPreview(raw)).toBe('Done editing the file')
  })

  test('skips prompt-only and chrome lines', () => {
    const raw = 'Implemented the feature\r\n❯ \r\n? for shortcuts · bypass permissions\r\n'
    expect(extractSessionPreview(raw)).toBe('Implemented the feature')
  })

  test('strips box drawing characters', () => {
    const raw = '│ The answer is 42 │\r\n╰──────╯\r\n'
    expect(extractSessionPreview(raw)).toBe('The answer is 42')
  })

  test('truncates long lines to 80 characters', () => {
    const raw = `${'a'.repeat(120)}\r\n`
    const preview = extractSessionPreview(raw)
    expect(preview.length).toBe(80)
    expect(preview.endsWith('...')).toBe(true)
  })

  test('returns empty string when nothing is readable', () => {
    expect(extractSessionPreview('\x1b[2J❯ \r\n── ──\r\n')).toBe('')
  })
})
