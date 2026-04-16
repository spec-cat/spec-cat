import { describe, expect, it } from 'vitest'
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

const ids = (() => {
  let n = 0
  return () => `id${++n}`
})()

describe('buildSessionInitBlock', () => {
  it('maps event fields to SessionInitBlock', () => {
    const block = buildSessionInitBlock(
      { type: 'session_init', model: 'm', tools: ['T'], permissionMode: 'ask', cwd: '/' } as any,
      () => 'b-1',
    )
    expect(block).toEqual({
      id: 'b-1',
      type: 'session_init',
      model: 'm',
      tools: ['T'],
      permissionMode: 'ask',
      cwd: '/',
    })
  })
})

describe('buildTextBlock', () => {
  it('uses event.blockId when present', () => {
    const block = buildTextBlock({ type: 'block_start', blockId: 'eid', blockType: 'text', text: 'hi' } as any, ids)
    expect(block.id).toBe('eid')
    expect(block.text).toBe('hi')
  })

  it('falls back to generated id when blockId is missing', () => {
    const block = buildTextBlock({ type: 'block_start', blockId: '', blockType: 'text' } as any, () => 'gen')
    expect(block.id).toBe('gen')
    expect(block.text).toBe('')
  })
})

describe('buildThinkingBlock', () => {
  it('preserves thinking text and blockId', () => {
    const block = buildThinkingBlock({ type: 'block_start', blockId: 't', blockType: 'thinking', thinking: 'x' } as any)
    expect(block).toMatchObject({ id: 't', type: 'thinking', thinking: 'x' })
  })

  it('defaults thinking to empty string', () => {
    const block = buildThinkingBlock({ type: 'block_start', blockId: 't', blockType: 'thinking' } as any)
    expect(block.thinking).toBe('')
  })
})

describe('buildToolUseStart', () => {
  it('returns block + tracking + index when all fields present', () => {
    const result = buildToolUseStart(
      { type: 'block_start', blockId: 'b', blockType: 'tool_use', index: 2, name: 'Bash', toolUseId: 'u' } as any,
      () => 'fallback',
    )
    expect(result).not.toBeNull()
    expect(result!.block).toMatchObject({ id: 'b', name: 'Bash', toolUseId: 'u', status: 'running' })
    expect(result!.tracking).toEqual({ blockId: 'b', toolUseId: 'u', name: 'Bash', inputJson: '' })
    expect(result!.index).toBe(2)
  })

  it('returns null when toolUseId is missing', () => {
    const result = buildToolUseStart({ type: 'block_start', blockType: 'tool_use', name: 'X' } as any)
    expect(result).toBeNull()
  })

  it('returns null when name is missing', () => {
    const result = buildToolUseStart({ type: 'block_start', blockType: 'tool_use', toolUseId: 'u' } as any)
    expect(result).toBeNull()
  })

  it('defaults index to 0 when missing', () => {
    const result = buildToolUseStart({ type: 'block_start', blockType: 'tool_use', name: 'X', toolUseId: 'u' } as any)
    expect(result?.index).toBe(0)
  })
})

describe('buildToolResultBlock', () => {
  it('maps event fields and coerces isError', () => {
    const block = buildToolResultBlock(
      { type: 'tool_result', toolUseId: 'u', content: 'out', isError: false } as any,
      () => 'r-1',
    )
    expect(block).toEqual({
      id: 'r-1',
      type: 'tool_result',
      toolUseId: 'u',
      content: 'out',
      isError: false,
    })
  })

  it('treats missing content as empty string', () => {
    const block = buildToolResultBlock({ type: 'tool_result', toolUseId: 'u', isError: true } as any, () => 'r')
    expect(block.content).toBe('')
    expect(block.isError).toBe(true)
  })
})

describe('buildResultSummaryBlock', () => {
  it('returns a block on successful turn with usage', () => {
    const block = buildResultSummaryBlock(
      {
        type: 'turn_result',
        subtype: 'success',
        totalCostUsd: 0.1,
        durationMs: 100,
        numTurns: 3,
        usage: { inputTokens: 1, outputTokens: 2, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      } as any,
      () => 's-1',
    )
    expect(block).not.toBeNull()
    expect(block).toMatchObject({ type: 'result_summary', totalCostUsd: 0.1, durationMs: 100, numTurns: 3 })
  })

  it('returns null when subtype is not success', () => {
    const block = buildResultSummaryBlock(
      { type: 'turn_result', subtype: 'max_turns', usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } } as any,
    )
    expect(block).toBeNull()
  })

  it('returns null when usage is missing', () => {
    const block = buildResultSummaryBlock({ type: 'turn_result', subtype: 'success' } as any)
    expect(block).toBeNull()
  })

  it('defaults missing cost/duration/turns to 0', () => {
    const block = buildResultSummaryBlock(
      { type: 'turn_result', subtype: 'success', usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } } as any,
    )
    expect(block).toMatchObject({ totalCostUsd: 0, durationMs: 0, numTurns: 0 })
  })
})

describe('findActiveToolByIndexOrBlock', () => {
  const tool: ActiveToolEntry = { blockId: 'b1', toolUseId: 'u', name: 'R', inputJson: '' }
  const tools = new Map<number, ActiveToolEntry>([[0, tool]])

  it('prefers index match when provided', () => {
    expect(findActiveToolByIndexOrBlock(tools, 0, 'other')).toBe(tool)
  })

  it('falls back to blockId match when index misses', () => {
    expect(findActiveToolByIndexOrBlock(tools, 99, 'b1')).toBe(tool)
  })

  it('returns undefined when neither matches', () => {
    expect(findActiveToolByIndexOrBlock(tools, 99, 'missing')).toBeUndefined()
  })

  it('returns undefined when both lookups are unsupplied', () => {
    expect(findActiveToolByIndexOrBlock(tools, undefined, undefined)).toBeUndefined()
  })
})
