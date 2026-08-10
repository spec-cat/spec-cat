/**
 * Provider session resume.
 *
 * Neither interactive CLI emits a machine-readable session id on its PTY
 * stream, but both persist per-session transcripts on disk:
 *
 * - Claude writes `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`,
 *   where the directory name is the working directory with `/` and `.`
 *   replaced by `-` and the basename is usable with `claude --resume <id>`.
 * - Codex writes `~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-<ts>-<uuid>.jsonl`
 *   whose first line records the working directory, usable with
 *   `codex resume <id>`.
 *
 * This module maps a conversation worktree cwd to the newest matching session
 * file so terminal sessions can persist the provider session id and rebuild
 * the tmux launch command to resume the conversation after tmux dies.
 */
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ProviderId } from './session-store'

const CLAUDE_SESSION_FILENAME_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i
const CODEX_ROLLOUT_FILENAME_RE = /^rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i
const RESUME_SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CWD_RE = /"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/
const HEAD_BYTES = 8192

type SessionFileCandidate = {
  path: string
  id: string
  mtime: number
}

/**
 * Builds the shell command string a tmux session runs for `provider`. Without
 * a resume id this is the plain launch command; with one, the command resumes
 * the recorded provider session. Throws when the id is not a UUID so nothing
 * unexpected can reach the shell.
 */
export function buildProviderCommand(provider: ProviderId, resumeSessionId?: string | null): string {
  if (provider === 'codex') {
    const bin = process.env.CODEX_CLI_PATH || process.env.CODEX_BIN || 'codex'
    if (!resumeSessionId) return `${bin} --dangerously-bypass-approvals-and-sandbox`
    return `${bin} resume ${quoteResumeSessionId(resumeSessionId)} --dangerously-bypass-approvals-and-sandbox`
  }

  const bin = process.env.CLAUDE_BIN || 'claude'
  if (!resumeSessionId) return `${bin} --dangerously-skip-permissions`
  return `${bin} --resume ${quoteResumeSessionId(resumeSessionId)} --dangerously-skip-permissions`
}

/**
 * Builds the launch command for a throwaway one-shot query session. Claude is
 * started with an explicit `--session-id` so the transcript file the query
 * writes is known up front — resolving it by newest-mtime would race with any
 * other Claude session running in the same cwd. Codex has no equivalent flag,
 * so it launches plain and its rollout is found by exclusion instead.
 */
export function buildProviderQueryCommand(provider: ProviderId, claudeSessionId: string): string {
  if (provider === 'codex') return buildProviderCommand('codex')
  const bin = process.env.CLAUDE_BIN || 'claude'
  return `${bin} --session-id ${quoteResumeSessionId(claudeSessionId)} --dangerously-skip-permissions`
}

/** Claude encodes a project cwd into a directory name by replacing `/` and `.` with `-`. */
export function encodeClaudeProjectDir(cwd: string): string {
  return cwd.replace(/[/.]/g, '-')
}

/**
 * Returns the session id (UUID) of the most recently modified Claude session
 * for `cwd` whose file mtime is at or after `afterMs`, or null when none
 * exists yet.
 *
 * Preference order:
 *  1. A strict cwd match in the cwd-derived directory (the common, fast path).
 *  2. A strict cwd match found by scanning every project directory — this
 *     keeps resume working even if Claude's directory-encoding rule drifts,
 *     since we match on the recorded cwd rather than the derived name.
 *  3. As a last resort, the newest candidate in the derived directory whose
 *     cwd we could not read, so a not-yet-flushed first line still resolves.
 */
