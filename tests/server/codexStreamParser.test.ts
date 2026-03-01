import { describe, expect, it } from 'vitest'
import { mapCodexEventToUIEvents, processCodexJsonLine } from '~/server/utils/codexStreamParser'

describe('codexStreamParser', () => {
  it('maps agent_message_delta into stream block events', () => {
    const mapped = mapCodexEventToUIEvents({ type: 'agent_message_delta', delta: 'hello', thread_id: 't1' })
    expect(mapped).toHaveLength(3)
    expect(mapped[0]).toMatchObject({ type: 'block_start', sessionId: 't1' })
    expect(mapped[1]).toMatchObject({ type: 'block_delta', text: 'hello' })
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
      type: 'block_start',
      sessionId: 'thread-1',
      blockType: 'text',
      text: 'hello from envelope',
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
      type: 'turn_result',
      sessionId: 'thread-2',
      subtype: 'success',
    })
  })

  it('unwraps nested event envelope for approval request', () => {
    const line = JSON.stringify({
      type: 'notification',
      thread_id: 'thread-event-approval-1',
      event: {
        type: 'approval_request',
        tool: 'Write',
        file_path: 'components/chat/ChatInput.vue',
        description: 'Need permission to write file',
      },
    })
    const result = processCodexJsonLine(line)
    expect(result.mappedEvents).toHaveLength(1)
    expect(result.mappedEvents[0]).toMatchObject({
      type: 'permission_request',
      sessionId: 'thread-event-approval-1',
      tool: 'Write',
      description: 'Need permission to write file',
    })
  })

  it('unwraps nested data envelope for permission request', () => {
    const line = JSON.stringify({
      type: 'notification',
      session_id: 'session-data-approval-1',
      data: {
        type: 'permission_request',
        tool: 'Bash',
        command: 'git status',
        description: 'Permission required: Bash',
      },
    })
    const result = processCodexJsonLine(line)
    expect(result.mappedEvents).toHaveLength(1)
    expect(result.mappedEvents[0]).toMatchObject({
      type: 'permission_request',
      sessionId: 'session-data-approval-1',
      tool: 'Bash',
      description: 'Permission required: Bash',
    })
  })

  it('propagates conversation_id from envelopes into session_id', () => {
    const line = JSON.stringify({
      type: 'event_msg',
      conversation_id: 'conv-42',
      payload: { type: 'agent_message', message: 'hello from conversation id' },
    })
    const result = processCodexJsonLine(line)
    expect(result.mappedEvents).toHaveLength(2)
    expect(result.mappedEvents[0]).toMatchObject({
      type: 'block_start',
      sessionId: 'conv-42',
      blockType: 'text',
      text: 'hello from conversation id',
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
      type: 'block_start',
      sessionId: 'thread-9',
      blockType: 'text',
      text: 'hello from item envelope',
    })
  })

  it('maps item envelope phase to immediate tool_result completion', () => {
    const started = processCodexJsonLine(JSON.stringify({
      type: 'item.started',
      thread_id: 'thread-tool-phase-1',
      item: {
        id: 'tool-item-1',
        type: 'command_execution',
        command: '/usr/bin/zsh -lc "rg --files"',
      },
    }))

    expect(started.mappedEvents).toHaveLength(3)
    expect(started.mappedEvents[0]).toMatchObject({
      type: 'block_start',
      sessionId: 'thread-tool-phase-1',
      blockType: 'tool_use',
      toolUseId: 'tool-item-1',
    })

    const completed = processCodexJsonLine(JSON.stringify({
      type: 'item.completed',
      thread_id: 'thread-tool-phase-1',
      item: {
        id: 'tool-item-1',
        type: 'command_execution',
        output: 'done',
      },
    }))

    expect(completed.mappedEvents).toHaveLength(1)
    expect(completed.mappedEvents[0]).toMatchObject({
      type: 'tool_result',
      sessionId: 'thread-tool-phase-1',
      toolUseId: 'tool-item-1',
      content: 'done',
      isError: false,
    })
  })

  it('uses outer envelope item_id when inner item has no id', () => {
    const started = processCodexJsonLine(JSON.stringify({
      type: 'item.started',
      thread_id: 'thread-tool-outer-id-1',
      item_id: 'outer-item-42',
      item: {
        type: 'command_execution',
        command: '/usr/bin/zsh -lc "sed -n \'1,220p\' specs/417/spec.md"',
      },
    }))

    expect(started.mappedEvents).toHaveLength(3)
    expect(started.mappedEvents[0]).toMatchObject({
      type: 'block_start',
      sessionId: 'thread-tool-outer-id-1',
      blockType: 'tool_use',
      toolUseId: 'outer-item-42',
    })

    const completed = processCodexJsonLine(JSON.stringify({
      type: 'item.completed',
      thread_id: 'thread-tool-outer-id-1',
      item_id: 'outer-item-42',
      item: {
        type: 'command_execution',
      },
    }))

    expect(completed.mappedEvents).toHaveLength(1)
    expect(completed.mappedEvents[0]).toMatchObject({
      type: 'tool_result',
      sessionId: 'thread-tool-outer-id-1',
      toolUseId: 'outer-item-42',
      content: '',
      isError: false,
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
      type: 'block_start',
      sessionId: 'thread-11',
      blockType: 'tool_use',
      toolUseId: 'call_789',
      name: 'Read',
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
      type: 'block_start',
      sessionId: 'thread-11b',
      blockType: 'tool_use',
      toolUseId: 'call_790',
      name: 'Read',
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
      type: 'block_delta',
      sessionId: 'thread-12',
      text: 'partial text',
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
      type: 'turn_result',
      sessionId: 'thread-13',
      subtype: 'success',
    })
  })

  it('maps response.completed with nested response conversation_id into session_id', () => {
    const line = JSON.stringify({
      type: 'response.completed',
      response: { id: 'resp_2', conversation_id: 'conv-99' },
    })
    const result = processCodexJsonLine(line)
    expect(result.mappedEvents).toHaveLength(1)
    expect(result.mappedEvents[0]).toMatchObject({
      type: 'turn_result',
      sessionId: 'conv-99',
      subtype: 'success',
    })
  })

  it('prefers thread_id over session_id when both are present', () => {
    const mapped = mapCodexEventToUIEvents({
      type: 'agent_message',
      thread_id: 'thread-legacy',
      session_id: 'session-preferred',
      message: 'hello',
    })
    expect(mapped).toHaveLength(2)
    expect(mapped[0]).toMatchObject({
      type: 'block_start',
      sessionId: 'thread-legacy',
      blockType: 'text',
      text: 'hello',
    })
  })

  it('maps reasoning into thinking content block events', () => {
    const mapped = mapCodexEventToUIEvents({
      type: 'reasoning',
      thread_id: 'thread-14',
      summary: [{ text: 'Inspecting repository structure' }],
    })
    expect(mapped).toHaveLength(2)
    expect(mapped[0]).toMatchObject({
      type: 'block_start',
      sessionId: 'thread-14',
      blockType: 'thinking',
      thinking: 'Inspecting repository structure',
    })
  })

  it('maps read_file_begin into tool_use stream events', () => {
    const mapped = mapCodexEventToUIEvents({
      type: 'read_file_begin',
      thread_id: 'thread-15',
      call_id: 'call_read_1',
      path: 'specs/018-codex-provider-integration/spec.md',
    })

    expect(mapped).toHaveLength(3)
    expect(mapped[0]).toMatchObject({
      type: 'block_start',
      sessionId: 'thread-15',
      blockType: 'tool_use',
      toolUseId: 'call_read_1',
      name: 'ReadFile',
    })
  })

  it('maps read_file_end into tool_result event', () => {
    const mapped = mapCodexEventToUIEvents({
      type: 'read_file_end',
      thread_id: 'thread-16',
      call_id: 'call_read_2',
      output: 'file content preview',
    })

    expect(mapped).toHaveLength(1)
    expect(mapped[0]).toMatchObject({
      type: 'tool_result',
      sessionId: 'thread-16',
      toolUseId: 'call_read_2',
      content: 'file content preview',
      isError: false,
    })
  })

  it('infers Read tool when name is missing but input has file_path', () => {
    const mapped = mapCodexEventToUIEvents({
      type: 'function_call',
      thread_id: 'thread-16b',
      call_id: 'call_read_3',
      arguments: { file_path: 'specs/001-app-layout/spec.md' },
    })

    expect(mapped).toHaveLength(3)
    expect(mapped[0]).toMatchObject({
      type: 'block_start',
      sessionId: 'thread-16b',
      blockType: 'tool_use',
      toolUseId: 'call_read_3',
      name: 'Read',
    })
  })

  it('infers Read tool from top-level path when arguments are absent', () => {
    const mapped = mapCodexEventToUIEvents({
      type: 'item.started',
      thread_id: 'thread-16c',
      call_id: 'call_read_4',
      path: 'specs/032-source-file-explorer/spec.md',
      item_type: 'function_call',
    })

    expect(mapped).toHaveLength(3)
    expect(mapped[0]).toMatchObject({
      type: 'block_start',
      sessionId: 'thread-16c',
      blockType: 'tool_use',
      toolUseId: 'call_read_4',
      name: 'Read',
    })
  })

  it('maps agent_message content array into rendered text', () => {
    const mapped = mapCodexEventToUIEvents({
      type: 'agent_message',
      thread_id: 'thread-10',
      content: [
        { type: 'output_text', text: 'hello ' },
        { type: 'output_text', text: 'world' },
      ],
    })
    expect(mapped).toHaveLength(2)
    expect(mapped[0]).toMatchObject({
      type: 'block_start',
      sessionId: 'thread-10',
      blockType: 'text',
      text: 'hello world',
    })
  })

  it('does not inject line breaks between table-row chunks in agent_message content array', () => {
    const mapped = mapCodexEventToUIEvents({
      type: 'agent_message',
      thread_id: 'thread-table-rows-1',
      content: [
        { type: 'output_text', text: '| Method | Endpoint |' },
        { type: 'output_text', text: '| ------ | -------- |' },
        { type: 'output_text', text: '| GET | /api/v1 |' },
      ],
    })

    expect(mapped).toHaveLength(2)
    expect(mapped[0]).toMatchObject({
      type: 'block_start',
      sessionId: 'thread-table-rows-1',
      blockType: 'text',
      text: '| Method | Endpoint || ------ | -------- || GET | /api/v1 |',
    })
  })

  it('maps task_complete with final message text into text + result events', () => {
    const mapped = mapCodexEventToUIEvents({
      type: 'task_complete',
      thread_id: 'thread-3',
      last_agent_message: 'final answer',
    })
    expect(mapped).toHaveLength(3)
    expect(mapped[0]).toMatchObject({
      type: 'block_start',
      sessionId: 'thread-3',
      blockType: 'text',
      text: 'final answer',
    })
    expect(mapped[2]).toMatchObject({
      type: 'turn_result',
      sessionId: 'thread-3',
      subtype: 'success',
    })
  })

  it('maps tool call events into tool_use stream block events', () => {
    const mapped = mapCodexEventToUIEvents({
      type: 'tool_call',
      thread_id: 'thread-tools-1',
      call_id: 'call_123',
      name: 'Read',
      arguments: { file_path: 'README.md', offset: 1, limit: 20 },
    })

    expect(mapped).toHaveLength(3)
    expect(mapped[0]).toMatchObject({
      type: 'block_start',
      sessionId: 'thread-tools-1',
      blockType: 'tool_use',
      toolUseId: 'call_123',
      name: 'Read',
    })
    expect(mapped[1]).toMatchObject({
      type: 'block_delta',
      sessionId: 'thread-tools-1',
    })
  })

  it('maps tool result events into canonical tool_result', () => {
    const mapped = mapCodexEventToUIEvents({
      type: 'tool_result',
      thread_id: 'thread-tools-2',
      tool_use_id: 'call_123',
      content: 'Read 20 lines from README.md',
    })

    expect(mapped).toHaveLength(1)
    expect(mapped[0]).toMatchObject({
      type: 'tool_result',
      sessionId: 'thread-tools-2',
      toolUseId: 'call_123',
      content: 'Read 20 lines from README.md',
      isError: false,
    })
  })

  it('maps approval/permission events into canonical permission_request', () => {
    const mapped = mapCodexEventToUIEvents({
      type: 'approval_request',
      thread_id: 'thread-perm-1',
      tool: 'Write',
      file_path: 'components/chat/ChatMessage.vue',
      description: 'Need permission to write file',
    })

    expect(mapped).toHaveLength(1)
    expect(mapped[0]).toMatchObject({
      type: 'permission_request',
      sessionId: 'thread-perm-1',
      tool: 'Write',
    })
  })

  it('returns nonJson for plain text lines', () => {
    const result = processCodexJsonLine('plain stderr text')
    expect(result.nonJson).toBe('plain stderr text')
    expect(result.mappedEvents).toEqual([])
  })

  it('adds canonical session_id to passthrough events like thread.started', () => {
    const result = processCodexJsonLine(JSON.stringify({
      type: 'thread.started',
      thread_id: 'thread-canonical-1',
    }))
    // We expect 0 events because fallback now returns [] for unhandled events
    expect(result.mappedEvents).toHaveLength(0)
  })
})
