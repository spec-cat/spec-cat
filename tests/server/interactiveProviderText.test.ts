import { describe, expect, it } from 'vitest'
import { stripTuiChrome } from '~/server/utils/interactiveProviderText'

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
})
