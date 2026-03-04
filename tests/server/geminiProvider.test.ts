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
})
