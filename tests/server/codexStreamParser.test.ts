import { describe, expect, it } from 'vitest'
import { mapCodexEventToProviderJson, processCodexJsonLine } from '~/server/utils/codexStreamParser'

describe('codexStreamParser', () => {
  it('maps agent_message_delta into stream block events', () => {
    const mapped = mapCodexEventToProviderJson({ type: 'agent_message_delta', delta: 'hello', thread_id: 't1' })
    expect(mapped).toHaveLength(3)
    expect(mapped[0]).toMatchObject({ type: 'stream_event', session_id: 't1' })
    expect(mapped[1]).toMatchObject({ event: { type: 'content_block_delta', delta: { text: 'hello' } } })
  })

  it('extracts diagnostics from turn.failed event', () => {
    const line = JSON.stringify({ type: 'turn.failed', error: { message: 'boom' } })
    const result = processCodexJsonLine(line)
    expect(result.diagnostics).toContain('Codex turn failed: boom')
  })

  it('unwraps event_msg payload for agent_message', () => {
    const line = JSON.stringify({
      type: 'event_msg',
      payload: { type: 'agent_message', message: 'hello from envelope', thread_id: 'thread-1' },
    })
    const result = processCodexJsonLine(line)
    expect(result.mappedEvents).toHaveLength(2)
    expect(result.mappedEvents[0]).toMatchObject({
      type: 'stream_event',
      session_id: 'thread-1',
      event: {
        type: 'content_block_start',
        content_block: { type: 'text', text: 'hello from envelope' },
      },
    })
  })

  it('unwraps event_msg payload for task_complete', () => {
    const line = JSON.stringify({
      type: 'event_msg',
      payload: { type: 'task_complete', thread_id: 'thread-2' },
    })
    const result = processCodexJsonLine(line)
    expect(result.mappedEvents).toHaveLength(1)
    expect(result.mappedEvents[0]).toMatchObject({
      type: 'result',
      session_id: 'thread-2',
      subtype: 'success',
    })
  })

  it('unwraps item.completed envelope for agent_message item', () => {
    const line = JSON.stringify({
      type: 'item.completed',
      thread_id: 'thread-9',
      item: { id: 'item_0', type: 'agent_message', text: 'hello from item envelope' },
    })
    const result = processCodexJsonLine(line)
    expect(result.mappedEvents).toHaveLength(2)
    expect(result.mappedEvents[0]).toMatchObject({
      type: 'stream_event',
      session_id: 'thread-9',
      event: {
        type: 'content_block_start',
        content_block: { type: 'text', text: 'hello from item envelope' },
      },
    })
  })

  it('unwraps response.output_item.done envelope for function_call item', () => {
    const line = JSON.stringify({
      type: 'response.output_item.done',
      thread_id: 'thread-11',
      item: {
        type: 'function_call',
        call_id: 'call_789',
        name: 'Read',
        arguments: '{"file_path":"README.md"}',
      },
    })

    const result = processCodexJsonLine(line)
    expect(result.mappedEvents).toHaveLength(3)
    expect(result.mappedEvents[0]).toMatchObject({
      type: 'stream_event',
      session_id: 'thread-11',
      event: {
        type: 'content_block_start',
        content_block: { type: 'tool_use', id: 'call_789', name: 'Read' },
      },
    })
  })

  it('unwraps item.started envelope for function_call item', () => {
    const line = JSON.stringify({
      type: 'item.started',
      thread_id: 'thread-11b',
      item: {
        type: 'function_call',
        call_id: 'call_790',
        name: 'Read',
        arguments: '{"file_path":"specs/018-codex-provider-integration/spec.md"}',
      },
    })

    const result = processCodexJsonLine(line)
    expect(result.mappedEvents).toHaveLength(3)
    expect(result.mappedEvents[0]).toMatchObject({
      type: 'stream_event',
      session_id: 'thread-11b',
      event: {
        type: 'content_block_start',
        content_block: { type: 'tool_use', id: 'call_790', name: 'Read' },
      },
    })
  })

  it('maps response.output_text.delta into stream text delta events', () => {
    const line = JSON.stringify({
      type: 'response.output_text.delta',
      thread_id: 'thread-12',
      delta: 'partial text',
    })
    const result = processCodexJsonLine(line)
    expect(result.mappedEvents).toHaveLength(3)
    expect(result.mappedEvents[1]).toMatchObject({
      type: 'stream_event',
      session_id: 'thread-12',
      event: {
        type: 'content_block_delta',
        delta: { text: 'partial text' },
      },
    })
  })

  it('maps response.completed into result success event', () => {
    const line = JSON.stringify({
      type: 'response.completed',
      thread_id: 'thread-13',
      response: { id: 'resp_1' },
    })
    const result = processCodexJsonLine(line)
    expect(result.mappedEvents).toHaveLength(1)
    expect(result.mappedEvents[0]).toMatchObject({
      type: 'result',
      session_id: 'thread-13',
      subtype: 'success',
    })
  })

  it('maps reasoning into thinking content block events', () => {
    const mapped = mapCodexEventToProviderJson({
      type: 'reasoning',
      thread_id: 'thread-14',
      summary: [{ text: 'Inspecting repository structure' }],
    })
    expect(mapped).toHaveLength(2)
    expect(mapped[0]).toMatchObject({
      type: 'stream_event',
      session_id: 'thread-14',
      event: {
        type: 'content_block_start',
        content_block: { type: 'thinking', thinking: 'Inspecting repository structure' },
      },
    })
  })

  it('maps read_file_begin into tool_use stream events', () => {
    const mapped = mapCodexEventToProviderJson({
      type: 'read_file_begin',
      thread_id: 'thread-15',
      call_id: 'call_read_1',
      path: 'specs/018-codex-provider-integration/spec.md',
    })

    expect(mapped).toHaveLength(3)
    expect(mapped[0]).toMatchObject({
      type: 'stream_event',
      session_id: 'thread-15',
      event: {
        type: 'content_block_start',
        content_block: { type: 'tool_use', id: 'call_read_1', name: 'ReadFile' },
      },
    })
  })

  it('maps read_file_end into tool_result event', () => {
    const mapped = mapCodexEventToProviderJson({
      type: 'read_file_end',
      thread_id: 'thread-16',
      call_id: 'call_read_2',
      output: 'file content preview',
    })

    expect(mapped).toHaveLength(1)
    expect(mapped[0]).toMatchObject({
      type: 'tool_result',
      session_id: 'thread-16',
      tool_use_id: 'call_read_2',
      content: 'file content preview',
      is_error: false,
    })
  })

  it('infers Read tool when name is missing but input has file_path', () => {
    const mapped = mapCodexEventToProviderJson({
      type: 'function_call',
      thread_id: 'thread-16b',
      call_id: 'call_read_3',
      arguments: { file_path: 'specs/001-app-layout/spec.md' },
    })

    expect(mapped).toHaveLength(3)
    expect(mapped[0]).toMatchObject({
      type: 'stream_event',
      session_id: 'thread-16b',
      event: {
        type: 'content_block_start',
        content_block: { type: 'tool_use', id: 'call_read_3', name: 'Read' },
      },
    })
  })

  it('infers Read tool from top-level path when arguments are absent', () => {
    const mapped = mapCodexEventToProviderJson({
      type: 'item.started',
      thread_id: 'thread-16c',
      call_id: 'call_read_4',
      path: 'specs/001-source-file-explorer/spec.md',
      item_type: 'function_call',
    })

    expect(mapped).toHaveLength(3)
    expect(mapped[0]).toMatchObject({
      type: 'stream_event',
      session_id: 'thread-16c',
      event: {
        type: 'content_block_start',
        content_block: { type: 'tool_use', id: 'call_read_4', name: 'Read' },
      },
    })
  })

  it('maps agent_message content array into rendered text', () => {
    const mapped = mapCodexEventToProviderJson({
      type: 'agent_message',
      thread_id: 'thread-10',
      content: [
        { type: 'output_text', text: 'hello ' },
        { type: 'output_text', text: 'world' },
      ],
    })
    expect(mapped).toHaveLength(2)
    expect(mapped[0]).toMatchObject({
      type: 'stream_event',
      session_id: 'thread-10',
      event: {
        type: 'content_block_start',
        content_block: { type: 'text', text: 'hello world' },
      },
    })
  })

  it('maps task_complete with final message text into text + result events', () => {
    const mapped = mapCodexEventToProviderJson({
      type: 'task_complete',
      thread_id: 'thread-3',
      last_agent_message: 'final answer',
    })
    expect(mapped).toHaveLength(3)
    expect(mapped[0]).toMatchObject({
      type: 'stream_event',
      session_id: 'thread-3',
      event: {
        type: 'content_block_start',
        content_block: { type: 'text', text: 'final answer' },
      },
    })
    expect(mapped[2]).toMatchObject({
      type: 'result',
      session_id: 'thread-3',
      subtype: 'success',
    })
  })

  it('maps tool call events into tool_use stream block events', () => {
    const mapped = mapCodexEventToProviderJson({
      type: 'tool_call',
      thread_id: 'thread-tools-1',
      call_id: 'call_123',
      name: 'Read',
      arguments: { file_path: 'README.md', offset: 1, limit: 20 },
    })

    expect(mapped).toHaveLength(3)
    expect(mapped[0]).toMatchObject({
      type: 'stream_event',
      session_id: 'thread-tools-1',
      event: {
        type: 'content_block_start',
        content_block: { type: 'tool_use', id: 'call_123', name: 'Read' },
      },
    })
    expect(mapped[1]).toMatchObject({
      type: 'stream_event',
      session_id: 'thread-tools-1',
      event: {
        type: 'content_block_delta',
      },
    })
  })

  it('maps tool result events into canonical tool_result', () => {
    const mapped = mapCodexEventToProviderJson({
      type: 'tool_result',
      thread_id: 'thread-tools-2',
      tool_use_id: 'call_123',
      content: 'Read 20 lines from README.md',
    })

    expect(mapped).toHaveLength(1)
    expect(mapped[0]).toMatchObject({
      type: 'tool_result',
      session_id: 'thread-tools-2',
      tool_use_id: 'call_123',
      content: 'Read 20 lines from README.md',
      is_error: false,
    })
  })

  it('maps approval/permission events into canonical permission_request', () => {
    const mapped = mapCodexEventToProviderJson({
      type: 'approval_request',
      thread_id: 'thread-perm-1',
      tool: 'Write',
      file_path: 'components/chat/ChatMessage.vue',
      description: 'Need permission to write file',
    })

    expect(mapped).toHaveLength(1)
    expect(mapped[0]).toMatchObject({
      type: 'permission_request',
      session_id: 'thread-perm-1',
      permission: {
        tool: 'Write',
        file_path: 'components/chat/ChatMessage.vue',
      },
    })
  })

  it('returns nonJson for plain text lines', () => {
    const result = processCodexJsonLine('plain stderr text')
    expect(result.nonJson).toBe('plain stderr text')
    expect(result.mappedEvents).toEqual([])
  })
})