export async function findClaudeSessionId(cwd: string, afterMs: number): Promise<string | null> {
  const projectsDir = getClaudeProjectsDir()
  const derivedDir = join(projectsDir, encodeClaudeProjectDir(cwd))
  const derivedCandidates = await collectClaudeCandidates(derivedDir, afterMs)

  const strictLocal = await pickStrictCwdMatch(derivedCandidates, cwd)
  if (strictLocal) return strictLocal

  // Fall back to a recorded-cwd match anywhere under projects/, decoupling
  // resume from the exact directory-encoding rule.
  let projectDirs: string[] = []
  try {
    projectDirs = (await readdir(projectsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(projectsDir, entry.name))
      .filter((path) => path !== derivedDir)
  } catch {
    projectDirs = []
  }
  for (const dir of projectDirs) {
    const strict = await pickStrictCwdMatch(await collectClaudeCandidates(dir, afterMs), cwd)
    if (strict) return strict
  }

  // Last resort: an unreadable-cwd candidate in the derived directory only.
  for (const candidate of sortNewestFirst(derivedCandidates)) {
    if ((await readSessionFileCwd(candidate.path)) === null) return candidate.id
  }
  return null
}

/**
 * Returns the session id (UUID) of the most recently modified Codex rollout
 * whose recorded cwd matches `cwd` and whose file mtime is at or after
 * `afterMs`, or null when no matching rollout exists yet. Ids in `excludeIds`
 * are skipped, letting a caller that snapshotted the rollouts before a launch
 * find only the session that launch created.
 */
export async function findCodexSessionId(
  cwd: string,
  afterMs: number,
  excludeIds?: ReadonlySet<string>
): Promise<string | null> {
  let candidates = await collectCodexCandidates(getCodexSessionsDir(), afterMs)
  if (excludeIds?.size) {
    candidates = candidates.filter((candidate) => !excludeIds.has(candidate.id.toLowerCase()))
  }
  return pickStrictCwdMatch(candidates, cwd)
}

/** Lowercased ids of every Codex rollout currently on disk. */
export async function listCodexSessionIds(): Promise<Set<string>> {
  const candidates = await collectCodexCandidates(getCodexSessionsDir())
  return new Set(candidates.map((candidate) => candidate.id.toLowerCase()))
}

/** Collects Codex rollout candidates under `root`, optionally filtered by mtime. */
async function collectCodexCandidates(root: string, afterMs = 0): Promise<SessionFileCandidate[]> {
  const candidates: SessionFileCandidate[] = []

  // Codex partitions rollouts as <YYYY>/<MM>/<DD>/; allow one extra level of
  // nesting so a layout tweak does not silently hide newer sessions.
  const walk = async (dir: string, depth: number) => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < 4) await walk(fullPath, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      const id = CODEX_ROLLOUT_FILENAME_RE.exec(entry.name)?.[1]
      if (!id) continue
      const mtime = await getFileMtime(fullPath)
      if (mtime === null || mtime + 1 < afterMs) continue
      candidates.push({ path: fullPath, id, mtime })
    }
  }

  await walk(root, 0)
  return candidates
}

/**
 * Best-effort: reads the last agent message text from the Codex rollout for
 * `cwd`. Prefers the rollout whose filename carries `providerSessionId`;
 * otherwise the newest rollout whose recorded cwd matches. Returns undefined
 * when no rollout or no agent message is found.
 */
export async function readLastCodexAgentMessage(
  cwd: string,
  providerSessionId?: string
): Promise<string | undefined> {
  const candidates = await collectCodexCandidates(getCodexSessionsDir())

  let filePath: string | null = null
  if (providerSessionId && RESUME_SESSION_ID_RE.test(providerSessionId)) {
    filePath = candidates.find((c) => c.id.toLowerCase() === providerSessionId.toLowerCase())?.path ?? null
  }
  if (!filePath) {
    for (const candidate of sortNewestFirst(candidates)) {
      if ((await readSessionFileCwd(candidate.path)) === cwd) {
        filePath = candidate.path
        break
      }
    }
  }
  if (!filePath) return undefined

  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch {
    return undefined
  }
  const lines = raw.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim()
    if (!line) continue
    let entry: unknown
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    const text = extractCodexAgentText(entry)
    if (text) return text
  }
  return undefined
}

