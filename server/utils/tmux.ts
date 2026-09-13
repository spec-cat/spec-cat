import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
export const TMUX_BIN = process.env.TMUX_BIN || 'tmux'

export async function hasTmuxSession(name: string): Promise<boolean> {
  try {
    await execFileAsync(TMUX_BIN, ['has-session', '-t', name])
    return true
  } catch {
    return false
  }
}

export async function captureTmuxPane(name: string, preserveEscapes = false): Promise<string> {
  try {
    const args = ['capture-pane']
    if (preserveEscapes) args.push('-e')
    args.push('-p', '-t', name)
    const { stdout } = await execFileAsync(TMUX_BIN, args)
    return stdout
  } catch {
    return ''
  }
}

export async function terminateTmuxSession(name: string): Promise<void> {
  await execFileAsync(TMUX_BIN, ['kill-session', '-t', name]).then(() => undefined).catch(() => undefined)
}

/** Stops tmux while ignoring only the expected already-gone conditions. */
export async function terminateTmuxSessionChecked(name: string): Promise<void> {
  try {
    await execFileAsync(TMUX_BIN, ['kill-session', '-t', name])
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    if (!/no server running|can't find session|session not found/i.test(details)) {
      throw new Error(`Failed to stop terminal session: ${details}`)
    }
  }
}

export async function configureTmuxTerminal(name: string): Promise<void> {
  await execFileAsync(TMUX_BIN, ['set-option', '-t', name, 'mouse', 'on']).catch(() => {})
  await execFileAsync(TMUX_BIN, ['set-option', '-w', '-t', name, 'window-size', 'latest']).catch(() => {})
}

export async function ensureTmuxSession(
  name: string,
  cwd: string,
  getCommand: () => string | Promise<string>
): Promise<boolean> {
  const exists = await hasTmuxSession(name)
  if (!exists) {
    await execFileAsync(TMUX_BIN, [
      'new-session', '-d', '-s', name, '-c', cwd, await getCommand()
    ])
  }
  await configureTmuxTerminal(name)
  return !exists
}
