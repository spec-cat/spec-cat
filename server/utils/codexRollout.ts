/**
 * Codex rollout lookup.
 *
 * The interactive Codex TUI (used by the terminal session path) does not emit a
 * machine-readable session-start event on its process stream, so we cannot read
 * the session id off that stream. Codex still persists a rollout file per
 * session under `~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-<ts>-<uuid>.jsonl`,
 * whose first line is a `session_meta` record carrying the working directory.
 *
 * This module maps a terminal worktree cwd to the newest matching rollout so the
 * terminal path can persist the session id and later `codex resume <id>`.
 */
import { existsSync, openSync, readSync, closeSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ROLLOUT_FILENAME_RE = /^rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i
const CWD_RE = /"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/
const HEAD_BYTES = 8192

function getCodexSessionsDir(): string {
  const home = (typeof process.env.CODEX_HOME === 'string' && process.env.CODEX_HOME.length > 0)
    ? process.env.CODEX_HOME
    : join(process.env.HOME || homedir(), '.codex')
  return join(home, 'sessions')
}

function readRolloutCwd(filePath: string): string | null {
  let fd: number | null = null
  try {
    fd = openSync(filePath, 'r')
    const buffer = Buffer.alloc(HEAD_BYTES)
    const bytesRead = readSync(fd, buffer, 0, HEAD_BYTES, 0)
    const head = buffer.toString('utf-8', 0, bytesRead)
    const match = CWD_RE.exec(head)
    if (!match) return null
    // Undo JSON string escaping for the captured path.
    try {
      return JSON.parse(`"${match[1]}"`) as string
    } catch {
      return match[1]
    }
  } catch {
    return null
  } finally {
    if (fd !== null) {
      try { closeSync(fd) } catch { /* ignore */ }
    }
  }
}

/**
 * Returns the session id (UUID) of the most recently modified Codex rollout whose
 * recorded cwd matches `cwd` and whose file mtime is at or after `afterMs`.
 * Returns null when no matching rollout exists yet.
 */
export function findLatestCodexSessionIdForCwd(cwd: string, afterMs: number): string | null {
  const root = getCodexSessionsDir()
  if (!existsSync(root)) return null

  const candidates: { path: string; id: string; mtime: number }[] = []

  const walk = (dir: string, depth: number) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        // Codex partitions rollouts as <YYYY>/<MM>/<DD>/; allow one extra level
        // of nesting so a layout tweak doesn't silently hide newer sessions.
        if (depth < 4) walk(fullPath, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      const match = ROLLOUT_FILENAME_RE.exec(entry.name)
      if (!match) continue
      let mtime: number
      try {
        mtime = statSync(fullPath).mtimeMs
      } catch {
        continue
      }
      if (mtime + 1 < afterMs) continue
      candidates.push({ path: fullPath, id: match[1], mtime })
    }
  }

  walk(root, 0)
  candidates.sort((a, b) => b.mtime - a.mtime)

  for (const candidate of candidates) {
    if (readRolloutCwd(candidate.path) === cwd) {
      return candidate.id
    }
  }
  return null
}
