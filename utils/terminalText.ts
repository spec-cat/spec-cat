const OSC_PATTERN = /\x1B\][\s\S]*?(?:\x07|\x1B\\)/g
const CSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g
const ESC_STRING_PATTERN = /\x1B[PX^_][\s\S]*?\x1B\\/g
const ESC_SINGLE_PATTERN = /\x1B[@-Z\\-_]/g

// Some terminal OSC color responses can be persisted after the ESC byte has
// already been stripped, leaving fragments like "]10;rgb:ffff/ffff/ffff".
const BARE_OSC_RGB_PATTERN = /\\?\](?:10|11|12|13|14|15|16|17|18|19|4;\d+);rgb:[0-9a-fA-F]{1,4}(?:\/[0-9a-fA-F]{1,4}){2}(?:\x07|\\)?/g

// Strips full escape sequences (OSC/CSI/etc.) but preserves lone control bytes
// such as \r, \n, \b, DEL and Ctrl-C. Use this on raw terminal *input* where
// those control bytes still carry meaning (line submit, backspace, interrupt).
export function stripTerminalEscapeSequences(value: string): string {
  return value
    .replace(OSC_PATTERN, '')
    .replace(ESC_STRING_PATTERN, '')
    .replace(CSI_PATTERN, '')
    .replace(ESC_SINGLE_PATTERN, '')
    .replace(BARE_OSC_RGB_PATTERN, '')
}

export function stripTerminalControlSequences(value: string): string {
  return stripTerminalEscapeSequences(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

export function cleanTerminalTextForPreview(value: string): string {
  return stripTerminalControlSequences(value)
    .replace(/\s+/g, ' ')
    .trim()
}
