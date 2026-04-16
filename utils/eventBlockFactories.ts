import type {
  SessionInitBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
  ResultSummaryBlock,
  UIStreamSessionInitEvent,
  UIStreamBlockStartEvent,
  UIStreamToolResultEvent,
  UIStreamTurnResultEvent,
} from '~/types/chat'
import { generateBlockId } from '~/types/chat'

/**
 * Per-tool tracking entry used by both live and replay processors. Exported
 * so consumers can declare a typed Map.
 */
export interface ActiveToolEntry {
  blockId: string
  toolUseId: string
  name: string
  inputJson: string
}

/** Build a SessionInitBlock from a session_init UI stream event. */
export function buildSessionInitBlock(
  event: UIStreamSessionInitEvent,
  makeId: () => string = generateBlockId,
): SessionInitBlock {
  return {
    id: makeId(),
    type: 'session_init',
    model: event.model,
    tools: event.tools,
    permissionMode: event.permissionMode,
    cwd: event.cwd,
  }
}

/** Build a TextBlock from a block_start event (uses event's blockId when provided). */
export function buildTextBlock(
  event: UIStreamBlockStartEvent,
  makeId: () => string = generateBlockId,
): TextBlock {
  return {
    id: event.blockId || makeId(),
    type: 'text',
    text: event.text || '',
  }
}

/** Build a ThinkingBlock from a block_start event. */
export function buildThinkingBlock(
  event: UIStreamBlockStartEvent,
  makeId: () => string = generateBlockId,
): ThinkingBlock {
  return {
    id: event.blockId || makeId(),
    type: 'thinking',
    thinking: event.thinking || '',
  }
}

/**
 * Build a ToolUseBlock + matching ActiveToolEntry from a tool block_start
 * event. Returns null when required fields (toolUseId, name) are missing.
 */
export function buildToolUseStart(
  event: UIStreamBlockStartEvent,
  makeId: () => string = generateBlockId,
): { block: ToolUseBlock; tracking: ActiveToolEntry; index: number } | null {
  if (!event.toolUseId || !event.name) return null
  const blockId = event.blockId || makeId()
  return {
    block: {
      id: blockId,
      type: 'tool_use',
      toolUseId: event.toolUseId,
      name: event.name,
      input: {},
      inputSummary: '',
      status: 'running',
    },
    tracking: {
      blockId,
      toolUseId: event.toolUseId,
      name: event.name,
      inputJson: '',
    },
    index: event.index ?? 0,
  }
}

/** Build a ToolResultBlock from a tool_result event. */
export function buildToolResultBlock(
  event: UIStreamToolResultEvent,
  makeId: () => string = generateBlockId,
): ToolResultBlock {
  return {
    id: makeId(),
    type: 'tool_result',
    toolUseId: event.toolUseId,
    content: event.content || '',
    isError: !!event.isError,
  }
}

/**
 * Build a ResultSummaryBlock from a successful turn_result event. Returns
 * null when usage is absent (non-success turns carry no summary).
 */
export function buildResultSummaryBlock(
  event: UIStreamTurnResultEvent,
  makeId: () => string = generateBlockId,
): ResultSummaryBlock | null {
  if (event.subtype !== 'success' || !event.usage) return null
  return {
    id: makeId(),
    type: 'result_summary',
    totalCostUsd: event.totalCostUsd ?? 0,
    durationMs: event.durationMs ?? 0,
    numTurns: event.numTurns ?? 0,
    usage: event.usage,
  }
}

/**
 * Locate a tool tracking entry by index (primary) or blockId (fallback).
 * Used by block_delta and block_end processors.
 */
export function findActiveToolByIndexOrBlock(
  activeTools: ReadonlyMap<number, ActiveToolEntry>,
  index: number | undefined,
  blockId: string | undefined,
): ActiveToolEntry | undefined {
  if (index !== undefined) {
    const byIndex = activeTools.get(index)
    if (byIndex) return byIndex
  }
  if (blockId) {
    for (const [, t] of activeTools) {
      if (t.blockId === blockId) return t
    }
  }
  return undefined
}
