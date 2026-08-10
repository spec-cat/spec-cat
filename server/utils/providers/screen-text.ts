/**
 * Normalizes a tmux `capture-pane` screen before the turn heuristics read it.
 *
 * A pane captured with `-e` keeps its SGR sequences, so the prompt glyph is no
 * longer the first character of its line (`ESC[0;1m›ESC[0m …`) and a status
 * phrase can be split by a color change mid-sentence. Both break the anchored
 * checks in claude-turn.ts / codex-turn.ts, which then report "turn running"
 * forever and strand the turn-end auto-commit. Stripping the escapes here keeps
 * every caller correct regardless of how the screen was captured.
 */

// CSI sequences (colors, cursor moves), OSC strings (title, hyperlinks), and
// bare two-character escapes. Built from a string so no raw control character
// has to live in the source.
const ANSI_PATTERN = new RegExp(
  [
    '\\u001b\\[[0-9;:?]*[ -/]*[@-~]',
    '\\u001b\\][\\s\\S]*?(?:\\u0007|\\u001b\\\\)',
    '\\u001b[@-Z\\\\-_]'
  ].join('|'),
  'g'
)

export function stripAnsi(screen: string) {
  return screen.replace(ANSI_PATTERN, '')
}

/** Non-empty, trimmed, escape-free lines of a captured screen. */
export function visibleLines(screen: string) {
  return stripAnsi(screen)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}
