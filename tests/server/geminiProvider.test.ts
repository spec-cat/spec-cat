import { describe, expect, it } from 'vitest'
import geminiProvider from '~/server/utils/geminiProvider'

describe('geminiProvider toCanonicalEvents', () => {
  it('emits error event text when result status is not success', () => {
    const events = geminiProvider.toCanonicalEvents({
      type: 'result',
      session_id: 'gem-1',
      status: 'error',
      error: { message: 'quota exceeded' },
    })

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      type: 'turn_result',
      sessionId: 'gem-1',
      subtype: 'error',
    })
    expect(events[1]).toMatchObject({
      type: 'error',
      sessionId: 'gem-1',
      error: 'quota exceeded',
    })
  })

  it('emits error event text for explicit error events', () => {
    const events = geminiProvider.toCanonicalEvents({
      type: 'error',
      session_id: 'gem-2',
      error: { message: 'permission denied' },
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'error',
      sessionId: 'gem-2',
      error: 'permission denied',
    })
  })

  it('maps tool_use to block_start + block_delta + block_end', () => {
    const events = geminiProvider.toCanonicalEvents({
      type: 'tool_use',
      session_id: 'gem-3',
      tool_name: 'read_file',
      tool_id: 'read_file_123',
      parameters: { file_path: '/src/index.ts' },
    })

    const starts = events.filter(e => e.type === 'block_start')
    const toolStart = starts.find(e => (e as any).blockType === 'tool_use')
    expect(toolStart).toMatchObject({
      type: 'block_start',
      sessionId: 'gem-3',
      blockId: 'read_file_123',
      blockType: 'tool_use',
      name: 'read_file',
      toolUseId: 'read_file_123',
    })
    expect(typeof (toolStart as any).index).toBe('number')

    const delta = events.find(e => e.type === 'block_delta' && (e as any).blockId === 'read_file_123')
    expect(delta).toBeTruthy()
    expect(JSON.parse((delta as any).partialJson)).toEqual({ file_path: '/src/index.ts' })

    const end = events.find(e => e.type === 'block_end' && (e as any).blockId === 'read_file_123')
    expect(end).toBeTruthy()
  })

  it('maps tool_result success', () => {
    const events = geminiProvider.toCanonicalEvents({
      type: 'tool_result',
      session_id: 'gem-4',
      tool_id: 'read_file_123',
      status: 'success',
      output: 'file contents here',
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'tool_result',
      sessionId: 'gem-4',
      toolUseId: 'read_file_123',
      content: 'file contents here',
      isError: false,
    })
  })

  it('maps tool_result error with error.message', () => {
    const events = geminiProvider.toCanonicalEvents({
      type: 'tool_result',
      session_id: 'gem-5',
      tool_id: 'write_file_456',
      status: 'error',
      output: '',
      error: { type: 'invalid_tool_params', message: 'Path not in workspace' },
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'tool_result',
      sessionId: 'gem-5',
      toolUseId: 'write_file_456',
      content: 'Path not in workspace',
      isError: true,
    })
  })

  it('propagates session_id from init to events without session_id', () => {
    // Simulate the real Gemini CLI flow: only init has session_id
    const initEvents = geminiProvider.toCanonicalEvents({
      type: 'init',
      session_id: 'gem-real-uuid-123',
      model: 'auto-gemini-3',
    })
    expect(initEvents[0]).toMatchObject({
      type: 'session_init',
      sessionId: 'gem-real-uuid-123',
    })

    // Message event WITHOUT session_id should inherit from init
    const msgEvents = geminiProvider.toCanonicalEvents({
      type: 'message',
      role: 'assistant',
      content: 'Hello',
      delta: true,
    })
    const textStart = msgEvents.find(e => e.type === 'block_start')
    expect((textStart as any)?.sessionId).toBe('gem-real-uuid-123')

    // tool_use WITHOUT session_id should also inherit
    const toolEvents = geminiProvider.toCanonicalEvents({
      type: 'tool_use',
      tool_name: 'read_file',
      tool_id: 'rf_inherit',
      parameters: { file_path: '/a.txt' },
    })
    const toolStart = toolEvents.find(e => e.type === 'block_start' && (e as any).blockType === 'tool_use')
    expect((toolStart as any)?.sessionId).toBe('gem-real-uuid-123')

    // tool_result WITHOUT session_id should also inherit
    const resultEvents = geminiProvider.toCanonicalEvents({
      type: 'tool_result',
      tool_id: 'rf_inherit',
      status: 'success',
      output: 'contents',
    })
    expect((resultEvents[0] as any)?.sessionId).toBe('gem-real-uuid-123')

    // Clean up
    geminiProvider.toCanonicalEvents({
      type: 'result',
      session_id: 'gem-real-uuid-123',
      status: 'success',
    })
  })

  it('ends open text block before tool_use and reopens after', () => {
    // Init to set session
    geminiProvider.toCanonicalEvents({
      type: 'init',
      session_id: 'gem-7',
      model: 'auto-gemini-3',
    })

    // Emit a text message to open a text block
    const textEvents = geminiProvider.toCanonicalEvents({
      type: 'message',
      role: 'assistant',
      content: 'Let me read that file.',
      delta: true,
    })
    expect(textEvents.find(e => e.type === 'block_start' && (e as any).blockType === 'text')).toBeTruthy()

    // Emit a tool_use — should close the text block first
    const toolEvents = geminiProvider.toCanonicalEvents({
      type: 'tool_use',
      tool_name: 'read_file',
      tool_id: 'rf_7',
      parameters: { file_path: '/a.txt' },
    })

    const textEnd = toolEvents.find(e => e.type === 'block_end' && (e as any).blockId?.startsWith('gemini-text-'))
    expect(textEnd).toBeTruthy()
    expect(toolEvents.find(e => e.type === 'block_start' && (e as any).blockType === 'tool_use')).toBeTruthy()

    // After tool, new text message should create a NEW text block
    const newTextEvents = geminiProvider.toCanonicalEvents({
      type: 'message',
      role: 'assistant',
      content: 'Here is the result.',
      delta: true,
    })

    const newTextStart = newTextEvents.find(e => e.type === 'block_start' && (e as any).blockType === 'text')
    expect(newTextStart).toBeTruthy()

    // Clean up session state
    geminiProvider.toCanonicalEvents({
      type: 'result',
      session_id: 'gem-7',
      status: 'success',
    })
  })
})
