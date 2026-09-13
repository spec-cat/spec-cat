import { describe, expect, test } from 'bun:test'
import {
  clampTerminalDimension,
  encodeTerminalControl,
  normalizeTerminalSessionId,
  parseTerminalMessage,
  sanitizeTmuxName
} from '../server/utils/terminal-protocol'
import type { TerminalMessage } from '../types/terminal'

describe('terminal websocket protocol contracts', () => {
  test('keeps raw terminal input out of the JSON control protocol', () => {
    expect(parseTerminalMessage('hello')).toBeNull()
    expect(parseTerminalMessage('{broken')).toBeNull()
  })

  test('parses attach, resize, submit, and input payloads without rewriting them', () => {
    const messages: TerminalMessage[] = [
      { type: 'attach', sessionId: 'conv-12345678', provider: 'codex', cols: 101, rows: 31 },
      { type: 'resize', cols: 80, rows: 24 },
      { type: 'submit', data: 'line one\n유니코드' },
      { type: 'input', data: '\r' }
    ]
    for (const message of messages) {
      expect(parseTerminalMessage(JSON.stringify(message))).toEqual(message)
    }
  })

  test('preserves the NUL-prefixed control frame contract', () => {
    expect(encodeTerminalControl({ type: 'hello' })).toBe('\x00{"type":"hello"}')
    expect(encodeTerminalControl({ type: 'attached', sessionId: 'conv-12345678' }))
      .toBe('\x00{"type":"attached","sessionId":"conv-12345678"}')
  })

  test('keeps dimension and identifier boundaries stable', () => {
    expect(clampTerminalDimension(7, 100)).toBe(8)
    expect(clampTerminalDimension(241, 100)).toBe(240)
    expect(clampTerminalDimension(80.9, 100)).toBe(80)
    expect(clampTerminalDimension(undefined, 100)).toBe(100)
    expect(normalizeTerminalSessionId('conv-12345678')).toBe('conv-12345678')
    expect(normalizeTerminalSessionId('../unsafe')).toBeNull()
    expect(sanitizeTmuxName('codex:web/one')).toBe('codex_web_one')
  })
})
