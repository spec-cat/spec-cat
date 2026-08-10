import { describe, expect, test } from 'bun:test'
import { AUTO_TITLE_MAX_LENGTH, summarizePromptTitle } from '../server/utils/session-store'

describe('summarizePromptTitle', () => {
  test('returns the prompt as-is when it is short', () => {
    expect(summarizePromptTitle('Fix the login redirect bug')).toBe('Fix the login redirect bug')
  })

  test('collapses whitespace and newlines into single spaces', () => {
    expect(summarizePromptTitle('  Fix\n\nthe   login\tredirect  ')).toBe('Fix the login redirect')
  })

  test('returns empty string for blank prompts', () => {
    expect(summarizePromptTitle('')).toBe('')
    expect(summarizePromptTitle('   \n\t ')).toBe('')
  })

  test('clips long prompts to the title budget with an ellipsis', () => {
    const long = 'a'.repeat(AUTO_TITLE_MAX_LENGTH * 2)
    const title = summarizePromptTitle(long)
    expect(title.length).toBe(AUTO_TITLE_MAX_LENGTH)
    expect(title.endsWith('…')).toBe(true)
    expect(title.startsWith('a'.repeat(AUTO_TITLE_MAX_LENGTH - 1))).toBe(true)
  })

  test('keeps prompts exactly at the budget untouched', () => {
    const exact = 'b'.repeat(AUTO_TITLE_MAX_LENGTH)
    expect(summarizePromptTitle(exact)).toBe(exact)
  })
})
