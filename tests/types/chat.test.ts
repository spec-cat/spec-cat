import { describe, expect, it } from 'vitest'
import { generateConversationTitle, sanitizeConversationTitle } from '~/types/chat'

describe('sanitizeConversationTitle', () => {
  it('removes ANSI escape and bare terminal control sequences', () => {
    const title = '\u001B[O\u001B[?1;2c\u001B[I취소됐을때도 teams 알림 보내줘 배송접..'

    expect(sanitizeConversationTitle(title)).toBe('취소됐을때도 teams 알림 보내줘 배송접..')
  })

  it('removes non-renderable control and invisible formatting characters', () => {
    expect(sanitizeConversationTitle('hello\u0007\u202E world\u0000')).toBe('hello world')
  })

  it('preserves normal punctuation and Korean text', () => {
    expect(sanitizeConversationTitle('[FR-001] 취소 알림: Teams')).toBe('[FR-001] 취소 알림: Teams')
  })
})

describe('generateConversationTitle', () => {
  it('sanitizes generated titles before truncating', () => {
    expect(generateConversationTitle('\u001B[?1;2c[I취소됐을때도 teams 알림 보내줘')).toBe('취소됐을때도 teams 알림 보내줘')
  })
})
