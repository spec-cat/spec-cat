// @vitest-environment nuxt
import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import ChatToolBlock from '~/components/chat/ChatToolBlock.vue'
import type { ToolUseBlock, ToolResultBlock } from '~/types/chat'

function makeToolBlock(overrides: Partial<ToolUseBlock> = {}): ToolUseBlock {
  return {
    id: 'blk-1',
    type: 'tool_use',
    toolUseId: 'tool-1',
    name: 'Read',
    input: {},
    inputSummary: 'fallback summary',
    status: 'complete',
    ...overrides,
  }
}

async function ensureExpanded(wrapper: VueWrapper<any>, mustContain: string) {
  if (wrapper.text().includes(mustContain)) return
  await wrapper.find('button').trigger('click')
}

describe('ChatToolBlock', () => {
  it('renders human-readable read summary and range', async () => {
    const block = makeToolBlock({
      name: 'Read',
      input: { file_path: 'src/app.ts', offset: 10, limit: 20 },
    })

    const wrapper = await mountSuspended(ChatToolBlock, { props: { block } })
    expect(wrapper.text()).toContain('Read src/app.ts (from line 10, 20 lines)')

    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toContain('File')
    expect(wrapper.text()).toContain('src/app.ts')
    expect(wrapper.text()).toContain('Range')
    expect(wrapper.text()).toContain('from line 10, 20 lines')
  })

  it('renders write new content preview and truncation hint', async () => {
    const longContent = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n')
    const block = makeToolBlock({
      name: 'Write',
      input: { file_path: 'notes.md', content: longContent },
    })

    const wrapper = await mountSuspended(ChatToolBlock, { props: { block } })
    expect(wrapper.text()).toContain('Write notes.md')

    await ensureExpanded(wrapper, 'New Content')
    expect(wrapper.text()).toContain('New Content')
    expect(wrapper.text()).toContain('Truncated preview')
  })

  it('renders edit before/after previews', async () => {
    const block = makeToolBlock({
      name: 'Edit',
      input: {
        file_path: 'server/api.ts',
        old_string: 'const a = 1',
        new_string: 'const a = 2',
      },
    })

    const wrapper = await mountSuspended(ChatToolBlock, { props: { block } })
    expect(wrapper.text()).toContain('Edit server/api.ts')

    await ensureExpanded(wrapper, 'Before')
    expect(wrapper.text()).toContain('Before')
    expect(wrapper.text()).toContain('const a = 1')
    expect(wrapper.text()).toContain('After')
    expect(wrapper.text()).toContain('const a = 2')
  })

  it('keeps fallback summary for non-target tools', async () => {
    const block = makeToolBlock({
      name: 'Bash',
      input: { command: 'ls -la' },
      inputSummary: 'ls -la',
    })

    const wrapper = await mountSuspended(ChatToolBlock, { props: { block } })
    expect(wrapper.text()).toContain('Bash')
    expect(wrapper.text()).toContain('ls -la')
  })

  it('renders tool result preview and full toggle', async () => {
    const block = makeToolBlock({ name: 'Read', input: { file_path: 'x.ts' } })
    const result: ToolResultBlock = {
      id: 'res-1',
      type: 'tool_result',
      toolUseId: 'tool-1',
      isError: false,
      content: 'a\nb\nc\nd\ne\nf\ng\n',
    }

    const wrapper = await mountSuspended(ChatToolBlock, { props: { block, result } })
    expect(wrapper.text()).toContain('Show full')

    await wrapper.find('button.text-retro-cyan').trigger('click')
    expect(wrapper.text()).toContain('Collapse')
  })

  it('shows request_user_input question text with options', async () => {
    const block = makeToolBlock({
      name: 'request_user_input',
      input: {
        questions: [
          {
            header: 'Clarification 1/5',
            id: 'metric_scope',
            question: 'Which metric scope should we ship first?',
            options: [
              { label: 'A', description: 'Core five metrics' },
              { label: 'B', description: 'Core + low stock' },
            ],
          },
        ],
      },
    })

    const wrapper = await mountSuspended(ChatToolBlock, { props: { block } })
    expect(wrapper.text()).toContain('Which metric scope should we ship first?')

    await ensureExpanded(wrapper, 'Clarification Prompt')
    expect(wrapper.text()).toContain('Clarification Prompt')
    expect(wrapper.text()).toContain('Clarification 1/5')
    expect(wrapper.text()).toContain('Which metric scope should we ship first?')
    expect(wrapper.text()).toContain('A')
    expect(wrapper.text()).toContain('B')
  })

  it('shows AskUserQuestion prompt/message schema', async () => {
    const block = makeToolBlock({
      name: 'AskUserQuestion',
      input: {
        header: 'Clarification 2/5',
        prompt: 'How should sold-out status be determined?',
        options: [
          { label: 'A', description: 'stock <= 0' },
          { label: 'B', description: 'stock < safety threshold' },
        ],
      },
    })

    const wrapper = await mountSuspended(ChatToolBlock, { props: { block } })
    expect(wrapper.text()).toContain('How should sold-out status be determined?')

    await ensureExpanded(wrapper, 'Clarification Prompt')
    expect(wrapper.text()).toContain('Clarification Prompt')
    expect(wrapper.text()).toContain('Clarification 2/5')
    expect(wrapper.text()).toContain('How should sold-out status be determined?')
    expect(wrapper.text()).toContain('A')
    expect(wrapper.text()).toContain('stock <= 0')
  })

  it('renders unified diff output with change stats', async () => {
    const block = makeToolBlock({ name: 'Edit', input: { file_path: 'src/main.ts' } })
    const result: ToolResultBlock = {
      id: 'res-2',
      type: 'tool_result',
      toolUseId: 'tool-1',
      isError: false,
      content: [
        'diff --git a/src/main.ts b/src/main.ts',
        'index 123..456 100644',
        '--- a/src/main.ts',
        '+++ b/src/main.ts',
        '@@ -1,2 +1,2 @@',
        '-const x = 1',
        '+const x = 2',
        ' console.log(x)',
      ].join('\n'),
    }

    const wrapper = await mountSuspended(ChatToolBlock, { props: { block, result } })
    expect(wrapper.text()).toContain('Diff')
    expect(wrapper.text()).toContain('+1')
    expect(wrapper.text()).toContain('-1')

    await wrapper.find('button.text-retro-cyan').trigger('click')
    expect(wrapper.text()).toContain('const x = 2')
  })
})
