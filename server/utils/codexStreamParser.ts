export function extractCodexDiagnosticFromEvent(event: Record<string, unknown>): string | null {
  const eventType = typeof event.type === 'string' ? event.type : ''
  if (eventType === 'error') {
    const message = typeof event.message === 'string' ? event.message.trim() : ''
    if (message) {
      return `Codex error: ${message}`
    }
  }

  if (eventType === 'turn.failed') {
    const error = event.error
    if (error && typeof error === 'object') {
      const message = typeof (error as { message?: unknown }).message === 'string'
        ? String((error as { message: string }).message).trim()
        : ''
      if (message) {
        return `Codex turn failed: ${message}`
      }
    }
  }

  return null
}

function getStringValue(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return ''
}

function getObjectValue(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const value = obj[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
  }
  return null
}

function parseJsonObject(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }

  if (typeof input === 'string' && input.trim()) {
    try {
      const parsed = JSON.parse(input)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // ignore parse errors and fall back
    }
    return { raw: input }
  }

  return {}
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function deriveToolNameFromEventType(eventType: string): string {
  if (!eventType) return ''
  if (eventType === 'item.started' || eventType === 'item.updated' || eventType === 'item.completed') {
    return ''
  }
  const base = eventType
    .replace(/^response\.output_item\./, '')
    .replace(/(?:_begin|_end|_start|_stop|_done|_added|_updated|_completed|_failed)$/, '')
    .replace(/(?:\.begin|\.end|\.start|\.stop|\.done|\.added|\.updated|\.completed|\.failed)$/, '')
    .replace(/[._]+/g, ' ')
    .trim()
  if (!base) return ''

  const parts = base.split(/\s+/).filter(Boolean)
  return parts.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}

function inferToolNameFromInput(input: Record<string, unknown>): string {
  if (typeof input.command === 'string' || typeof input.cmd === 'string') {
    return 'Bash'
  }

  const hasPath = typeof input.file_path === 'string' || typeof input.path === 'string'
  const hasContent = typeof input.content === 'string' || typeof input.text === 'string'
  const hasEditShape = typeof input.old_string === 'string' || typeof input.new_string === 'string'

  if (hasPath && hasEditShape) return 'Edit'
  if (hasPath && hasContent) return 'Write'
  if (hasPath) return 'Read'

  return ''
}

function normalizeGenericToolName(name: string): string {
  if (!name) return ''
  const lowered = name.toLowerCase()
  const compact = lowered.replace(/[^a-z0-9]/g, '')
  if (compact === 'functioncall' || compact === 'toolcall' || compact === 'itemstarted' || compact === 'itemupdated' || compact === 'itemcompleted') {
    return ''
  }
  return name
}

function extractFallbackInputFromEvent(event: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    'file_path', 'filePath', 'path',
    'command', 'cmd',
    'pattern', 'query', 'glob',
    'offset', 'limit',
    'old_string', 'new_string',
    'content', 'text',
  ]
  const input: Record<string, unknown> = {}
  for (const key of keys) {
    const value = event[key]
    if (value === undefined || value === null) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      const normalizedKey = key === 'filePath' ? 'file_path' : key
      input[normalizedKey] = value
    }
  }
  return input
}

function withSessionFields(
  event: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...event }
  const sessionFields = extractSessionFields(source)
  for (const [key, value] of Object.entries(sessionFields)) {
    if (merged[key] === undefined) {
      merged[key] = value
    }
  }
  return merged
}

function withEnvelopeIdentifiers(
  event: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...event }
  const idKeys = ['item_id', 'id', 'call_id', 'tool_call_id', 'tool_use_id'] as const
  for (const key of idKeys) {
    const sourceValue = source[key]
    if (merged[key] === undefined && typeof sourceValue === 'string' && sourceValue.length > 0) {
      merged[key] = sourceValue
    }
  }
  return merged
}

