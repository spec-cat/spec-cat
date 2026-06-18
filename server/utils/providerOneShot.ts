import type { AIProviderCapabilities, AIProviderSelection } from '~/types/aiProvider'
import { ensureProvidersInitialized, getProvider } from '~/server/utils/aiProviderRegistry'
import { queryInteractiveProvider } from '~/server/utils/interactiveProviderQuery'

export interface ProviderOneShotResult {
  success: boolean
  text?: string
  error?: string
}

function capabilityLabel(capability: keyof AIProviderCapabilities): string {
  switch (capability) {
    case 'autoCommit':
      return 'auto-commit'
    case 'conflictResolution':
      return 'AI conflict resolution'
    default:
      return String(capability)
  }
}

/**
 * Run a single prompt through the selected provider's *interactive* PTY session
 * and return its text response. Uses the same PTY-scraping mechanism as the chat
 * terminal.
 *
 * The prompt is bracketed-pasted so multi-line content (e.g. code) is injected
 * intact, and chrome stripping is disabled so code output is returned verbatim
 * (only ANSI control sequences are removed).
 */
export async function runProviderOneShot(options: {
  selection: AIProviderSelection
  prompt: string
  cwd: string
  capability?: keyof AIProviderCapabilities
  abortSignal?: AbortSignal
  /** Optional label used for the ephemeral PTY session id. */
  conversationId?: string
}): Promise<ProviderOneShotResult> {
  await ensureProvidersInitialized()

  const provider = getProvider(options.selection.providerId)
  if (!provider) {
    return {
      success: false,
      error: `Provider "${options.selection.providerId}" is not registered.`,
    }
  }

  if (options.capability && !provider.metadata.capabilities[options.capability]) {
    return {
      success: false,
      error: `Provider "${options.selection.providerId}" does not support ${capabilityLabel(options.capability)}.`,
    }
  }

  if (!provider.isModelSupported(options.selection.modelKey)) {
    return {
      success: false,
      error: `Model "${options.selection.modelKey}" is not supported by provider "${options.selection.providerId}".`,
    }
  }

  return await queryInteractiveProvider({
    conversationId: options.conversationId || `oneshot:${options.selection.providerId}`,
    cwd: options.cwd,
    providerId: options.selection.providerId,
    modelKey: options.selection.modelKey,
    prompt: options.prompt,
    abortSignal: options.abortSignal,
    bracketedPaste: true,
    cleanChrome: false,
  })
}
