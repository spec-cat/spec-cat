/**
 * Server-side event subscriber that persists job events to conversation storage.
 *
 * When a job runs without a connected browser (e.g. POST /api/jobs from scheduler),
 * nobody consumes events from EventBus. This module subscribes to job events
 * and materializes them into ChatMessage records in the conversation JSON file,
 * mirroring what useChatStream does on the client side.
 */

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { eventBus, GLOBAL_CHANNEL } from './eventBus'
import type { JobEvent } from './eventBus'
import { upsertConversationInStorage } from './conversationStore'
import { getSpecCatDataDir } from './specCatStore'
import {
  generateMessageId,
  generateBlockId,
  STORAGE_VERSION,
} from '~/types/chat'
import type {
  ChatMessage,
  Conversation,
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
  ResultSummaryBlock,
  SessionInitBlock,
  UIStreamEvent,
} from '~/types/chat'

// ── Per-job accumulation state ─────────────────────────

interface ActiveTool {
  blockId: string
  toolUseId: string
  name: string
  inputJson: string
}

interface JobAccumulator {
  conversationId: string
  userMessage: string
  assistantMessageId: string
  contentBlocks: ContentBlock[]
  flatText: string
  currentTextBlockId: string | null
  currentThinkingBlockId: string | null
  activeTools: Map<number, ActiveTool>
  providerSessionId: string | null
  unsubscribe: () => void
  status: 'streaming' | 'complete' | 'error' | 'stopped'
}

const accumulators = new Map<string, JobAccumulator>()

function formatToolInputSummary(input: Record<string, unknown>): string {
  if (input.file_path) return String(input.file_path)
  if (input.path) return String(input.path)
  if (input.command) return String(input.command).slice(0, 50)
  return ''
}

// ── Public API ─────────────────────────────────────────

/**
 * Start persisting events for a server-initiated job.
 * Call this right after jobQueue.submit() for scheduler/cascade jobs.
 */
export function startPersisting(
  conversationId: string,
  userMessage: string,
): void {
  // Clean up any existing accumulator for this conversation
  const existing = accumulators.get(conversationId)
  if (existing) {
    existing.unsubscribe()
    accumulators.delete(conversationId)
  }

  const assistantMessageId = generateMessageId()

  const acc: JobAccumulator = {
    conversationId,
    userMessage,
    assistantMessageId,
    contentBlocks: [],
    flatText: '',
    currentTextBlockId: null,
    currentThinkingBlockId: null,
    activeTools: new Map(),
    providerSessionId: null,
    unsubscribe: () => {},
    status: 'streaming',
  }

  acc.unsubscribe = eventBus.subscribe(conversationId, (event) => {
    handleEvent(acc, event)
  })

  accumulators.set(conversationId, acc)
  console.log('[JobPersister] Started persisting for:', conversationId)
}

// ── Event handling ─────────────────────────────────────

function handleEvent(acc: JobAccumulator, event: JobEvent): void {
  try {
    if (event.type === 'ui_event' && event.event) {
      processUIEvent(acc, event.event as UIStreamEvent)
      return
    }

    if (event.type === 'done') {
      if (event.denied) {
        acc.status = 'stopped'
      } else {
        markRemainingToolBlocks(acc, 'complete')
        acc.status = 'complete'
      }
      finalize(acc)
      return
    }

    if (event.type === 'error') {
      markRemainingToolBlocks(acc, 'error')
      acc.status = 'error'
      const errorText = typeof event.error === 'string' ? event.error : 'Unknown error'
      appendTextBlock(acc, `\n\n**Error**: ${errorText}\n`)
      finalize(acc)
      return
    }

    if (event.type === 'session_reset') {
      const reason = typeof event.reason === 'string' ? event.reason : 'Session reset'
      appendTextBlock(acc, `\n\n> **Session Reset**: ${reason}\n\n`)
      return
    }

    if (event.type === 'permission_request') {
      markRemainingToolBlocks(acc, 'error')
      acc.status = 'stopped'
      const tool = typeof event.tool === 'string' ? event.tool : 'Permission'
      appendTextBlock(acc, `\n\n**Permission Required**: ${tool}\n`)
      finalize(acc)
      return
    }
  } catch (err) {
    console.error('[JobPersister] Error handling event:', err)
  }
}

