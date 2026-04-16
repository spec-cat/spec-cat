import { describe, expect, it } from 'vitest'
import { reduceReplayEvents, type ReplayInputEvent } from '~/utils/streamReplayReducer'
import type { TextBlock, ThinkingBlock, ToolUseBlock, ToolResultBlock, ResultSummaryBlock, SessionInitBlock } from '~/types/chat'

// Helpers — build a deterministic id sequence for readable assertions.
function makeIdGenerator(): () => string {
  let n = 0
  return () => `b${++n}`
}

function uiEvent(event: any): ReplayInputEvent {
  return { type: 'ui_event', event }
}

describe('reduceReplayEvents', () => {
  it('returns a pristine empty reduction for no events', () => {
    const result = reduceReplayEvents([])
    expect(result).toMatchObject({
      contentBlocks: [],
      flatText: '',
      currentTextBlockId: null,
      currentThinkingBlockId: null,
      finalStatus: 'streaming',
      isDone: false,
      providerSessionIds: [],
    })
    expect(result.activeTools.size).toBe(0)
  })

  it('captures session_init as a content block', () => {
    const result = reduceReplayEvents(
      [
        uiEvent({
          type: 'session_init',
          model: 'claude-4',
          tools: ['Read', 'Write'],
          permissionMode: 'ask',
          cwd: '/a',
        }),
      ],
      makeIdGenerator(),
    )
    expect(result.contentBlocks).toHaveLength(1)
    const block = result.contentBlocks[0] as SessionInitBlock
    expect(block.type).toBe('session_init')
    expect(block.model).toBe('claude-4')
    expect(block.tools).toEqual(['Read', 'Write'])
  })

  it('tracks sessionId as a side output (caller applies to store)', () => {
    const result = reduceReplayEvents([
      uiEvent({ type: 'session_init', model: 'm', tools: [], permissionMode: 'ask', cwd: '/', sessionId: 'sid-1' }),
      uiEvent({ type: 'block_start', blockId: 't1', blockType: 'text', text: '' }),
      uiEvent({ type: 'block_delta', blockId: 't1', text: 'hi', sessionId: 'sid-2' }),
    ])
    expect(result.providerSessionIds).toEqual(['sid-1', 'sid-2'])
  })

  it('builds a text block and appends deltas to flatText and the block', () => {
    const result = reduceReplayEvents([
      uiEvent({ type: 'block_start', blockId: 'tx', blockType: 'text', text: 'Hello' }),
      uiEvent({ type: 'block_delta', blockId: 'tx', text: ' world' }),
      uiEvent({ type: 'block_delta', blockId: 'tx', text: '!' }),
    ])
    const [block] = result.contentBlocks
    expect((block as TextBlock).text).toBe('Hello world!')
    expect(result.flatText).toBe('Hello world!')
    expect(result.currentTextBlockId).toBe('tx')
  })

  it('builds a thinking block and accumulates thinking deltas', () => {
    const result = reduceReplayEvents([
      uiEvent({ type: 'block_start', blockId: 'th', blockType: 'thinking', thinking: 'first.' }),
      uiEvent({ type: 'block_delta', blockId: 'th', thinking: ' next.' }),
    ])
    const block = result.contentBlocks[0] as ThinkingBlock
    expect(block.thinking).toBe('first. next.')
    expect(result.flatText).toBe('')
  })

  it('accumulates tool_use input via partialJson then finalizes on block_end', () => {
    const result = reduceReplayEvents([
      uiEvent({ type: 'block_start', blockId: 'tu1', blockType: 'tool_use', index: 0, name: 'Read', toolUseId: 'use-1' }),
      uiEvent({ type: 'block_delta', blockId: 'tu1', index: 0, partialJson: '{"path":' }),
      uiEvent({ type: 'block_delta', blockId: 'tu1', index: 0, partialJson: ' "/a/b"}' }),
      uiEvent({ type: 'block_end', blockId: 'tu1', index: 0 }),
    ])
    const tool = result.contentBlocks[0] as ToolUseBlock
    expect(tool.type).toBe('tool_use')
    expect(tool.input).toEqual({ path: '/a/b' })
    expect(tool.inputSummary).toBe('/a/b')
    expect(tool.status).toBe('pending')
  })

  it('gracefully handles invalid JSON in tool input (falls back to empty object)', () => {
    const result = reduceReplayEvents([
      uiEvent({ type: 'block_start', blockId: 'tu1', blockType: 'tool_use', index: 0, name: 'X', toolUseId: 'u1' }),
      uiEvent({ type: 'block_delta', blockId: 'tu1', index: 0, partialJson: '{invalid' }),
      uiEvent({ type: 'block_end', blockId: 'tu1', index: 0 }),
    ])
    const tool = result.contentBlocks[0] as ToolUseBlock
    expect(tool.input).toEqual({})
    expect(tool.status).toBe('pending')
  })

  it('pairs tool_result with matching tool_use and sets its status', () => {
    const result = reduceReplayEvents([
      uiEvent({ type: 'block_start', blockId: 'tu1', blockType: 'tool_use', index: 0, name: 'Bash', toolUseId: 'u-x' }),
      uiEvent({ type: 'block_end', blockId: 'tu1', index: 0 }),
      uiEvent({ type: 'tool_result', toolUseId: 'u-x', content: 'output', isError: false }),
    ])
    const tool = result.contentBlocks[0] as ToolUseBlock
    const tr = result.contentBlocks[1] as ToolResultBlock
    expect(tool.status).toBe('complete')
    expect(tr.type).toBe('tool_result')
    expect(tr.content).toBe('output')
    expect(tr.isError).toBe(false)
  })

  it('marks tool_use as error when tool_result.isError is true', () => {
    const result = reduceReplayEvents([
      uiEvent({ type: 'block_start', blockId: 't', blockType: 'tool_use', index: 0, name: 'Bash', toolUseId: 'u' }),
      uiEvent({ type: 'block_end', blockId: 't', index: 0 }),
      uiEvent({ type: 'tool_result', toolUseId: 'u', content: 'bad', isError: true }),
    ])
    const tool = result.contentBlocks[0] as ToolUseBlock
    expect(tool.status).toBe('error')
  })

  it('appends a result_summary block on successful turn_result with usage', () => {
    const result = reduceReplayEvents([
      uiEvent({
        type: 'turn_result',
        subtype: 'success',
        totalCostUsd: 0.01,
        durationMs: 123,
        numTurns: 2,
        usage: { inputTokens: 1, outputTokens: 2, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      }),
    ])
    const summary = result.contentBlocks[0] as ResultSummaryBlock
    expect(summary.type).toBe('result_summary')
    expect(summary.totalCostUsd).toBe(0.01)
    expect(summary.durationMs).toBe(123)
  })

  it('marks finalStatus as error on non-success turn_result', () => {
    const result = reduceReplayEvents([
      uiEvent({ type: 'turn_result', subtype: 'max_turns' }),
    ])
    expect(result.finalStatus).toBe('error')
  })

  it('done event without denied sets status to complete and marks tools complete', () => {
    const result = reduceReplayEvents([
      uiEvent({ type: 'block_start', blockId: 't', blockType: 'tool_use', index: 0, name: 'R', toolUseId: 'u' }),
      { type: 'done' },
    ])
    expect(result.finalStatus).toBe('complete')
    expect(result.isDone).toBe(true)
    expect((result.contentBlocks[0] as ToolUseBlock).status).toBe('complete')
  })

  it('done with denied=true sets status to stopped and marks tools error', () => {
    const result = reduceReplayEvents([
      uiEvent({ type: 'block_start', blockId: 't', blockType: 'tool_use', index: 0, name: 'R', toolUseId: 'u' }),
      { type: 'done', denied: true },
    ])
    expect(result.finalStatus).toBe('stopped')
    expect((result.contentBlocks[0] as ToolUseBlock).status).toBe('error')
  })

  it('error response sets finalStatus to error and marks tool blocks error', () => {
    const result = reduceReplayEvents([
      uiEvent({ type: 'block_start', blockId: 't', blockType: 'tool_use', index: 0, name: 'R', toolUseId: 'u' }),
      { type: 'error' },
    ])
    expect(result.finalStatus).toBe('error')
    expect((result.contentBlocks[0] as ToolUseBlock).status).toBe('error')
  })

  it('preserves prior error/stopped status on subsequent done', () => {
    const result = reduceReplayEvents([
      { type: 'error' },
      { type: 'done' },
    ])
    expect(result.finalStatus).toBe('error')
    expect(result.isDone).toBe(true)
  })

  it('uses injected id generator for new block ids', () => {
    const gen = makeIdGenerator()
    const result = reduceReplayEvents(
      [
        uiEvent({ type: 'session_init', model: 'm', tools: [], permissionMode: 'ask', cwd: '/' }),
        uiEvent({ type: 'block_start', blockType: 'text', blockId: '', text: 'x' }),
      ],
      gen,
    )
    expect(result.contentBlocks[0].id).toBe('b1')
    expect(result.contentBlocks[1].id).toBe('b2')
  })

  it('does not duplicate session_init blocks on repeated sessionId', () => {
    const result = reduceReplayEvents([
      uiEvent({ type: 'session_init', model: 'm', tools: [], permissionMode: 'ask', cwd: '/', sessionId: 's' }),
      uiEvent({ type: 'block_delta', blockId: 'x', text: 'hi', sessionId: 's' }),
    ])
    // Only the session_init produces a block; sessionId side-effects go to providerSessionIds
    expect(result.contentBlocks).toHaveLength(1)
    expect(result.providerSessionIds).toEqual(['s', 's'])
  })
})
