/**
 * Text helpers for scraping a delimited response out of an interactive
 * provider's PTY output. Kept separate from interactiveProviderQuery so the
 * (node-pty-free) parsing logic can be unit-tested in isolation.
 */

export function normalizeScrapedTerminalText(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/**
 * Remove full-screen TUI chrome (composer line, footer status bar, panel
 * borders, banner leftovers) that a provider like Codex continuously redraws
 * via cursor positioning. After ANSI stripping those redraws flatten into the
 * marker region and otherwise pollute the scraped message. None of these
 * patterns can legitimately appear in a commit message.
 */
export function stripTuiChrome(text: string): string {
  return normalizeScrapedTerminalText(text)
    .split('\n')
    .map(line => line.replace(/\s+$/, ''))
    .filter((line) => {
      const t = line.trim()
      if (!t) return true // keep blank lines so a real body keeps its spacing
      // Composer input line / placeholder hint (e.g. "›Write tests for @file").
      if (/^[›❯]/.test(t)) return false
      // Footer status bar: "<model> <effort> · <cwd>".
      if (/\s·\s/.test(t)) return false
      // Panel/banner borders.
      if (/^[\s─━│┃┌┐└┘├┤┬┴┼╭╮╯╰╔╗╚╝═║▏▕]+$/.test(t)) return false
      // Startup banner leftovers.
      if (/^(model|directory|permissions):\s/i.test(t)) return false
      if (/OpenAI Codex|\/model to change|YOLO mode/i.test(t)) return false
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