function extractSessionFields(source: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  const keys = ['thread_id', 'threadId', 'session_id', 'sessionId', 'conversation_id', 'conversationId'] as const
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.length > 0) {
      out[key] = value
    }
  }

  const response = source.response
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const responseObj = response as Record<string, unknown>
    for (const key of keys) {
      const value = responseObj[key]
      if (typeof value === 'string' && value.length > 0 && out[key] === undefined) {
        out[key] = value
      }
    }
  }

  return out
}

function extractSessionId(event: Record<string, unknown>): string | undefined {
  const fields = extractSessionFields(event)
  return fields.session_id
    || fields.sessionId
    || fields.conversation_id
    || fields.conversationId
    || fields.thread_id
    || fields.threadId
}

interface MappedPermissionRequest {
  tool: string
  description: string
  path?: string
  file_path?: string
  command?: string
}

function extractPermissionRequest(event: Record<string, unknown>): MappedPermissionRequest | null {
  const eventType = getStringValue(event, ['type']).toLowerCase()
  const permission = getObjectValue(event, ['permission'])
  if (permission) {
    const tool = getStringValue(permission, ['tool', 'name', 'action']) || 'Permission'
    return {
      tool,
      description: getStringValue(permission, ['description', 'message', 'text']) || `Permission required: ${tool}`,
      path: getStringValue(permission, ['path']),
      file_path: getStringValue(permission, ['file_path', 'filePath']),
      command: getStringValue(permission, ['command', 'cmd']),
    }
  }

  const looksLikePermissionEvent =
    eventType.includes('permission')
    || eventType.includes('approval')
    || eventType.includes('confirm')

  if (!looksLikePermissionEvent) {
    return null
  }

  const tool = getStringValue(event, ['tool', 'name', 'action']) || 'Permission'
  const description = getStringValue(event, ['description', 'message', 'text']) || `Permission required: ${tool}`

  return {
    tool,
    description,
    path: getStringValue(event, ['path']),
    file_path: getStringValue(event, ['file_path', 'filePath']),
    command: getStringValue(event, ['command', 'cmd']),
  }
}

interface MappedToolUse {
  toolUseId: string
  name: string
  input: Record<string, unknown>
}

function extractToolUse(event: Record<string, unknown>): MappedToolUse | null {
  const eventType = getStringValue(event, ['type']).toLowerCase()
  const envelopeType = getStringValue(event, ['envelope_type']).toLowerCase()
  const phaseType = envelopeType || eventType
  const disallowedTypes = new Set([
    'agent_message',
    'agent_message_delta',
    'task_complete',
    'turn.completed',
    'turn.failed',
    'error',
    'result',
  ])
  if (disallowedTypes.has(eventType)) return null

  const toolObj = getObjectValue(event, ['tool', 'function'])
  const explicitInput = toolObj
    ? (toolObj.arguments ?? toolObj.input ?? toolObj.args ?? toolObj.parameters)
    : (event.arguments ?? event.input ?? event.args ?? event.parameters ?? event.payload)
  const parsedInput = parseJsonObject(explicitInput)
  const fallbackInput = Object.keys(parsedInput).length === 0 ? extractFallbackInputFromEvent(event) : {}
  const input = Object.keys(fallbackInput).length > 0 ? fallbackInput : parsedInput

  const explicitToolName = (toolObj
    ? getStringValue(toolObj, ['name', 'tool_name', 'toolName'])
    : getStringValue(event, ['name', 'tool_name', 'toolName', 'function_name', 'functionName', 'item_type']))
  const derivedToolName = deriveToolNameFromEventType(eventType)
  const toolName = normalizeGenericToolName(explicitToolName)
    || normalizeGenericToolName(derivedToolName)
    || inferToolNameFromInput(input)

  if (!toolName) return null

  const hasToolShape =
    phaseType.includes('tool')
    || phaseType.includes('function_call')
    || phaseType.includes('call.started')
    || phaseType.includes('call.start')
    || phaseType.includes('tool_call')
    || phaseType.includes('item.started')
    || phaseType.includes('item.updated')
    || phaseType.endsWith('_begin')
    || phaseType.endsWith('.begin')
    || phaseType.endsWith('_start')
    || phaseType.endsWith('.start')
    || !!event.tool_call_id
    || !!event.call_id
    || !!event.tool_use_id

  if (!hasToolShape && Object.keys(input).length === 0) {
    return null
  }

  const toolUseId = getStringValue(event, ['tool_use_id', 'toolUseId', 'tool_call_id', 'call_id', 'item_id', 'id'])
    || `codex-tool-${toolName}`

  return { toolUseId, name: toolName, input }
}

