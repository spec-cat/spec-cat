interface StreamConversationLike {
  hasWorktree?: boolean
  worktreePath?: string
  worktreeBranch?: string
  baseBranch?: string
  featureId?: string
}

export interface StreamOpts {
  cwd?: string
  worktreeBranch?: string
  baseBranch?: string
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

  if (conv?.baseBranch) {
    opts.baseBranch = conv.baseBranch
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

export interface CloseEventLike {
  code: number
  reason?: string
  wasClean: boolean
}

export interface CloseContextLike {
  lastServerError?: string | null
  lastSocketError?: string | null
}

export function summarizeCloseCode(code: number): string {
  switch (code) {
    case 1000:
      return 'Normal closure'
    case 1001:
      return 'Endpoint is going away (server shutdown or page navigation)'
    case 1002:
      return 'Protocol error'
    case 1003:
      return 'Unsupported data'
    case 1005:
      return 'No status code received from peer (close frame had no code)'
    case 1006:
      return 'Abnormal closure (connection dropped without close frame)'
    case 1007:
      return 'Invalid payload data'
    case 1008:
      return 'Policy violation'
    case 1009:
      return 'Message too big'
    case 1010:
      return 'Missing required extension'
    case 1011:
      return 'Internal server error'
    case 1012:
      return 'Service restart'
    case 1013:
      return 'Try again later (temporary overload)'
    case 1015:
      return 'TLS handshake failure'
    default:
      if (code >= 4000 && code <= 4999) {
        return 'Application-specific close code'
      }
      return 'Unknown close code'
  }
}

export function buildCloseReason(event: CloseEventLike, conn?: CloseContextLike): string {
  const parts: string[] = []
  if (event.reason) {
    parts.push(event.reason)
  } else {
    parts.push(summarizeCloseCode(event.code))
  }

  if (conn?.lastServerError) {
    parts.push(`Last server error: ${conn.lastServerError}`)
  } else if (conn?.lastSocketError) {
    parts.push(`Last socket error: ${conn.lastSocketError}`)
  }

  parts.push(`wasClean: ${event.wasClean ? 'yes' : 'no'}`)
  return parts.join(' | ')
}

export function extractProviderSessionId(msg: unknown): string | null {
  if (!msg || typeof msg !== 'object') return null
  const record = msg as Record<string, unknown>
  const keys = ['session_id', 'sessionId', 'conversation_id', 'conversationId', 'thread_id', 'threadId']
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  const response = record.response
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const responseObj = response as Record<string, unknown>
    for (const key of keys) {
      const value = responseObj[key]
      if (typeof value === 'string' && value.length > 0) {
        return value
      }
    }
  }

  return null
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
