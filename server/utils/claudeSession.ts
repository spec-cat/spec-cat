/**
 * Claude session lookup.
 *
 * The interactive Claude CLI (used by the terminal session path) does not emit a
 * JSON session-init event we can read off the PTY stream, but it persists each
 * session as `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`. The
 * directory name is the working directory with `/` and `.` replaced by `-`, and
 * the file's basename is the session id usable with `claude --resume <id>`.
 *
 * This maps a terminal worktree cwd to the newest session file so the terminal
 * path can persist the session id and later resume the same conversation.
 */
import { existsSync, openSync, readSync, closeSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SESSION_FILENAME_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i
const CWD_RE = /"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/
const HEAD_BYTES = 8192

function getClaudeProjectsDir(): string {
  const home = (typeof process.env.CLAUDE_CONFIG_DIR === 'string' && process.env.CLAUDE_CONFIG_DIR.length > 0)
    ? process.env.CLAUDE_CONFIG_DIR
    : join(process.env.HOME || homedir(), '.claude')
  return join(home, 'projects')
}

/** Claude encodes a project cwd into a directory name by replacing `/` and `.` with `-`. */
export function encodeClaudeProjectDir(cwd: string): string {
  return cwd.replace(/[/.]/g, '-')
}

function readSessionCwd(filePath: string): string | null {
  let fd: number | null = null
  try {
    fd = openSync(filePath, 'r')
    const buffer = Buffer.alloc(HEAD_BYTES)
    const bytesRead = readSync(fd, buffer, 0, HEAD_BYTES, 0)
    const head = buffer.toString('utf-8', 0, bytesRead)
    const match = CWD_RE.exec(head)
    if (!match) return null
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

interface SessionCandidate {
  path: string
  id: string
  mtime: number
}

/** Collect session-file candidates in `dir` (non-recursive) at/after `afterMs`. */
function collectCandidatesInDir(dir: string, afterMs: number): SessionCandidate[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const candidates: SessionCandidate[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const match = SESSION_FILENAME_RE.exec(entry.name)
    if (!match) continue
    const fullPath = join(dir, entry.name)
    let mtime: number
    try {
      mtime = statSync(fullPath).mtimeMs
    } catch {
      continue
    }
    if (mtime + 1 < afterMs) continue
    candidates.push({ path: fullPath, id: match[1], mtime })
  }
  return candidates
}

/** Newest candidate whose recorded cwd strictly equals `cwd`, or null. */
function pickStrictMatch(candidates: SessionCandidate[], cwd: string): string | null {
  for (const candidate of [...candidates].sort((a, b) => b.mtime - a.mtime)) {
    if (readSessionCwd(candidate.path) === cwd) return candidate.id
  }
  return null
}

/**
 * Returns the session id (UUID) of the most recently modified Claude session for
 * `cwd` whose file mtime is at or after `afterMs`, or null when none exists yet.
 *
 * Preference order:
 *  1. A strict cwd match in the cwd-derived directory (the common, fast path).
 *  2. A strict cwd match found by scanning every project directory — this keeps
 *     resume working even if Claude's directory-encoding rule drifts, since we
 *     match on the recorded cwd rather than the derived directory name.
 *  3. As a last resort, the newest candidate in the derived directory whose cwd
 *     we couldn't read (best-effort), so a not-yet-flushed first line still
 *     resolves rather than failing outright.
 */
export function findLatestClaudeSessionIdForCwd(cwd: string, afterMs: number): string | null {
  const projectsDir = getClaudeProjectsDir()
  const derivedDir = join(projectsDir, encodeClaudeProjectDir(cwd))
  const derivedCandidates = existsSync(derivedDir)
    ? collectCandidatesInDir(derivedDir, afterMs)
    : []

  const strictLocal = pickStrictMatch(derivedCandidates, cwd)
  if (strictLocal) return strictLocal

  // Fall back to a recorded-cwd match anywhere under projects/, decoupling
  // resume from the exact directory-encoding rule.
  let projectDirs: string[] = []
  try {
    projectDirs = readdirSync(projectsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => join(projectsDir, entry.name))
      .filter(path => path !== derivedDir)
  } catch {
    projectDirs = []
  }
  for (const dir of projectDirs) {
    const strict = pickStrictMatch(collectCandidatesInDir(dir, afterMs), cwd)
    if (strict) return strict
  }

  // Last resort: an unreadable-cwd candidate in the derived directory only.
  const newestUnreadable = [...derivedCandidates]
    .sort((a, b) => b.mtime - a.mtime)
    .find(candidate => readSessionCwd(candidate.path) === null)
  return newestUnreadable ? newestUnreadable.id : null
}
