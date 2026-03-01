import type {
  UIStreamEvent,
  UIStreamEventType,
  UIStreamBlockStartEvent,
  UIStreamBlockDeltaEvent,
  UIStreamBlockEndEvent,
  UIStreamToolResultEvent,
  UIStreamPermissionRequestEvent,
  UIStreamTurnResultEvent,
  UIStreamSessionInitEvent,
  ContentBlockType,
} from '~/types/chat'

/**
 * Extracts session ID from various provider-specific field names
 */
export function extractSessionId(message: Record<string, unknown>): string | null {
  const eventType = typeof message.type === 'string' ? message.type.toLowerCase() : ''
  const subtype = typeof message.subtype === 'string' ? message.subtype.toLowerCase() : ''
  const isErrorLike = eventType.includes('error') || eventType.includes('failed') || subtype.startsWith('error')
  if (isErrorLike) {
    return null
  }

  const sessionIdKeys = ['thread_id', 'threadId', 'session_id', 'sessionId', 'conversation_id', 'conversationId']
  for (const key of sessionIdKeys) {
    const value = message[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  const response = message.response
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const responseObj = response as Record<string, unknown>
    for (const key of sessionIdKeys) {
      const value = responseObj[key]
      if (typeof value === 'string' && value.length > 0) {
        return value
      }
    }
  }
  return null
}

function normalizeTurnResultSubtype(value: unknown, isError: boolean): UIStreamTurnResultEvent['subtype'] {
  if (isError) return 'error'
  const raw = typeof value === 'string' ? value.toLowerCase() : ''
  if (raw === 'success') return 'success'
  if (raw === 'max_turns' || raw === 'error_max_turns') return 'max_turns'
  if (raw.startsWith('error')) return 'error'
  return 'success'
}

/**
 * Transform a Claude provider event into canonical UI events
 */
export function transformClaudeEvent(event: Record<string, unknown>): UIStreamEvent[] {
  const sessionId = extractSessionId(event) || undefined
  const events: UIStreamEvent[] = []

  if (event.type === 'stream_event' && event.event && typeof event.event === 'object') {
    const streamEvent = event.event as Record<string, unknown>

    if (streamEvent.type === 'content_block_start' && streamEvent.content_block && typeof streamEvent.content_block === 'object') {
      const block = streamEvent.content_block as Record<string, unknown>
      const blockType = (block.type as ContentBlockType)
      
      // Map 'server_tool_use' to 'tool_use' for UI consistency
      const normalizedBlockType = (blockType as string) === 'server_tool_use' ? 'tool_use' : blockType

      events.push({
        type: 'block_start',
        sessionId,
        blockId: (block.id as string) || `blk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        blockType: normalizedBlockType as ContentBlockType,
        index: streamEvent.index as number,
        name: block.name as string,
        toolUseId: block.id as string,
        text: block.text as string,
        thinking: block.thinking as string,
      } as UIStreamBlockStartEvent)
    }

    if (streamEvent.type === 'content_block_delta' && streamEvent.delta && typeof streamEvent.delta === 'object') {
      const delta = streamEvent.delta as Record<string, unknown>
      events.push({
        type: 'block_delta',
        sessionId,
        blockId: '', // Client matches by index/type if ID is missing in delta
        index: streamEvent.index as number,
        text: delta.text as string,
        thinking: delta.thinking as string,
        partialJson: delta.partial_json as string,
      } as UIStreamBlockDeltaEvent)
    }

    if (streamEvent.type === 'content_block_stop') {
      events.push({
        type: 'block_end',
        sessionId,
        blockId: '',
        index: streamEvent.index as number,
      } as UIStreamBlockEndEvent)
    }
  }

  if (event.type === 'tool_result') {
    events.push({
      type: 'tool_result',
      sessionId,
      toolUseId: event.tool_use_id as string,
      content: event.content as string,
      isError: !!event.is_error,
    } as UIStreamToolResultEvent)
  }

  if (event.type === 'permission_request' && event.permission && typeof event.permission === 'object') {
    const perm = event.permission as Record<string, unknown>
    events.push({
      type: 'permission_request',
      sessionId,
      tool: (perm.tool as string) || 'Permission',
      description: perm.description as string,
      input: perm,
    } as UIStreamPermissionRequestEvent)
  }

  if (event.type === 'result') {
    const usage = event.usage as Record<string, number> | undefined
    const isError = Boolean(event.is_error)
    events.push({
      type: 'turn_result',
      sessionId,
      subtype: normalizeTurnResultSubtype(event.subtype, isError),
      totalCostUsd: event.total_cost_usd as number,
      durationMs: event.duration_ms as number,
      numTurns: event.num_turns as number,
      usage: usage ? {
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        cacheCreationInputTokens: usage.cache_creation_input_tokens || 0,
        cacheReadInputTokens: usage.cache_read_input_tokens || 0,
      } : undefined,
    } as UIStreamTurnResultEvent)
  }

  if (event.type === 'system' && event.subtype === 'init') {
    events.push({
      type: 'session_init',
      sessionId,
      model: event.model as string,
      tools: (event.tools as string[]) || [],
      permissionMode: (event.permissionMode as string) || '',
      cwd: (event.cwd as string) || '',
    } as UIStreamSessionInitEvent)
  }

  // Handle 'user' type message from Claude which might contain permission errors
  if (event.type === 'user' && (event.message || event.content)) {
    const content = (event.message as any)?.content || event.content
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'tool_result' && block?.is_error && typeof block.content === 'string') {
          const errorContent = block.content
          if (errorContent.includes('requested permissions') || errorContent.includes('haven\'t granted')) {
            const tools = parseToolsFromError(errorContent)
            events.push({
              type: 'permission_request',
              sessionId,
              tool: tools[0] || 'Permission',
              tools,
              description: errorContent,
            } as UIStreamPermissionRequestEvent)
          }
        }
      }
    }
  }

  return events
}

/**
 * Transform a Codex provider event into canonical UI events
 */
export function transformCodexEvent(event: Record<string, unknown>): UIStreamEvent[] {
  // If the event is already in canonical format (has a recognized UIStreamEventType),
  // return it as a single-item array.
  const type = event.type as string
  const canonicalTypes: UIStreamEventType[] = [
    'session_init', 'block_start', 'block_delta', 'block_end',
    'tool_result', 'permission_request', 'turn_result', 'error', 'done'
  ]
  
  if (canonicalTypes.includes(type as UIStreamEventType)) {
    return [event as unknown as UIStreamEvent]
  }

  // Fallback to transformClaudeEvent for any remaining Claude-like shapes
  return transformClaudeEvent(event)
}

/**
 * Check if a canonical event should be counted as renderable content
 */
export function isRenderableEvent(event: UIStreamEvent): boolean {
  switch (event.type) {
    case 'block_start':
      return ['text', 'thinking', 'tool_use'].includes(event.blockType)
    case 'block_delta':
      return !!(event.text || event.thinking || event.partialJson)
    case 'tool_result':
    case 'permission_request':
      return true
    case 'turn_result':
      return event.subtype !== 'success' // Errors in result are renderable
    default:
      return false
  }
}

/**
 * Check for permission requests that should intercept the stream
 */
export function checkForPermissionRequest(
  event: UIStreamEvent,
  approvedTools: Set<string>,
  providerId: string,
): UIStreamPermissionRequestEvent | null {
  // Explicit permission request event
  if (event.type === 'permission_request') {
    return event
  }

  // Tool use interception for Codex in ask mode
  if (event.type === 'block_start' && event.blockType === 'tool_use' && providerId === 'codex') {
    const normalizedTool = normalizeToolName(event.name || '')
    if (normalizedTool && codexToolNeedsAskApproval(normalizedTool) && !approvedTools.has(normalizedTool)) {
      return {
        type: 'permission_request',
        sessionId: event.sessionId,
        tool: normalizedTool,
        tools: [normalizedTool],
        description: `Permission required: ${normalizedTool}`,
      }
    }
  }

  // Inferred permission request from tool error
  if (event.type === 'tool_result' && event.isError) {
    if (isPermissionRequestText(event.content)) {
      const tools = parseToolsFromError(event.content)
      return {
        type: 'permission_request',
        sessionId: event.sessionId,
        tool: tools[0] || 'Permission',
        tools,
        description: event.content,
      }
    }
  }

  return null
}

/**
 * Helper to normalize tool names
 */
export function normalizeToolName(tool: string): string {
  if (!tool) return ''
  const trimmed = tool.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/**
 * Helper to check if text contains permission-related keywords
 */
export function isPermissionRequestText(text: string): boolean {
  if (!text) return false
  return /permission required|approval required|requires approval|requested permissions|haven't granted|hasn't granted|not approved|approval policy|permission denied|operation not permitted|read-only file system|cannot touch/i.test(text)
}

/**
 * Helper to parse tool names from error messages
 */
export function parseToolsFromError(errorContent: string): string[] {
  const lowerContent = errorContent.toLowerCase()
  const tools: string[] = []

  const toolNameMatch = errorContent.match(/(?:use the |Permission Required: )(\w+)(?: tool)?/i)
  if (toolNameMatch) {
    const toolName = toolNameMatch[1]
    const normalized = toolName.charAt(0).toUpperCase() + toolName.slice(1).toLowerCase()
    if (['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Webfetch', 'Websearch'].includes(normalized)) {
      const tool = normalized === 'Webfetch' ? 'WebFetch' : normalized === 'Websearch' ? 'WebSearch' : normalized
      return [tool]
    }
  }

  if (lowerContent.includes('write to') || lowerContent.includes('write ')) {
    tools.push('Write', 'Edit')
  }
  if (lowerContent.includes('edit ') && !tools.includes('Edit')) {
    tools.push('Edit')
  }
  if (lowerContent.includes('read ')) {
    tools.push('Read')
  }
  if (lowerContent.includes('run ') || lowerContent.includes('execute') || lowerContent.includes('bash')) {
    tools.push('Bash')
  }
  if (lowerContent.includes('glob')) {
    tools.push('Glob')
  }
  if (lowerContent.includes('grep')) {
    tools.push('Grep')
  }
  if (lowerContent.includes('fetch') || lowerContent.includes('webfetch')) {
    tools.push('WebFetch')
  }
  if (lowerContent.includes('websearch')) {
    tools.push('WebSearch')
  }

  return tools.length > 0 ? tools : ['Write', 'Edit']
}

/**
 * Helper to normalize multiple tool names
 */
export function normalizeTools(tools: string[]): string[] {
  const seen = new Set<string>()
  for (const tool of tools) {
    const normalized = normalizeToolName(tool)
    if (normalized) {
      seen.add(normalized)
    }
  }
  return Array.from(seen)
}

/**
 * Helper to check if a Codex tool needs approval in ask mode
 */
export function codexToolNeedsAskApproval(tool: string): boolean {
  const normalized = normalizeToolName(tool)
  if (!normalized) return false
  if (normalized === 'Read' || normalized === 'Glob' || normalized === 'Grep' || normalized === 'WebSearch') {
    return false
  }
  return true
}

/**
 * Extract permission request from process output (stderr)
 */
export function extractPermissionRequestFromProcessOutput(nonJsonOutput: string[]): { tools: string[]; description: string } | null {
  if (!Array.isArray(nonJsonOutput) || nonJsonOutput.length === 0) return null
  const description = nonJsonOutput.join('\n')
  if (!isPermissionRequestText(description)) {
    return null
  }
  const tools = parseToolsFromError(description)
  return { tools, description }
}
