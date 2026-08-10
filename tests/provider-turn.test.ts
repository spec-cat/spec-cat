import { describe, expect, test } from 'bun:test'
import { isClaudeTurnComplete } from '../server/utils/providers/claude-turn'
import { isCodexTurnComplete } from '../server/utils/providers/codex-turn'

describe('provider turn completion', () => {
  test('recognizes idle Claude and Codex prompts', () => {
    expect(isClaudeTurnComplete('Done\n❯\nshortcuts')).toBe(true)
    expect(isCodexTurnComplete('›\ngpt-5 · normal')).toBe(true)
  })

  test('recognizes an ANSI-decorated Codex prompt captured by tmux', () => {
    const screen = [
      '\u001b[0;1m›\u001b[0m \u001b[2mExplain this codebase\u001b[0m',
      '',
      '  \u001b[38;2;246;226;183mgpt-5.6-sol low\u001b[2m\u001b[39m · \u001b[0m/tmp/worktree'
    ].join('\n')

    expect(isCodexTurnComplete(screen)).toBe(true)
  })

  test('does not treat permission prompts as completed Claude turns', () => {
    expect(isClaudeTurnComplete('Do you want to allow this command?\n❯ yes/no')).toBe(false)
  })

  test('does not treat running turns as complete while esc-to-interrupt is shown', () => {
    expect(isClaudeTurnComplete('✻ Thinking… (esc to interrupt)\n❯\nshortcuts')).toBe(false)
    expect(isCodexTurnComplete('▌ Working (Esc to interrupt)\n›\ngpt-5 · normal')).toBe(false)
    expect(isCodexTurnComplete(
      '\u001b[1m• Working\u001b[0m \u001b[2m(0s • esc to interrupt)\u001b[0m\n'
      + '\u001b[0;1m›\u001b[0m\n'
      + '  \u001b[38;2;246;226;183mgpt-5.6-sol low\u001b[0m · /tmp/worktree'
    )).toBe(false)
  })
})
