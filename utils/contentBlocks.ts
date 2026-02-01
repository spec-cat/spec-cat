import type { ContentBlock } from '~/types/chat'

export function buildMessageContentFromBlocks(blocks: ContentBlock[] | undefined): string {
  if (!blocks) return ''

  return blocks
    .map((block) => {
      switch (block.type) {
        case 'text':
          return block.text
        case 'tool_use':
          return `[${block.name}] ${block.inputSummary}`
        case 'tool_result':
          return block.isError ? `Error: ${block.content.slice(0, 100)}` : ''
        case 'thinking':
        case 'result_summary':
        case 'session_init':
          return ''
        default:
          return ''
      }
    })
    .filter(Boolean)
    .join('\n')
}
