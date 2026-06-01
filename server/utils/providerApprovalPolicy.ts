import type { UIStreamEvent, UIStreamPermissionRequestEvent } from '~/types/chat'
import {
  checkForPermissionRequest,
  extractPermissionRequestFromProcessOutput,
  normalizeToolName,
  normalizeTools,
} from '~/server/utils/uiAdapter'
import type { UIStreamBlockEndEvent, UIStreamBlockStartEvent, UIStreamBlockDeltaEvent } from '~/types/chat'

export type ApprovalMode = 'plan' | 'ask' | 'auto' | 'bypass'

export interface StreamingToolInput {
  name: string
  inputJson: string
}

function toolStreamKey(event: UIStreamBlockStartEvent | UIStreamBlockDeltaEvent | UIStreamBlockEndEvent): string | null {
  if (typeof event.index === 'number') return `index:${event.index}`
  if (event.blockId) return `block:${event.blockId}`
  return null
}

export function isUserInputToolName(name: string): boolean {
  const compact = normalizeToolName(name).toLowerCase().replace(/[^a-z0-9]/g, '')
  return compact === 'askuserquestion' || compact === 'requestuserinput'
}

export function trackStreamingToolInput(
  event: UIStreamBlockStartEvent | UIStreamBlockDeltaEvent | UIStreamBlockEndEvent,
  activeTools: Map<string, StreamingToolInput>,
): StreamingToolInput | null {
  const key = toolStreamKey(event)

  if (event.type === 'block_start') {
    if (key && event.blockType === 'tool_use' && event.name) {
      activeTools.set(key, { name: event.name, inputJson: '' })
    }
    return null
  }

  if (!key) return null
  const tool = activeTools.get(key)
  if (!tool) return null

  if (event.type === 'block_delta') {
    if (event.partialJson) {
      tool.inputJson += event.partialJson
    }
    return null
  }

  activeTools.delete(key)
  return tool
}

export function parseToolInputJson(inputJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(inputJson)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function isApprovalMode(mode: ApprovalMode): boolean {
  return mode === 'ask' || mode === 'plan'
}

export function deriveApprovalRequestFromEvent(
  event: UIStreamEvent,
  approvedTools: Set<string>,
  providerId: string,
  mode: ApprovalMode,
): UIStreamPermissionRequestEvent | null {
  if (!isApprovalMode(mode)) return null
  return checkForPermissionRequest(event, approvedTools, providerId)
}

export function deriveApprovalRequestFromProcessOutput(
  nonJsonOutput: string[],
  mode: ApprovalMode,
): UIStreamPermissionRequestEvent | null {
  if (!isApprovalMode(mode)) return null

  const inferred = extractPermissionRequestFromProcessOutput(nonJsonOutput)
  if (!inferred) return null

  const tools = normalizeTools(inferred.tools)
  return {
    type: 'permission_request',
    tool: tools[0] || 'Permission',
    tools,
    description: inferred.description,
  }
}

export function approveTools(approvedTools: Set<string>, tools: string[]) {
  for (const tool of tools) {
    const normalized = normalizeToolName(tool)
    if (normalized) {
      approvedTools.add(normalized)
    }
  }
}
