import { DEFAULT_PROVIDER_ID, DEFAULT_MODEL_KEY, type AIProviderMetadata, type AIProviderSelection } from '~/types/aiProvider'
import type { ClaudeModel } from '~/types/claude'
import { CLAUDE_MODELS } from '~/types/claude'
import { ensureProvidersInitialized, getProvider } from '~/server/utils/aiProviderRegistry'
import type { UIStreamEvent } from '~/types/chat'

export interface AIProviderStartOptions {
  conversationId: string
  selection: AIProviderSelection
  cwd: string
  prompt?: string
}

export type AIProviderPermissionMode = 'plan' | 'ask' | 'auto' | 'bypass'

export interface AIProviderStreamOptions {
  message: string
  selection: AIProviderSelection
  cwd: string
  permissionMode?: AIProviderPermissionMode
  approvedTools?: string[]
  resumeSessionId?: string
  systemPrompt?: string
  ephemeral?: boolean
}

export interface AIProviderStreamCloseEvent {
  exitCode: number | null
  signal: NodeJS.Signals | null
  nonJsonOutput: string[]
}

export interface AIProviderStreamCallbacks {
  onProviderJson: (data: Record<string, unknown> | UIStreamEvent) => void
  onClose: (event: AIProviderStreamCloseEvent) => void
  onError: (error: Error) => void
}

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
  toCanonicalEvents: (data: Record<string, unknown> | UIStreamEvent) => UIStreamEvent[]
  streamChat?: (opts: AIProviderStreamOptions, callbacks: AIProviderStreamCallbacks) => AIProviderStreamController
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

export async function streamChatWithProvider(
  opts: AIProviderStreamOptions,
  callbacks: AIProviderStreamCallbacks,
): Promise<AIProviderStreamController> {
  await ensureProvidersInitialized()
  const provider = getProvider(opts.selection.providerId)
  if (!provider) {
    throw new Error(`Provider "${opts.selection.providerId}" is not registered`)
  }
  if (!provider.metadata.capabilities.streaming || !provider.streamChat) {
    throw new Error(`Provider "${opts.selection.providerId}" does not support streaming chat`)
  }
  if (!provider.isModelSupported(opts.selection.modelKey)) {
    throw new Error(`Model "${opts.selection.modelKey}" is not supported by provider "${opts.selection.providerId}"`)
  }
  return provider.streamChat(opts, callbacks)
}
