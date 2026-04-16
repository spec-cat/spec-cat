import type { SearchMode, SearchResponse } from '~/types/specSearch'

/**
 * Classify a submitted chat message as a slash command or free-form text.
 * The dispatcher returns a tag the caller can switch on — it does NOT run
 * side effects, so callers stay in control of the async flow.
 */
export type SlashCommand =
  | { kind: 'reset' }
  | { kind: 'context' }
  | { kind: 'spec-search'; command: SpecSearchCommand }
  | { kind: 'none' }

/** Matches the four synonyms that reset the provider session. */
const RESET_COMMAND_RE = /^\/(reset|reset-context|new|clear)$/
/** Matches /context and its short alias. */
const CONTEXT_COMMAND_RE = /^\/(context|ctx)$/

/**
 * Classify a trimmed message. Empty input is returned as `none`.
 */
export function classifyChatCommand(message: string): SlashCommand {
  if (RESET_COMMAND_RE.test(message)) return { kind: 'reset' }
  if (CONTEXT_COMMAND_RE.test(message)) return { kind: 'context' }
  const specSearch = parseSpecSearchCommand(message)
  if (specSearch) return { kind: 'spec-search', command: specSearch }
  return { kind: 'none' }
}

export interface ContextDiagnostics {
  generatedAt: string
  requestedCwd: string
  effectiveCwd: string
  providerId: string
  providerModelKey: string
  permissionMode: string
  providerSessionId: string | null
  sessionState: 'resume' | 'fresh'
  featureId: string | null
  specContext: {
    active: boolean
    reason: string
    files: string[]
  }
  instructionFiles: Array<{
    path: string
    source: 'cwd' | 'ancestor'
    kind: 'file' | 'directory'
    hint: string
    mtime: string | null
  }>
}

export interface SpecSearchCommand {
  q: string
  mode?: SearchMode
  featureId?: string
  fileType?: string
  limit?: number
}

/**
 * Shape of a conversation as relevant to building a /context API query.
 */
export interface ContextQuerySource {
  hasWorktree?: boolean
  worktreePath?: string
  cwd?: string
  featureId?: string
  providerId?: string
  providerModelKey?: string
  providerSessionId?: string
}

/**
 * Build the query params sent to /api/chat/context. Includes only fields
 * that have values so the server sees the minimal request surface.
 */
export function buildContextQuery(
  conv: ContextQuerySource | null | undefined,
  permissionMode: string,
): Record<string, string> {
  const query: Record<string, string> = { permissionMode }

  if (conv?.hasWorktree && conv.worktreePath) {
    query.cwd = conv.worktreePath
  } else if (conv?.cwd) {
    query.cwd = conv.cwd
  }
  if (conv?.featureId) query.featureId = conv.featureId
  if (conv?.providerId) query.providerId = conv.providerId
  if (conv?.providerModelKey) query.providerModelKey = conv.providerModelKey
  if (conv?.providerSessionId) query.providerSessionId = conv.providerSessionId

  return query
}

/**
 * Build the query params sent to /api/specs/search. Merges command-level
 * overrides with conversation-level defaults (feature inheritance).
 */
export function buildSpecSearchQuery(
  command: SpecSearchCommand,
  defaults: { featureId?: string } = {},
): { q: string; mode: SearchMode; featureId?: string; fileType?: string; limit: string } {
  return {
    q: command.q,
    mode: command.mode ?? 'hybrid',
    featureId: command.featureId ?? defaults.featureId,
    fileType: command.fileType,
    limit: String(command.limit ?? 5),
  }
}

/**
 * Render a `/context` diagnostics payload into the Markdown snapshot shown
 * inline in the assistant message.
 */
export function formatContextDiagnostics(diag: ContextDiagnostics): string {
  const instructionLines = diag.instructionFiles.length > 0
    ? diag.instructionFiles.map((file) => {
        const scope = file.source === 'cwd' ? 'cwd' : 'ancestor'
        const mtime = file.mtime ? ` (mtime: ${file.mtime})` : ''
        return `- \`${file.path}\` [${scope}] - ${file.hint}${mtime}`
      })
    : ['- (none detected from current cwd ancestry)']

  const specFiles = diag.specContext.files.length > 0
    ? diag.specContext.files.map((file) => `- \`${file}\``)
    : ['- (none)']

  return [
    '## Context Snapshot',
    '',
    `- Time: ${diag.generatedAt}`,
    `- Session state: **${diag.sessionState}**`,
    `- Provider session ID: \`${diag.providerSessionId ?? '(empty)'}\``,
    `- Provider: \`${diag.providerId}\` / \`${diag.providerModelKey}\``,
    `- Permission mode: \`${diag.permissionMode}\``,
    `- CWD (requested): \`${diag.requestedCwd}\``,
    `- CWD (effective): \`${diag.effectiveCwd}\``,
    `- Feature: \`${diag.featureId ?? '(none)'}\``,
    '',
    '### Spec Context Injection',
    `- Active on next turn: **${diag.specContext.active ? 'yes' : 'no'}**`,
    `- Reason: ${diag.specContext.reason}`,
    ...specFiles,
    '',
    '### Detected Instruction Files',
    ...instructionLines,
  ].join('\n')
}