/**
 * Pulls the agent's text out of one Codex rollout line, covering the three
 * shapes a final message appears in: a `task_complete` event carrying
 * `last_agent_message`, an `agent_message` event, or an assistant `message`
 * response item with `output_text` content blocks.
 */
export function extractCodexAgentText(entry: unknown): string | undefined {
  if (!entry || typeof entry !== 'object') return undefined
  const payload = (entry as { payload?: unknown }).payload
  if (!payload || typeof payload !== 'object') return undefined
  const p = payload as {
    type?: unknown
    last_agent_message?: unknown
    message?: unknown
    role?: unknown
    content?: unknown
  }

  if (p.type === 'task_complete' && typeof p.last_agent_message === 'string') {
    return p.last_agent_message.trim() || undefined
  }
  if (p.type === 'agent_message' && typeof p.message === 'string') {
    return p.message.trim() || undefined
  }
  if (p.type === 'message' && p.role === 'assistant' && Array.isArray(p.content)) {
    const text = p.content
      .filter((block): block is { type: string; text: string } => (
        Boolean(block)
        && typeof block === 'object'
        && (block as { type?: unknown }).type === 'output_text'
        && typeof (block as { text?: unknown }).text === 'string'
      ))
      .map((block) => block.text)
      .join('\n')
      .trim()
    return text || undefined
  }
  return undefined
}

function quoteResumeSessionId(resumeSessionId: string): string {
  if (!RESUME_SESSION_ID_RE.test(resumeSessionId)) {
    throw new Error(`Invalid provider resume session id: ${JSON.stringify(resumeSessionId)}`)
  }
  // The UUID format excludes shell metacharacters; single quotes are a second
  // layer of defense for the `sh -c` invocation inside tmux.
  return `'${resumeSessionId}'`
}

function getClaudeProjectsDir(): string {
  const home = process.env.CLAUDE_CONFIG_DIR || join(process.env.HOME || homedir(), '.claude')
  return join(home, 'projects')
}

function getCodexSessionsDir(): string {
  const home = process.env.CODEX_HOME || join(process.env.HOME || homedir(), '.codex')
  return join(home, 'sessions')
}

/** Collect Claude session-file candidates in `dir` (non-recursive) at/after `afterMs`. */
async function collectClaudeCandidates(dir: string, afterMs: number): Promise<SessionFileCandidate[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const candidates: SessionFileCandidate[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const id = CLAUDE_SESSION_FILENAME_RE.exec(entry.name)?.[1]
    if (!id) continue
    const fullPath = join(dir, entry.name)
    const mtime = await getFileMtime(fullPath)
    if (mtime === null || mtime + 1 < afterMs) continue
    candidates.push({ path: fullPath, id, mtime })
  }
  return candidates
}

/** Newest candidate whose recorded cwd strictly equals `cwd`, or null. */
async function pickStrictCwdMatch(candidates: SessionFileCandidate[], cwd: string): Promise<string | null> {
  for (const candidate of sortNewestFirst(candidates)) {
    if ((await readSessionFileCwd(candidate.path)) === cwd) return candidate.id
  }
  return null
}

/** Extracts the recorded `"cwd"` value from the head of a session file. */
async function readSessionFileCwd(filePath: string): Promise<string | null> {
  let handle
  try {
    handle = await open(filePath, 'r')
    const buffer = Buffer.alloc(HEAD_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0)
    const head = buffer.toString('utf-8', 0, bytesRead)
    const escaped = CWD_RE.exec(head)?.[1]
    if (escaped === undefined) return null
    // Undo JSON string escaping for the captured path.
    try {
      return JSON.parse(`"${escaped}"`) as string
    } catch {
      return escaped
    }
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => {})
  }
}

async function getFileMtime(path: string): Promise<number | null> {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return null
  }
}

function sortNewestFirst(candidates: SessionFileCandidate[]): SessionFileCandidate[] {
  return [...candidates].sort((a, b) => b.mtime - a.mtime)
}
