import { describe, expect, it } from 'vitest'
import { transformClaudeEvent } from '~/server/utils/uiAdapter'

describe('uiAdapter transformClaudeEvent', () => {
  it('emits error event text from Claude result errors[] when is_error=true', () => {
    const events = transformClaudeEvent({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      session_id: 'sess-1',
      errors: [
        "You've hit your limit · resets 1pm (Asia/Seoul)",
      ],
    })

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      type: 'turn_result',
      subtype: 'error',
    })
    expect(events[1]).toMatchObject({
      type: 'error',
      error: "You've hit your limit · resets 1pm (Asia/Seoul)",
    })
  })

  it('falls back to generic error text when Claude result has no errors[] payload', () => {
    const events = transformClaudeEvent({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      session_id: 'sess-2',
    })

    expect(events).toHaveLength(2)
    expect(events[1]).toMatchObject({
      type: 'error',
      error: 'Provider reported an execution error.',
    })
  })

  it('extracts error text from result.error field when errors[] is absent', () => {
    const events = transformClaudeEvent({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      session_id: 'sess-3',
      error: 'quota exceeded',
    })

    expect(events).toHaveLength(2)
    expect(events[1]).toMatchObject({
      type: 'error',
      error: 'quota exceeded',
    })
  })

  it('renders assistant text blocks for non-stream assistant events', () => {
    const events = transformClaudeEvent({
      type: 'assistant',
      session_id: 'sess-4',
      message: {
        content: [
          { type: 'text', text: "You've hit your limit · resets 1pm (Asia/Seoul)" },
        ],
      },
    })

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      type: 'block_start',
      blockType: 'text',
      text: "You've hit your limit · resets 1pm (Asia/Seoul)",
    })
    expect(events[1]).toMatchObject({
      type: 'block_end',
    })
  })
})
