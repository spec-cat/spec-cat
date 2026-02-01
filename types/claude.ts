/**
 * Claude model types
 */

export type ClaudeModel = 'sonnet' | 'opus' | 'haiku'

export const CLAUDE_MODELS: { value: ClaudeModel; label: string; description: string }[] = [
  { value: 'sonnet', label: 'Sonnet', description: 'Balanced performance and cost' },
  { value: 'opus', label: 'Opus', description: 'Most capable, higher cost' },
  { value: 'haiku', label: 'Haiku', description: 'Fast and cost-effective' },
]
