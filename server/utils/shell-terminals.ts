import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { projectDir, projectKey } from './project-dir'

const execFileAsync = promisify(execFile)

const TMUX_BIN = process.env.TMUX_BIN || 'tmux'

/**
 * tmux name prefix for this project's shells. The project key namespaces the
 * global tmux server so one instance never lists or kills another project's
 * shell sessions.
 */
function shellPrefix(): string {
  return `shell-web-${projectKey()}-`
}

export type ShellSessionInfo = {
  id: string
  tmuxName: string
  createdAt: number
}

/** Where new plain shells are rooted: the repository main checkout. */
export function shellRootDirectory(): string {
  return projectDir()
}

/** The interactive login shell to launch inside the tmux session. */
export function shellCommand(): string {
  return process.env.SHELL || '/bin/bash'
}

export function shellTmuxName(id: string): string {
  return `${shellPrefix()}${id}`
}

function sanitizeShellId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}

export function normalizeShellId(value?: string): string | null {
  if (!value) return null
  if (!/^[a-zA-Z0-9_-]{4,120}$/.test(value)) return null
  return value
}

function generateShellId(): string {
  return `sh-${Math.random().toString(36).slice(2, 12)}`
}

export async function listShellSessions(): Promise<ShellSessionInfo[]> {
  let stdout = ''
  try {
    const result = await execFileAsync(TMUX_BIN, [
      'list-sessions',
      '-F',
      '#{session_name}\t#{session_created}'
    ])
    stdout = result.stdout
  } catch {
    // No tmux server running yet means no shells exist.
    return []
  }

  const prefix = shellPrefix()
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix))
    .map((line) => {
      const [name, created] = line.split('\t')
      const tmuxName = name!.trim()
      return {
        id: tmuxName.slice(prefix.length),
        tmuxName,
        createdAt: Number(created) * 1000 || 0
      }
    })
    .filter((session) => session.id.length > 0)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export async function hasShellSession(tmuxName: string): Promise<boolean> {
  try {
    await execFileAsync(TMUX_BIN, ['has-session', '-t', tmuxName])
    return true
  } catch {
    return false
  }
}

/**
 * Ensures the tmux session backing a shell exists, creating it with an
 * interactive shell rooted at the project directory when missing. Returns
 * true when a new tmux session was created.
 */
export async function ensureShellSession(tmuxName: string): Promise<boolean> {
  const exists = await hasShellSession(tmuxName)
  if (!exists) {
    await execFileAsync(TMUX_BIN, [
      'new-session',
      '-d',
      '-s',
      tmuxName,
      '-c',
      shellRootDirectory(),
      shellCommand()
    ])
  }

  // The web client attaches through tmux's alternate screen, so wheel
  // scrolling and window sizing must be handled by tmux, mirroring the
  // conversation terminals.
  await execFileAsync(TMUX_BIN, ['set-option', '-t', tmuxName, 'mouse', 'on']).catch(() => {})
  await execFileAsync(TMUX_BIN, ['set-option', '-w', '-t', tmuxName, 'window-size', 'latest']).catch(() => {})

  return !exists
}

export async function createShellSession(): Promise<ShellSessionInfo> {
  const id = generateShellId()
  const tmuxName = shellTmuxName(id)
  await ensureShellSession(tmuxName)
  return { id, tmuxName, createdAt: Date.now() }
}

export async function killShellSession(id: string): Promise<void> {
  const tmuxName = shellTmuxName(sanitizeShellId(id))
  await execFileAsync(TMUX_BIN, ['kill-session', '-t', tmuxName]).catch(() => {})
}