interface MappedToolResult {
  toolUseId: string
  content: string
  isError: boolean
}

function extractToolResult(event: Record<string, unknown>): MappedToolResult | null {
  const eventType = getStringValue(event, ['type']).toLowerCase()
  const envelopeType = getStringValue(event, ['envelope_type']).toLowerCase()
  const phaseType = envelopeType || eventType
  const resultObj = getObjectValue(event, ['result'])

  const toolUseId = getStringValue(event, ['tool_use_id', 'toolUseId', 'tool_call_id', 'call_id', 'item_id', 'id'])
  const contentSource =
    event.output
    ?? event.content
    ?? event.result
    ?? event.text
    ?? event.message
    ?? (resultObj?.output ?? resultObj?.content ?? resultObj?.text ?? resultObj?.message)
  const content = stringifyUnknown(contentSource)

  const status = getStringValue(event, ['status']).toLowerCase()
  const isError =
    event.is_error === true
    || status === 'error'
    || status === 'failed'
    || status === 'failure'

  const hasResultShape =
    phaseType.includes('tool_result')
    || phaseType.includes('tool.output')
    || phaseType.includes('function_call_output')
    || phaseType.includes('call.completed')
    || phaseType.includes('tool.end')
    || phaseType.includes('tool.finish')
    || phaseType.includes('tool.result')
    || phaseType.endsWith('_end')
    || phaseType.endsWith('.end')
    || phaseType.endsWith('_done')
    || phaseType.endsWith('.done')
    || phaseType.endsWith('_completed')
    || phaseType.endsWith('.completed')
    || (toolUseId.length > 0 && content.length > 0 && !eventType.includes('message'))

  if (!hasResultShape || !toolUseId) {
    return null
  }

  const normalizedContent = content.trim()
  // function_call/tool_call items without explicit output are invocation records, not result payloads.
  if (!normalizedContent && (eventType === 'function_call' || eventType === 'tool_call')) {
    return null
  }

  return {
    toolUseId,
    content: normalizedContent,
    isError,
  }
}

function extractAgentTextFromEvent(event: Record<string, unknown>): string {
  const directText = typeof event.message === 'string'
    ? event.message
    : typeof event.text === 'string'
      ? event.text
      : ''
  if (directText) {
    return directText
  }

  const content = event.content
  if (Array.isArray(content)) {
    const chunks = content
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return ''
        const part = entry as Record<string, unknown>
        if (typeof part.text === 'string') return part.text
        if (typeof part.content === 'string') return part.content
        return ''
      })
      .filter(Boolean)
    if (chunks.length > 0) {
      return chunks.join('')
    }
  }

  return ''
}

function extractReasoningTextFromEvent(event: Record<string, unknown>): string {
  const directText = getStringValue(event, ['text', 'message', 'summary'])
  if (directText) return directText

  const summary = event.summary
  if (Array.isArray(summary)) {
    const chunks = summary
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return ''
        const part = entry as Record<string, unknown>
        return getStringValue(part, ['text', 'summary', 'content'])
      })
      .filter(Boolean)
    if (chunks.length > 0) {
      return chunks.join('\n')
    }
  }

  const content = event.content
  if (Array.isArray(content)) {
    const chunks = content
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return ''
        const part = entry as Record<string, unknown>
        return getStringValue(part, ['text', 'summary', 'content'])
      })
      .filter(Boolean)
    if (chunks.length > 0) {
      return chunks.join('\n')
    }
  }

  return ''
}

