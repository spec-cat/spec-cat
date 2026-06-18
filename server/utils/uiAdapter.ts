import type {
  UIStreamEvent,
  UIStreamPermissionRequestEvent,
} from '~/types/chat'

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
