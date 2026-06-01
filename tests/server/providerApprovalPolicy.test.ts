import { describe, expect, it } from 'vitest'
import {
  isUserInputToolName,
  parseToolInputJson,
  trackStreamingToolInput,
  type StreamingToolInput,
} from '~/server/utils/providerApprovalPolicy'

describe('providerApprovalPolicy user-input tools', () => {
  it('recognizes Claude and Codex user input tool names', () => {
    expect(isUserInputToolName('AskUserQuestion')).toBe(true)
    expect(isUserInputToolName('request_user_input')).toBe(true)
    expect(isUserInputToolName('Bash')).toBe(false)
  })

  it('tracks streamed tool input until the block ends', () => {
    const activeTools = new Map<string, StreamingToolInput>()

    expect(trackStreamingToolInput({
      type: 'block_start',
      blockId: 'blk-1',
      blockType: 'tool_use',
      index: 0,
      name: 'AskUserQuestion',
      toolUseId: 'tool-1',
    }, activeTools)).toBeNull()

    trackStreamingToolInput({
      type: 'block_delta',
      blockId: '',
      index: 0,
      partialJson: '{"prompt":"Continue?"}',
    }, activeTools)

    const completed = trackStreamingToolInput({
      type: 'block_end',
      blockId: '',
      index: 0,
    }, activeTools)

    expect(completed).toEqual({
      name: 'AskUserQuestion',
      inputJson: '{"prompt":"Continue?"}',
    })
    expect(activeTools.size).toBe(0)
    expect(parseToolInputJson(completed!.inputJson)).toEqual({ prompt: 'Continue?' })
  })
})
