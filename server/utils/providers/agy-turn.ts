import { stripAnsi, visibleLines } from './screen-text'

export function isAgyTurnComplete(screen: string) {
  const stripped = stripAnsi(screen)
  if (/esc to cancel|esc to interrupt|generating\.\.\.|thinking\.\.\./i.test(stripped)) return false

  const lines = visibleLines(screen)
  const promptIndex = lines.findLastIndex((line) => (
    line.trimStart().startsWith('>') && !/^>\s*\d+[.)]/.test(line.trimStart())
  ))
  if (promptIndex < 0) return false

  const tail = lines.slice(promptIndex).join('\n').toLowerCase()
  if (/do you want|allow|deny|yes\/no|y\/n/.test(tail)) return false

  return tail.includes('? for shortcuts')
    || tail.includes('shortcuts')
    || tail.includes('antigravity')
    || /gemini.+\s*[·•]/i.test(tail)
    || promptIndex >= lines.length - 3
}
