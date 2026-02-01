import { describe, expect, it } from 'vitest'
import { buildMessageContentFromBlocks } from '~/utils/contentBlocks'
import type { ContentBlock } from '~/types/chat'

describe('contentBlocks utils', () => {
  it('builds flat message content from supported blocks', () => {
    const blocks: ContentBlock[] = [
      { id: '1', type: 'text', text: 'hello' },
      { id: '2', type: 'tool_use', toolUseId: 'tu-1', name: 'Read', input: {}, inputSummary: '/tmp/a', status: 'complete' },
      { id: '3', type: 'tool_result', toolUseId: 'tu-1', content: 'x'.repeat(120), isError: true },
      { id: '4', type: 'thinking', thinking: 'internal' },
    ]

    expect(buildMessageContentFromBlocks(blocks)).toBe(`hello\n[Read] /tmp/a\nError: ${'x'.repeat(100)}`)
  })

  it('returns empty string when blocks are missing', () => {
    expect(buildMessageContentFromBlocks(undefined)).toBe('')
  })
})
