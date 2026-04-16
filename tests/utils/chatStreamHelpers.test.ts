import { describe, expect, it } from 'vitest'
import { buildRecoveryKey, markToolBlocks } from '~/utils/chatStreamHelpers'
import type { ContentBlock, ToolUseBlock, TextBlock } from '~/types/chat'

describe('buildRecoveryKey', () => {
  it('joins ids with colon separator', () => {
    expect(buildRecoveryKey('c1', 'm1')).toBe('c1:m1')
  })

  it('produces distinct keys for distinct inputs', () => {
    expect(buildRecoveryKey('a', 'b')).not.toBe(buildRecoveryKey('b', 'a'))
  })
})

describe('markToolBlocks', () => {
  const makeTool = (status: ToolUseBlock['status']): ToolUseBlock => ({
    id: `tb-${status}`,
    type: 'tool_use',
    toolUseId: `tu-${status}`,
    name: 'Read',
    input: {},
    inputSummary: '',
    status,
  })

  it('promotes running and pending blocks to the given terminal status', () => {
    const blocks: ContentBlock[] = [makeTool('running'), makeTool('pending')]
    markToolBlocks(blocks, 'complete')
    expect((blocks[0] as ToolUseBlock).status).toBe('complete')
    expect((blocks[1] as ToolUseBlock).status).toBe('complete')
  })

  it('does not demote already-terminal blocks', () => {
    const blocks: ContentBlock[] = [makeTool('complete'), makeTool('error')]
    markToolBlocks(blocks, 'error')
    expect((blocks[0] as ToolUseBlock).status).toBe('complete')
    expect((blocks[1] as ToolUseBlock).status).toBe('error')
  })

  it('ignores non-tool blocks', () => {
    const text: TextBlock = { id: 't1', type: 'text', text: 'hi' }
    const blocks: ContentBlock[] = [text, makeTool('running')]
    markToolBlocks(blocks, 'error')
    expect(blocks[0]).toEqual(text)
    expect((blocks[1] as ToolUseBlock).status).toBe('error')
  })

  it('works with empty block array', () => {
    const blocks: ContentBlock[] = []
    expect(() => markToolBlocks(blocks, 'complete')).not.toThrow()
  })
})
