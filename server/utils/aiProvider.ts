import { DEFAULT_PROVIDER_ID, DEFAULT_MODEL_KEY, type AIProviderMetadata, type AIProviderSelection } from '~/types/aiProvider'
import type { ClaudeModel } from '~/types/claude'
import { CLAUDE_MODELS } from '~/types/claude'

export interface AIProviderStartOptions {
  conversationId: string
  selection: AIProviderSelection
  cwd: string
  prompt?: string
}

export type AIProviderPermissionMode = 'plan' | 'ask' | 'auto' | 'bypass'

// Generic kill handle for an in-flight turn. The interactive PTY path
// (jobQueue.runProviderViaPty) sets a synthetic controller that interrupts the
// TUI without tearing down the persistent session.
export interface AIProviderStreamController {
  kill: () => void
}

export interface AIProviderSessionState {
  sessionId: string
  providerId: string
  modelKey: string
}

export interface AIProvider {
  metadata: AIProviderMetadata
  createSession?: (opts: AIProviderStartOptions) => Promise<AIProviderSessionState>
  resumeSession?: (sessionId: string, opts: AIProviderStartOptions) => Promise<AIProviderSessionState>
  cancelSession?: (sessionId: string) => Promise<void>
  isModelSupported(modelKey: string): boolean
}

export function selectionFromClaudeModel(model?: ClaudeModel): AIProviderSelection {
  const valid = CLAUDE_MODELS.find((entry) => entry.value === model)
  return {
    providerId: DEFAULT_PROVIDER_ID,
    modelKey: valid ? valid.value : DEFAULT_MODEL_KEY,
  }
}
