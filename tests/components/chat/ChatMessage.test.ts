// @vitest-environment nuxt
import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ChatMessage from '~/components/chat/ChatMessage.vue'
import ChatToolBlock from '~/components/chat/ChatToolBlock.vue'
import type { ChatMessage as ChatMessageType, ToolUseBlock } from '~/types/chat'

function makeToolBlock(id: string, name: string, status: ToolUseBlock['status'], inputSummary: string): ToolUseBlock {
  return {
    id,
    type: 'tool_use',
    toolUseId: `${id}-tool`,
    name,
    input: {},
    inputSummary,
    status,
  }
}

function makeAssistantMessage(contentBlocks: ChatMessageType['contentBlocks']): ChatMessageType {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: '',
    contentBlocks,
    timestamp: '2026-03-21T10:33:51.062Z',
    status: 'complete',
  }
}

describe('ChatMessage', () => {
  it('aggregates consecutive low-signal tool calls into a single summary block', async () => {
    const message = makeAssistantMessage([
      { id: 'txt-1', type: 'text', text: 'Checking files...\n' },
      makeToolBlock('tool-1', 'Read', 'complete', 'src/a.ts'),
      makeToolBlock('tool-2', 'Read', 'pending', 'src/b.ts'),
      makeToolBlock('tool-3', 'Glob', 'complete', 'components/**/*.vue'),
      { id: 'txt-2', type: 'text', text: '\nDone reading.' },
    ])

    const wrapper = await mountSuspended(ChatMessage, { props: { message } })

    expect(wrapper.findAll('[data-testid="tool-group-summary"]')).toHaveLength(1)
    expect(wrapper.findAllComponents(ChatToolBlock)).toHaveLength(0)
    expect(wrapper.text()).toContain('3 tools')
    expect(wrapper.text()).toContain('[WAIT]')
    expect(wrapper.text()).toContain('Done reading.')
  })

  it('keeps high-signal tools rendered as individual tool blocks', async () => {
    const message = makeAssistantMessage([
      makeToolBlock('tool-1', 'Read', 'complete', 'src/a.ts'),
      makeToolBlock('tool-2', 'Bash', 'complete', 'pnpm test'),
    ])

    const wrapper = await mountSuspended(ChatMessage, { props: { message } })

    expect(wrapper.findAll('[data-testid="tool-group-summary"]')).toHaveLength(1)
    expect(wrapper.findAllComponents(ChatToolBlock)).toHaveLength(1)
    expect(wrapper.text()).toContain('Bash')
    expect(wrapper.text()).toContain('pnpm test')
  })
})
