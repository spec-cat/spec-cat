interface StreamConversationLike {
  hasWorktree?: boolean
  worktreePath?: string
  worktreeBranch?: string
  featureId?: string
}

export interface StreamOpts {
  cwd?: string
  worktreeBranch?: string
  featureId?: string
}

export interface ParsedPermissionRequest {
  tool: string
  description: string
  filePath?: string
  command?: string
}

export function isSpeckitResetCommand(message: string): boolean {
  return /^\/speckit\.(clarify|plan|tasks|implement)(\s|$)/.test(message)
}

export function createRequestId(
  now: () => number = Date.now,
  random: () => number = Math.random
): string {
  return `req-${now()}-${random().toString(36).slice(2, 8)}`
}

export function createSessionId(now: () => number = Date.now): string {
  return `session-${now()}`
}

export function buildStreamOptsFromConversation(
  conv: StreamConversationLike | null | undefined,
  requireHasWorktree = false
): StreamOpts | undefined {
  const opts: StreamOpts = {}

  const canUseWorktree = requireHasWorktree ? !!conv?.hasWorktree : true
  if (canUseWorktree && conv?.worktreePath) {
    opts.cwd = conv.worktreePath
    opts.worktreeBranch = conv.worktreeBranch
  }

  if (conv?.featureId) {
    opts.featureId = conv.featureId
  }

  return Object.keys(opts).length > 0 ? opts : undefined
}

export function formatToolInputSummary(input: Record<string, unknown>): string {
  if (input.file_path) return String(input.file_path)
  if (input.path) return String(input.path)
  if (input.command) return String(input.command).slice(0, 50)
  if (input.pattern) return String(input.pattern)
  for (const val of Object.values(input)) {
    if (typeof val === 'string' && val.length < 100) return val
  }
  return ''
}

export function parsePermissionRequestFromText(
  text: string,
  fallbackTool = 'Permission'
): ParsedPermissionRequest {
  const description = text || ''
  const writeMatch = description.match(/write to (.+?)(?:[\s,?]|$)/i)
  const readMatch = description.match(/read (.+?)(?:[\s,?]|$)/i)
  const bashMatch = description.match(/run (.+?)(?:[?,]|$)/i)

  if (writeMatch?.[1]) {
    return {
      tool: 'Write',
      description,
      filePath: writeMatch[1].trim(),
    }
  }

  if (readMatch?.[1]) {
    return {
      tool: 'Read',
      description,
      filePath: readMatch[1].trim(),
    }
  }

  if (bashMatch?.[1]) {
    return {
      tool: 'Bash',
      description,
      command: bashMatch[1].trim(),
    }
  }

  return {
    tool: fallbackTool,
    description,
  }
}
