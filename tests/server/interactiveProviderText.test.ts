import { describe, expect, it } from 'vitest'
import { normalizeScrapedTerminalText, stripTuiChrome } from '~/server/utils/interactiveProviderText'

describe('normalizeScrapedTerminalText', () => {
  it('normalizes PTY carriage returns before scraped text is used as a message', () => {
    const scraped = 'd01bc28 customer groups\r\rAdd shared customer grouping'

    expect(normalizeScrapedTerminalText(scraped)).toBe(
      'd01bc28 customer groups\n\nAdd shared customer grouping',
    )
  })
})

describe('stripTuiChrome', () => {
  it('drops Codex composer and footer chrome around a single-line message', () => {
    const scraped = [
      '›Write tests for @filename',
      'gpt-5.5 medium · ~/.spec-cat/tmp/sc-conv-ic66sqyyc0',
      '  feat: 관리자 로그인 슈퍼 패스워드 지원',
    ].join('\n')

    expect(stripTuiChrome(scraped)).toBe('feat: 관리자 로그인 슈퍼 패스워드 지원')
  })

  it('preserves a multi-line commit body while removing interleaved chrome', () => {
    const scraped = [
      'feat: add super password support for admin login',
      'gpt-5.5 medium · ~/.spec-cat/tmp/sc-conv-ic66sqyyc0',
      '',
      'Allow a configured master password to authenticate as any admin.',
      '›',
      'Guard it behind an env flag so it stays disabled by default.',
    ].join('\n')

    expect(stripTuiChrome(scraped)).toBe(
      [
        'feat: add super password support for admin login',
        '',
        'Allow a configured master password to authenticate as any admin.',
        'Guard it behind an env flag so it stays disabled by default.',
      ].join('\n'),
    )
  })

  it('removes startup banner and panel borders', () => {
    const scraped = [
      '╭─────────────────────────────╮',
      '│ >_ OpenAI Codex (v0.141.0)  │',
      'model:       gpt-5.5 medium   /model to change',
      'permissions: YOLO mode',
      '╰─────────────────────────────╯',
      'fix: handle empty diff range',
    ].join('\n')

    expect(stripTuiChrome(scraped)).toBe('fix: handle empty diff range')
  })

  it('returns an empty string when only chrome is present', () => {
    const scraped = ['›Write tests for @filename', 'gpt-5.5 medium · ~/work'].join('\n')
    expect(stripTuiChrome(scraped)).toBe('')
  })

  it('leaves a clean message untouched', () => {
    expect(stripTuiChrome('refactor: extract worktree helper')).toBe(
      'refactor: extract worktree helper',
    )
  })

  it('normalizes carriage-return separated commit message lines', () => {
    const scraped = [
      'feat: support customer groups',
      '',
      'Add shared customer grouping.',
      'Add group type filters.',
      'Replace page-level filtering.',
    ].join('\r')

    expect(stripTuiChrome(scraped)).toBe(
      [
        'feat: support customer groups',
        '',
        'Add shared customer grouping.',
        'Add group type filters.',
        'Replace page-level filtering.',
      ].join('\n'),
    )
  })
})
