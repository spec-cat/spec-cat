import { stripAnsi, visibleLines } from './screen-text'

export function isCodexTurnComplete(screen: string) {
  // Codex shows "Esc to interrupt" in its status line while a turn runs,
  // even though the › prompt stays visible.
  if (/esc to interrupt/i.test(stripAnsi(screen))) return false

  const lines = visibleLines(screen)
  const promptIndex = lines.findLastIndex((line) => line.startsWith('›'))
  if (promptIndex < 0) return false

  const tail = lines.slice(promptIndex, promptIndex + 4).join('\n')
  return /gpt-.+[·•]|openai codex|\/model to change|yolo mode/i.test(tail)
}
