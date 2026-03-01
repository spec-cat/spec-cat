import type { UIStreamEvent, UIStreamPermissionRequestEvent } from '~/types/chat'
import {
  checkForPermissionRequest,
  extractPermissionRequestFromProcessOutput,
  normalizeToolName,
  normalizeTools,
} from '~/server/utils/uiAdapter'

export type ApprovalMode = 'plan' | 'ask' | 'auto' | 'bypass'

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
