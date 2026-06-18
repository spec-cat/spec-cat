import { CLAUDE_MODELS } from '~/types/claude'
import type { AIProvider } from '~/server/utils/aiProvider'
import { registerProvider } from '~/server/utils/aiProviderRegistry'

// Claude chat runs through the interactive PTY path (terminalSessions.ts +
// jobQueue.runProviderViaPty). This module only contributes provider metadata
// (model list + capabilities) and model validation to the registry.
const metadata = {
  id: 'claude',
  name: 'Claude Code CLI',
  description: 'Local Claude CLI session (Fable/Sonnet/Opus/Haiku) via @anthropic-ai/claude-code.',
  models: CLAUDE_MODELS.map((model) => ({
    key: model.value,
    label: model.label,
    description: model.description,
    default: model.value === 'sonnet',
  })),
  capabilities: {
    streaming: true,
    permissions: true,
    resume: true,
    autoCommit: true,
    conflictResolution: true,
  },
} satisfies AIProvider['metadata']

const claudeProvider: AIProvider = {
  metadata,
  isModelSupported(modelKey: string) {
    return CLAUDE_MODELS.some((model) => model.value === modelKey)
  },
}

registerProvider(claudeProvider)
export default claudeProvider
