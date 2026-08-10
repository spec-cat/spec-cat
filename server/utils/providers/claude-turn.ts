import { stripAnsi, visibleLines } from './screen-text'

export function isClaudeTurnComplete(screen: string) {
  // While a turn runs, the status line above the input box shows
  // "(esc to interrupt)" even though the ❯ prompt stays visible.
  if (/esc to interrupt/i.test(stripAnsi(screen))) return false

  const lines = visibleLines(screen)
  const promptIndex = lines.findLastIndex((line) => (
    line.startsWith('❯') && !/^❯\s*\d+[.)]/.test(line)
  ))
  if (promptIndex < 0) return false

  const tail = lines.slice(promptIndex).join('\n').toLowerCase()
  if (/do you want|allow|deny|esc to cancel|yes\/no|y\/n/.test(tail)) return false

  return tail.includes('shortcuts')
    || tail.includes('manual mode')
    || tail.includes('accept edits')
    || tail.includes('bypass permissions')
    || promptIndex >= lines.length - 3
}