/**
 * Split a command argument string into tokens, respecting single/double-quoted
 * segments (which are preserved verbatim without the surrounding quotes).
 */
export function tokenizeCommandArgs(input: string): string[] {
  const matches = input.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  return matches.map((token) => {
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      return token.slice(1, -1)
    }
    return token
  })
}

/**
 * Parse a `/spec-search` (or `/specsearch`) slash command string.
 * Returns the structured command, or null when the input is not a spec-search
 * invocation. Unknown flags are silently dropped.
 */
export function parseSpecSearchCommand(input: string): SpecSearchCommand | null {
  const match = input.match(/^\/(?:spec-search|specsearch)\b(.*)$/i)
  if (!match) return null

  const tokens = tokenizeCommandArgs(match[1]?.trim() ?? '')
  const queryTokens: string[] = []
  const parsed: SpecSearchCommand = { q: '' }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    if (token === '--mode' && tokens[i + 1]) {
      const candidate = tokens[++i]
      if (candidate === 'keyword' || candidate === 'semantic' || candidate === 'hybrid') {
        parsed.mode = candidate
      }
      continue
    }
    if (token.startsWith('--mode=')) {
      const candidate = token.slice('--mode='.length)
      if (candidate === 'keyword' || candidate === 'semantic' || candidate === 'hybrid') {
        parsed.mode = candidate
      }
      continue
    }
    if (token === '--feature' && tokens[i + 1]) {
      parsed.featureId = tokens[++i]
      continue
    }
    if (token.startsWith('--feature=')) {
      parsed.featureId = token.slice('--feature='.length)
      continue
    }
    if (token === '--file-type' && tokens[i + 1]) {
      parsed.fileType = tokens[++i]
      continue
    }
    if (token.startsWith('--file-type=')) {
      parsed.fileType = token.slice('--file-type='.length)
      continue
    }
    if (token === '--limit' && tokens[i + 1]) {
      const limit = Number.parseInt(tokens[++i], 10)
      if (Number.isFinite(limit) && limit > 0) {
        parsed.limit = limit
      }
      continue
    }
    if (token.startsWith('--limit=')) {
      const limit = Number.parseInt(token.slice('--limit='.length), 10)
      if (Number.isFinite(limit) && limit > 0) {
        parsed.limit = limit
      }
      continue
    }

    queryTokens.push(token)
  }

  parsed.q = queryTokens.join(' ').trim()
  return parsed
}

/**
 * Soft-truncate markdown text for preview embedding.
 */
export function truncateMarkdown(input: string, maxLen = 1400): string {
  const text = input.trim()
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}\n...`
}

/**
 * Render a spec-search response as the Markdown block shown in the assistant
 * message when a direct `/spec-search` command is issued.
 */
export function formatSpecSearchResponse(
  command: SpecSearchCommand,
  response: SearchResponse,
): string {
  const lines: string[] = []
  lines.push('## Spec Search Results')
  lines.push('')
  lines.push(`- Query: \`${command.q}\``)
  lines.push(`- Mode: \`${response.mode}\``)
  if (command.featureId) lines.push(`- Feature filter: \`${command.featureId}\``)
  if (command.fileType) lines.push(`- File type filter: \`${command.fileType}\``)
  lines.push(`- Hits: **${response.totalCount}** (${response.searchTime}ms)`)
  if (response.warning) {
    lines.push(`- Warning: ${response.warning}`)
  }

  if (response.results.length === 0) {
    lines.push('')
    lines.push('No matching indexed chunks were found.')
    return lines.join('\n')
  }

  lines.push('')
  for (const [index, result] of response.results.entries()) {
    const chunk = result.chunk
    lines.push(`### ${index + 1}. \`${chunk.sourcePath}:${chunk.lineStart}\``)
    lines.push(`- Match: \`${result.matchType}\` (score: ${result.score.toFixed(3)})`)
    if (chunk.headingHierarchy.length > 0) {
      lines.push(`- Headings: ${chunk.headingHierarchy.join(' > ')}`)
    }
    lines.push('')
    lines.push(truncateMarkdown(chunk.content))
    lines.push('')
  }

  return lines.join('\n')
}
