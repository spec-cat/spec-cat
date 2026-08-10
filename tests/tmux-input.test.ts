import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Prompt submission is exercised against a fake `tmux` that records every
 * invocation (argv, and stdin for `load-buffer`) into a log file, so the
 * delivery path can be asserted without a terminal.
 *
 * The prompt must be pasted, never typed with `send-keys -l`: a large payload
 * pushed through the pane's input queue stops arriving partway (Codex drains it
 * too slowly), leaving a truncated prompt that is never submitted.
 */
let workDir = ''
let logPath = ''
let submitPromptTurn: (tmuxName: string, prompt: string) => Promise<void>

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'tmux-input-test-'))
  logPath = join(workDir, 'calls.log')
  const fakeTmux = join(workDir, 'tmux')
  await writeFile(
    fakeTmux,
    [
      '#!/bin/sh',
      `echo "ARGS $*" >> "${logPath}"`,
      'if [ "$1" = "load-buffer" ]; then',
      `  { printf "STDIN "; cat; printf "\\n"; } >> "${logPath}"`,
      'fi',
      'exit 0'
    ].join('\n')
  )
  await chmod(fakeTmux, 0o755)

  // TMUX_BIN is read when the module loads, so it must be set before import.
  process.env.TMUX_BIN = fakeTmux
  ;({ submitPromptTurn } = await import('../server/utils/tmux-input'))
})

afterAll(async () => {
  delete process.env.TMUX_BIN
  await rm(workDir, { recursive: true, force: true })
})

describe('submitPromptTurn', () => {
  test('pastes the prompt through a tmux buffer and then submits it', async () => {
    const prompt = ['Diff (may be truncated):', '+ '.padEnd(12 * 1024, 'x'), 'Write a commit message.'].join('\n')
    await submitPromptTurn('query-session', prompt)

    const log = await readFile(logPath, 'utf8')
    const args = log
      .split('\n')
      .filter((line) => line.startsWith('ARGS '))
      .map((line) => line.slice('ARGS '.length))

    // The whole prompt is handed to tmux in one write, not typed as keys.
    expect(log).toContain(`STDIN ${prompt}`)
    expect(args.some((line) => line.includes('send-keys') && line.includes('-l'))).toBe(false)

    const bufferName = /load-buffer -b (\S+) -/.exec(args[0] || '')?.[1]
    expect(bufferName).toBeTruthy()
    // Bracketed (-p) so embedded newlines stay newlines instead of submitting
    // the prompt line by line, and dropped (-d) once pasted.
    expect(args[1]).toBe(`paste-buffer -d -p -b ${bufferName} -t query-session`)
    // Enter is a separate key press, after the paste has landed.
    expect(args[2]).toBe('send-keys -t query-session Enter')
  })
})