export function mapCodexEventToProviderJson(event: Record<string, unknown>): Record<string, unknown>[] {
  const eventType = typeof event.type === 'string' ? event.type : ''
  const sessionId = extractSessionId(event)

  const asTextStreamEvents = (text: string): Record<string, unknown>[] => ([
    {
      type: 'stream_event',
      ...(sessionId ? { session_id: sessionId } : {}),
      event: {
        type: 'content_block_start',
        content_block: { type: 'text', text },
      },
    },
    {
      type: 'stream_event',
      ...(sessionId ? { session_id: sessionId } : {}),
      event: { type: 'content_block_stop' },
    },
  ])

  const asThinkingStreamEvents = (thinking: string): Record<string, unknown>[] => ([
    {
      type: 'stream_event',
      ...(sessionId ? { session_id: sessionId } : {}),
      event: {
        type: 'content_block_start',
        content_block: { type: 'thinking', thinking },
      },
    },
    {
      type: 'stream_event',
      ...(sessionId ? { session_id: sessionId } : {}),
      event: { type: 'content_block_stop' },
    },
  ])

  const mapPermissionRequest = () => {
    const permission = extractPermissionRequest(event)
    if (!permission) return null

    return {
      type: 'permission_request',
      ...(sessionId ? { session_id: sessionId } : {}),
      permission,
    } satisfies Record<string, unknown>
  }

  const mapToolUseAsStreamEvents = (): Record<string, unknown>[] | null => {
    const toolUse = extractToolUse(event)
    if (!toolUse) return null
    const inputJson = JSON.stringify(toolUse.input)
    return [
      {
        type: 'stream_event',
        ...(sessionId ? { session_id: sessionId } : {}),
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: toolUse.toolUseId,
            name: toolUse.name,
          },
        },
      },
      {
        type: 'stream_event',
        ...(sessionId ? { session_id: sessionId } : {}),
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: {
            partial_json: inputJson,
          },
        },
      },
      {
        type: 'stream_event',
        ...(sessionId ? { session_id: sessionId } : {}),
        event: {
          type: 'content_block_stop',
          index: 0,
        },
      },
    ]
  }

  const mapToolResult = () => {
    const result = extractToolResult(event)
    if (!result) return null
    return {
      type: 'tool_result',
      ...(sessionId ? { session_id: sessionId } : {}),
      tool_use_id: result.toolUseId,
      content: result.content,
      is_error: result.isError,
    } satisfies Record<string, unknown>
  }

  const getFinalMessageText = (): string => {
    const directCandidates = [
      event.last_agent_message,
      event.last_assistant_message,
      event.final_message,
      event.output_text,
      event.response_text,
    ]

    for (const value of directCandidates) {
      if (typeof value === 'string' && value.trim()) {
        return value
      }
    }

    const result = event.result
    if (result && typeof result === 'object') {
      const resultObj = result as Record<string, unknown>
      const nestedCandidates = [resultObj.message, resultObj.text, resultObj.output_text]
      for (const value of nestedCandidates) {
        if (typeof value === 'string' && value.trim()) {
          return value
        }
      }
    }

    return ''
  }

  if (eventType === 'agent_message_delta') {
    const text = typeof event.delta === 'string'
      ? event.delta
      : typeof event.text === 'string'
        ? event.text
        : ''
    if (!text) return []
    return [
      {
        type: 'stream_event',
        ...(sessionId ? { session_id: sessionId } : {}),
        event: {
          type: 'content_block_start',
          content_block: { type: 'text', text: '' },
        },
      },
      {
        type: 'stream_event',
        ...(sessionId ? { session_id: sessionId } : {}),
        event: {
          type: 'content_block_delta',
          delta: { text },
        },
      },
      {
        type: 'stream_event',
        ...(sessionId ? { session_id: sessionId } : {}),
        event: { type: 'content_block_stop' },
      },
    ]
  }

  if (eventType === 'agent_message') {
    const text = extractAgentTextFromEvent(event)
    if (!text) return []
    return [
      {
        type: 'stream_event',
        ...(sessionId ? { session_id: sessionId } : {}),
        event: {
          type: 'content_block_start',
          content_block: { type: 'text', text },
        },
      },
      {
        type: 'stream_event',
        ...(sessionId ? { session_id: sessionId } : {}),
        event: { type: 'content_block_stop' },
      },
    ]
  }

  if (eventType === 'reasoning' || eventType === 'agent_reasoning') {
    const thinking = extractReasoningTextFromEvent(event)
    if (!thinking) return []
    return asThinkingStreamEvents(thinking)
  }

  if (eventType === 'task_complete' || eventType === 'turn.completed') {
    const finalText = getFinalMessageText()
    const resultEvent = {
      type: 'result',
      ...(sessionId ? { session_id: sessionId } : {}),
      subtype: 'success',
    }

    if (!finalText) {
      return [resultEvent]
    }

    return [
      ...asTextStreamEvents(finalText),
      {
        ...resultEvent,
      },
    ]
  }

  const permissionEvent = mapPermissionRequest()
  if (permissionEvent) {
    return [permissionEvent]
  }

  const toolResultEvent = mapToolResult()
  if (toolResultEvent) {
    return [toolResultEvent]
  }

  const toolUseEvents = mapToolUseAsStreamEvents()
  if (toolUseEvents) {
    return toolUseEvents
  }

  return [sessionId ? { ...event, session_id: sessionId } : event]
}

