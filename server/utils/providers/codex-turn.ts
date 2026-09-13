import { stripAnsi, visibleLines } from './screen-text'

export function isCodexTurnComplete(screen: string) {
  const stripped = stripAnsi(screen)
  // Codex shows "Esc to interrupt" in its status line while a turn runs,
  // even though the › prompt stays visible.
  if (/esc to interrupt/i.test(stripped)) return false

  const lines = visibleLines(screen)
  const promptIndex = lines.findLastIndex((line) => line.startsWith('›'))
  if (promptIndex < 0) return false

  const tail = lines.slice(promptIndex, promptIndex + 4).join('\n')
  // Only inspect the live region at and below the latest prompt. Historical
  // approval text above it must not keep a later idle turn marked as running.
  if (/press enter to confirm|enter to submit (?:answer|all)|allow command\?|\[y\/n\]|yes \(y\)/i.test(tail)) {
    return false
  }
  // Codex's transcript viewer retains the prompt chrome, but it is not an
  // actionable idle prompt. Preserve the previous state until it closes.
  if (/↑\/↓ to scroll|pgup\/pgdn to|home\/end to jump|q to quit/i.test(tail)) return false
  return /gpt-.+[·•]|openai codex|\/model to change|yolo mode/i.test(tail)
}
