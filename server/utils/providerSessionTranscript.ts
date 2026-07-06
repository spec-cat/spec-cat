import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { encodeClaudeProjectDir } from './claudeSession'
import { stripTuiChrome } from './interactiveProviderText'

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getClaudeProjectsDir(): string {
  const home = (typeof process.env.CLAUDE_CONFIG_DIR === 'string' && process.env.CLAUDE_CONFIG_DIR.length > 0)
    ? process.env.CLAUDE_CONFIG_DIR
    : join(process.env.HOME || homedir(), '.claude')
  return join(home, 'projects')
}

function getCodexSessionsDir(): string {
  const home = (typeof process.env.CODEX_HOME === 'string' && process.env.CODEX_HOME.length > 0)
    ? process.env.CODEX_HOME
    : join(process.env.HOME || homedir(), '.codex')
  return join(home, 'sessions')
}

function findFile(root: string, predicate: (path: string) => boolean, maxDepth = 5): string | null {
  if (!existsSync(root)) return null
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]
  const matches: Array<{ path: string; mtime: number }> = []

  while (stack.length > 0) {
    const current = stack.pop()!
    let entries
    try {
      entries = readdirSync(current.dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = join(current.dir, entry.name)
      if (entry.isDirectory()) {
        if (current.depth < maxDepth) stack.push({ dir: fullPath, depth: current.depth + 1 })
        continue
      }
      if (!entry.isFile() || !predicate(fullPath)) continue
      try {
        matches.push({ path: fullPath, mtime: statSync(fullPath).mtimeMs })
      } catch {
        // ignore unreadable candidates
      }
    }
  }

  matches.sort((a, b) => b.mtime - a.mtime)
  return matches[0]?.path ?? null
}

function findClaudeSessionFile(cwd: string, sessionId: string): string | null {
  const projectsDir = getClaudeProjectsDir()
  const localPath = join(projectsDir, encodeClaudeProjectDir(cwd), `${sessionId}.jsonl`)
  if (existsSync(localPath)) return localPath
  return findFile(projectsDir, path => basename(path) === `${sessionId}.jsonl`)
}

function findCodexSessionFile(sessionId: string): string | null {
  return findFile(
    getCodexSessionsDir(),
    path => basename(path).startsWith('rollout-') && basename(path).endsWith(`${sessionId}.jsonl`),
  )
}

function readAssistantTextFromJsonl(filePath: string, providerId: string): string {
  const chunks: string[] = []
  const lines = readFileSync(filePath, 'utf-8').split('\n')

  for (const line of lines) {
    if (!line.trim()) continue
    let record: any
    try {
      record = JSON.parse(line)
    } catch {
      continue
    }

    if (providerId === 'claude') {
      const content = record.type === 'assistant' ? record.message?.content : undefined
      if (!Array.isArray(content)) continue
      for (const block of content) {
        if (block?.type === 'text' && typeof block.text === 'string') chunks.push(block.text)
      }
      continue
    }

    if (providerId === 'codex') {
      const payload = record.type === 'response_item' ? record.payload : undefined
      const content = payload?.type === 'message' && payload.role === 'assistant' ? payload.content : undefined
      if (!Array.isArray(content)) continue
      for (const block of content) {
        if (block?.type === 'output_text' && typeof block.text === 'string') chunks.push(block.text)
      }
    }
  }

  return chunks.join('\n')
}

export function readProviderSessionMarkedText(options: {
  providerId: string
  cwd: string
  providerSessionId?: string
  startMarker: string
  endMarker: string
}): string | null {
  if (!options.providerSessionId || !SESSION_ID_RE.test(options.providerSessionId)) return null

  const filePath = options.providerId === 'claude'
    ? findClaudeSessionFile(options.cwd, options.providerSessionId)
    : options.providerId === 'codex'
      ? findCodexSessionFile(options.providerSessionId)
      : null
  if (!filePath) return null

  const text = readAssistantTextFromJsonl(filePath, options.providerId)
  const startIdx = text.lastIndexOf(options.startMarker)
  if (startIdx === -1) return null
  const endIdx = text.indexOf(options.endMarker, startIdx + options.startMarker.length)
  if (endIdx === -1) return null

  const region = text.slice(startIdx + options.startMarker.length, endIdx)
  const cleaned = stripTuiChrome(region)
  return cleaned.length > 0 ? cleaned : null
}
