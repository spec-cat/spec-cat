import { describe, expect, it } from 'vitest'
import { cleanTerminalTextForPreview, stripTerminalControlSequences, stripTerminalEscapeSequences } from '~/utils/terminalText'

describe('terminalText', () => {
  it('strips ANSI and OSC control sequences', () => {
    const value = '\x1b[33mhello\x1b[0m\x1b]10;rgb:d8d8/f3f3/dcdc\x1b\\ world'

    expect(stripTerminalControlSequences(value)).toBe('hello world')
  })

  it('strips persisted bare OSC color fragments', () => {
    const value = ']10;rgb:d8d8/f3f3/dcdc\\]11;rgb:0505/0808/0707done'

    expect(stripTerminalControlSequences(value)).toBe('done')
  })

  it('removes full escape sequences from terminal input while keeping control bytes', () => {
    // The query replies xterm sends through onData: cursor position, fg/bg
    // color, device attributes and focus events, followed by typed text and a
    // submit newline.
    const input = '\x1b[I\x1b[2;1R\x1b]10;rgb:d8d8/f3f3/dcdc\x1b\\\x1b]11;rgb:0505/0808/0707\x1b\\\x1b[?1;2chello\r'

    expect(stripTerminalEscapeSequences(input)).toBe('hello\r')
  })

  it('normalizes preview whitespace after stripping terminal controls', () => {
    const value = '\x1b[36mhello\r\n  world\x1b[0m'

    expect(cleanTerminalTextForPreview(value)).toBe('hello world')
  })
})
