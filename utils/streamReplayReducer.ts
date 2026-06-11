import type {
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  UIStreamEvent,
} from '~/types/chat'
import { generateBlockId } from '~/types/chat'
import { formatToolInputSummary } from '~/utils/chatStream'
import { markToolBlocks } from '~/utils/chatStreamHelpers'
import {
  buildResultSummaryBlock,
  buildSessionInitBlock,
  buildTextBlock,
  buildThinkingBlock,
  buildToolResultBlock,
  buildToolUseStart,
  findActiveToolByIndexOrBlock,
  type ActiveToolEntry,
} from '~/utils/eventBlockFactories'

/** Input event shape accepted by the reducer (subset of the WS response envelope). */
export interface ReplayInputEvent {
  type: 'ui_event' | 'done' | 'error' | string
  event?: UIStreamEvent
  denied?: boolean
  aborted?: boolean
  awaitingUserInput?: boolean
}

export interface ReplayReduction {
  contentBlocks: ContentBlock[]
  flatText: string
  currentTextBlockId: string | null
  currentThinkingBlockId: string | null
  activeTools: Map<number, ActiveToolEntry>
  finalStatus: 'streaming' | 'complete' | 'error' | 'stopped'
  isDone: boolean
  /** Provider session IDs observed during the replay window, in order. */
  providerSessionIds: string[]
}

/**
 * Pure reducer that folds a batch of replay events into a set of content
 * blocks and the associated streaming metadata. No chat-store or WebSocket
 * access — callers apply the result as a single reactive mutation.
 */
export function reduceReplayEvents(
  events: readonly ReplayInputEvent[],
  makeBlockId: () => string = generateBlockId,
): ReplayReduction {
  const contentBlocks: ContentBlock[] = []
  const activeTools = new Map<number, ActiveToolEntry>()
  const providerSessionIds: string[] = []

  let flatText = ''
  let currentTextBlockId: string | null = null
  let currentThinkingBlockId: string | null = null
  let finalStatus: ReplayReduction['finalStatus'] = 'streaming'
  let isDone = false

  for (const response of events) {
    if (response.type === 'done') {
      if (response.denied || response.aborted) {
        markToolBlocks(contentBlocks, 'error')
        finalStatus = 'stopped'
      } else if (response.awaitingUserInput) {
        finalStatus = 'complete'
      } else if (finalStatus === 'error' || finalStatus === 'stopped') {
        markToolBlocks(contentBlocks, 'error')
      } else {
        markToolBlocks(contentBlocks, 'complete')
        finalStatus = 'complete'
      }
      isDone = true
      continue
    }

    if (response.type === 'error') {
      markToolBlocks(contentBlocks, 'error')
      finalStatus = 'error'
      continue
    }

    if (response.type !== 'ui_event' || !response.event) continue
    const event = response.event

    if (event.sessionId) {
      providerSessionIds.push(event.sessionId)
    }

    switch (event.type) {
      case 'session_init': {
        contentBlocks.push(buildSessionInitBlock(event, makeBlockId))
        break
      }

      case 'block_start': {
        if (event.blockType === 'text') {
          const block = buildTextBlock(event, makeBlockId)
          contentBlocks.push(block)
          currentTextBlockId = block.id
          if (event.text) flatText += event.text
        } else if (event.blockType === 'thinking') {
          const block = buildThinkingBlock(event, makeBlockId)
          contentBlocks.push(block)
          currentThinkingBlockId = block.id
        } else if (event.blockType === 'tool_use') {
          const toolStart = buildToolUseStart(event, makeBlockId)
          if (toolStart) {
            contentBlocks.push(toolStart.block)
            activeTools.set(toolStart.index, toolStart.tracking)
          }
        }
        break
      }

      case 'block_delta': {
        if (event.text && currentTextBlockId) {
          const block = contentBlocks.find(b => b.id === currentTextBlockId)
          if (block && block.type === 'text') {
            (block as TextBlock).text += event.text
            flatText += event.text
          }
        }
        if (event.thinking && currentThinkingBlockId) {
          const block = contentBlocks.find(b => b.id === currentThinkingBlockId)
          if (block && block.type === 'thinking') {
            (block as ThinkingBlock).thinking += event.thinking
          }
        }
        if (event.partialJson) {
          const tool = findActiveToolByIndexOrBlock(activeTools, event.index, event.blockId)
          if (tool) tool.inputJson += event.partialJson
        }
        break
      }

      case 'block_end': {
        const tool = findActiveToolByIndexOrBlock(activeTools, event.index, event.blockId)
        if (!tool) {
          if (currentTextBlockId) currentTextBlockId = null
          if (currentThinkingBlockId) currentThinkingBlockId = null
        } else {
          let input: Record<string, unknown> = {}
          try { input = JSON.parse(tool.inputJson) } catch {}
          const block = contentBlocks.find(b => b.id === tool.blockId)
          if (block && block.type === 'tool_use') {
            const tb = block as ToolUseBlock
            tb.input = input
            tb.inputSummary = formatToolInputSummary(input)
            tb.status = 'pending'
          }
          // Drop the finalized tool so a later block_end reusing the same index
          // (indexes restart per assistant message) is treated as text/thinking.
          for (const [key, entry] of activeTools) {
            if (entry === tool) {
              activeTools.delete(key)
              break
            }
          }
        }
        break
      }

      case 'tool_result': {
        const toolBlock = contentBlocks.find(
          b => b.type === 'tool_use' && (b as ToolUseBlock).toolUseId === event.toolUseId,
        )
        if (toolBlock && toolBlock.type === 'tool_use') {
          (toolBlock as ToolUseBlock).status = event.isError ? 'error' : 'complete'
        }
        contentBlocks.push(buildToolResultBlock(event, makeBlockId))
        break
      }

      case 'turn_result': {
        if (event.subtype !== 'success') {
          finalStatus = 'error'
        }
        const summary = buildResultSummaryBlock(event, makeBlockId)
        if (summary) contentBlocks.push(summary)
        break
      }

      case 'error': {
        finalStatus = 'error'
        break
      }
    }
  }

  return {
    contentBlocks,
    flatText,
    currentTextBlockId,
    currentThinkingBlockId,
    activeTools,
    finalStatus,
    isDone,
    providerSessionIds,
  }
}