/**
 * Unsubscribe and flush. flush is async but we fire-and-forget safely.
 */
function finalize(acc: JobAccumulator): void {
  // Unsubscribe first so no more events arrive
  acc.unsubscribe()
  accumulators.delete(acc.conversationId)

  // Fire-and-forget the async flush — errors are caught inside
  flush(acc)
}

function processUIEvent(acc: JobAccumulator, event: UIStreamEvent): void {
  if (event.sessionId) {
    acc.providerSessionId = event.sessionId
  }

  switch (event.type) {
    case 'session_init': {
      const block: SessionInitBlock = {
        id: generateBlockId(),
        type: 'session_init',
        model: event.model,
        tools: event.tools,
        permissionMode: event.permissionMode,
        cwd: event.cwd,
      }
      acc.contentBlocks.push(block)
      break
    }

    case 'block_start': {
      const blockId = event.blockId || generateBlockId()

      if (event.blockType === 'text') {
        const block: TextBlock = { id: blockId, type: 'text', text: event.text || '' }
        acc.contentBlocks.push(block)
        acc.currentTextBlockId = blockId
        if (event.text) acc.flatText += event.text
      } else if (event.blockType === 'thinking') {
        const block: ThinkingBlock = { id: blockId, type: 'thinking', thinking: event.thinking || '' }
        acc.contentBlocks.push(block)
        acc.currentThinkingBlockId = blockId
      } else if (event.blockType === 'tool_use' && event.toolUseId && event.name) {
        const block: ToolUseBlock = {
          id: blockId,
          type: 'tool_use',
          toolUseId: event.toolUseId,
          name: event.name,
          input: {},
          inputSummary: '',
          status: 'running',
        }
        acc.contentBlocks.push(block)
        acc.activeTools.set(event.index ?? 0, {
          blockId,
          toolUseId: event.toolUseId,
          name: event.name,
          inputJson: '',
        })
      }
      break
    }

    case 'block_delta': {
      if (event.text && acc.currentTextBlockId) {
        const block = acc.contentBlocks.find(b => b.id === acc.currentTextBlockId)
        if (block && block.type === 'text') {
          (block as TextBlock).text += event.text
          acc.flatText += event.text
        }
      }

      if (event.thinking && acc.currentThinkingBlockId) {
        const block = acc.contentBlocks.find(b => b.id === acc.currentThinkingBlockId)
        if (block && block.type === 'thinking') {
          (block as ThinkingBlock).thinking += event.thinking
        }
      }

      if (event.partialJson && event.index !== undefined) {
        const tool = acc.activeTools.get(event.index)
        if (tool) {
          tool.inputJson += event.partialJson
        }
      }
      break
    }

    case 'block_end': {
      if (acc.currentTextBlockId) {
        acc.currentTextBlockId = null
      }
      if (acc.currentThinkingBlockId) {
        acc.currentThinkingBlockId = null
      }
      if (event.index !== undefined) {
        const tool = acc.activeTools.get(event.index)
        if (tool) {
          let input: Record<string, unknown> = {}
          try { input = JSON.parse(tool.inputJson) } catch {}

          const block = acc.contentBlocks.find(b => b.id === tool.blockId)
          if (block && block.type === 'tool_use') {
            const tb = block as ToolUseBlock
            tb.input = input
            tb.inputSummary = formatToolInputSummary(input)
            tb.status = 'pending'
          }
        }
      }
      break
    }

    case 'tool_result': {
      const toolBlock = acc.contentBlocks.find(
        b => b.type === 'tool_use' && (b as ToolUseBlock).toolUseId === event.toolUseId,
      )
      if (toolBlock && toolBlock.type === 'tool_use') {
        (toolBlock as ToolUseBlock).status = event.isError ? 'error' : 'complete'
      }

      const block: ToolResultBlock = {
        id: generateBlockId(),
        type: 'tool_result',
        toolUseId: event.toolUseId,
        content: event.content || '',
        isError: !!event.isError,
      }
      acc.contentBlocks.push(block)
      break
    }

    case 'turn_result': {
      if (event.subtype !== 'success') {
        acc.status = 'error'
      }

      if (event.subtype === 'success' && event.usage) {
        const block: ResultSummaryBlock = {
          id: generateBlockId(),
          type: 'result_summary',
          totalCostUsd: event.totalCostUsd ?? 0,
          durationMs: event.durationMs ?? 0,
          numTurns: event.numTurns ?? 0,
          usage: event.usage,
        }
        acc.contentBlocks.push(block)
      }
      break
    }

    case 'error': {
      acc.status = 'error'
      break
    }
  }
}