export function processCodexJsonLine(cleanedLine: string): {
  mappedEvents: Record<string, unknown>[]
  diagnostics: string[]
  nonJson?: string
} {
  try {
    const parsed = JSON.parse(cleanedLine) as Record<string, unknown>
    const eventsToProcess: Record<string, unknown>[] = (() => {
      const outerType = typeof parsed.type === 'string' ? parsed.type : ''
      if (outerType === 'event_msg') {
        const payload = parsed.payload
        if (payload && typeof payload === 'object') {
          return [withSessionFields(payload as Record<string, unknown>, parsed)]
        }
      }

      // Some Codex builds wrap provider events under `event` or `data` envelopes.
      // Unwrap them so downstream mapping can recognize approval/tool events.
      const nestedEventCandidates = [parsed.event, parsed.data]
      for (const candidate of nestedEventCandidates) {
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
          const candidateObj = candidate as Record<string, unknown>
          if (typeof candidateObj.type === 'string') {
            return [withSessionFields(candidateObj, parsed)]
          }
        }
      }

      // Codex CLI has emitted multiple envelope styles over time. Normalize all
      // known "item-carrying" envelopes to the same inner event shape.
      const isItemEnvelope =
        outerType === 'item.started'
        || outerType === 'item.completed'
        || outerType === 'item.updated'
        || outerType === 'item.added'
        || outerType.startsWith('response.output_item.')

      if (isItemEnvelope) {
        const item = parsed.item
        if (item && typeof item === 'object') {
          const itemEvent = withEnvelopeIdentifiers(
            withSessionFields(item as Record<string, unknown>, parsed),
            parsed,
          )
          itemEvent.envelope_type = outerType
          if (typeof itemEvent.type === 'string' && itemEvent.type.toLowerCase() === 'message') {
            // Normalize message-like output items to legacy event type expected by renderer.
            itemEvent.type = 'agent_message'
          }
          return [itemEvent]
        }
      }

      // Normalize text deltas from Responses-style events.
      if (outerType === 'response.output_text.delta') {
        const delta = getStringValue(parsed, ['delta', 'text'])
        if (delta) {
          return [withSessionFields({ type: 'agent_message_delta', delta }, parsed)]
        }
      }

      // Normalize response completion/failure events.
      if (outerType === 'response.completed') {
        return [withSessionFields({ type: 'turn.completed', result: parsed.response ?? parsed.result }, parsed)]
      }
      if (outerType === 'response.failed') {
        return [withSessionFields({ type: 'turn.failed', error: parsed.error ?? parsed.response }, parsed)]
      }
      return [parsed]
    })()

    const diagnostics = eventsToProcess
      .map(event => extractCodexDiagnosticFromEvent(event))
      .filter((diag): diag is string => !!diag)

    const mappedEvents = eventsToProcess.flatMap(event => mapCodexEventToProviderJson(event))

    return {
      mappedEvents,
      diagnostics,
    }
  } catch {
    return {
      mappedEvents: [],
      diagnostics: [],
      nonJson: cleanedLine,
    }
  }
}