// ── Helpers ────────────────────────────────────────────

function appendTextBlock(acc: JobAccumulator, text: string): void {
  const block: TextBlock = { id: generateBlockId(), type: 'text', text }
  acc.contentBlocks.push(block)
  acc.flatText += text
}

function markRemainingToolBlocks(acc: JobAccumulator, status: 'complete' | 'error'): void {
  for (const block of acc.contentBlocks) {
    if (block.type === 'tool_use') {
      const tb = block as ToolUseBlock
      if (tb.status === 'running' || tb.status === 'pending') {
        tb.status = status
      }
    }
  }
}

/**
 * Write the accumulated messages to conversation storage.
 *
 * For client-initiated chats the conversation file already contains the
 * user message and a placeholder assistant message (status 'streaming')
 * saved by the browser.  We find and update that message in place so
 * previous turns are preserved.
 *
 * For server-initiated chats (POST /api/jobs) the conversation may have
 * no messages yet, so we append user + assistant pair.
 */
async function flush(acc: JobAccumulator): Promise<void> {
  const now = new Date().toISOString()
  const finalStatus = acc.status === 'streaming' ? 'complete' : acc.status

  try {
    const dataDir = getSpecCatDataDir()
    const filePath = join(dataDir, 'conversations', `${acc.conversationId}.json`)

    let conversation: Conversation
    if (existsSync(filePath)) {
      const raw = await readFile(filePath, 'utf-8')
      conversation = JSON.parse(raw) as Conversation
    } else {
      conversation = {
        id: acc.conversationId,
        title: acc.userMessage.slice(0, 50),
        messages: [],
        createdAt: now,
        updatedAt: now,
        cwd: process.cwd(),
        source: 'scheduler',
      }
    }

    // Try to find the existing streaming assistant message (client-initiated).
    // Search from the end since it's always the last assistant message.
    let updated = false
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      const m = conversation.messages[i]
      if (m.role === 'assistant' && m.status === 'streaming') {
        conversation.messages[i] = {
          ...m,
          content: acc.flatText,
          contentBlocks: acc.contentBlocks,
          status: finalStatus,
          timestamp: now,
        }
        updated = true
        break
      }
    }

    if (!updated) {
      // Server-initiated or conversation had no streaming message — append
      const userMsg: ChatMessage = {
        id: generateMessageId(),
        role: 'user',
        content: acc.userMessage,
        timestamp: now,
      }
      const assistantMsg: ChatMessage = {
        id: acc.assistantMessageId,
        role: 'assistant',
        content: acc.flatText,
        contentBlocks: acc.contentBlocks,
        timestamp: now,
        status: finalStatus,
      }
      conversation.messages.push(userMsg, assistantMsg)
    }

    conversation.updatedAt = now
    if (acc.providerSessionId) {
      conversation.providerSessionId = acc.providerSessionId
    }

    await upsertConversationInStorage(conversation, STORAGE_VERSION)

    // Notify UI that persisted data is ready to read
    eventBus.emit(GLOBAL_CHANNEL, {
      type: 'notification',
      notificationEvent: 'job_persisted',
      conversationId: acc.conversationId,
    })

    console.log('[JobPersister] Flushed conversation:', {
      conversationId: acc.conversationId,
      status: acc.status,
      blocks: acc.contentBlocks.length,
      textLength: acc.flatText.length,
      updatedExisting: updated,
    })
  } catch (err) {
    console.error('[JobPersister] Failed to flush conversation:', err)
  }
}
