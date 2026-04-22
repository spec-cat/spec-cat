import type { AIProviderCapabilities, AIProviderSelection } from '~/types/aiProvider'
import type { UIStreamEvent } from '~/types/chat'
import { ensureProvidersInitialized, getProvider } from '~/server/utils/aiProviderRegistry'

export interface ProviderOneShotResult {
  success: boolean
  text?: string
  error?: string
}

interface ProviderTextCollectorState {
  textParts: string[]
  errors: string[]
}

function createCollectorState(): ProviderTextCollectorState {
  return {
    textParts: [],
    errors: [],
  }
}

export function collectProviderText(state: ProviderTextCollectorState, event: UIStreamEvent) {
  switch (event.type) {
    case 'block_start':
      if (event.blockType === 'text' && typeof event.text === 'string' && event.text.length > 0) {
        state.textParts.push(event.text)
      }
      break
    case 'block_delta':
      if (typeof event.text === 'string' && event.text.length > 0) {
        state.textParts.push(event.text)
      }
      break
    case 'error':
      if (typeof event.error === 'string' && event.error.trim().length > 0) {
        state.errors.push(event.error.trim())
      }
      break
    case 'turn_result':
      if (event.subtype === 'error') {
        state.errors.push('Provider reported an execution error.')
      }
      break
  }
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

export async function runProviderOneShot(options: {
  selection: AIProviderSelection
  prompt: string
  cwd: string
  capability?: keyof AIProviderCapabilities
  abortSignal?: AbortSignal
}): Promise<ProviderOneShotResult> {
  await ensureProvidersInitialized()

  const provider = getProvider(options.selection.providerId)
  if (!provider) {
    return {
      success: false,
      error: `Provider "${options.selection.providerId}" is not registered.`,
    }
  }

  if (!provider.streamChat || !provider.metadata.capabilities.streaming) {
    return {
      success: false,
      error: `Provider "${options.selection.providerId}" does not support streaming chat.`,
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

  const collector = createCollectorState()

  return await new Promise((resolve) => {
    let settled = false
    const finish = (result: ProviderOneShotResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    let controller
    try {
      controller = provider.streamChat!(
        {
          message: options.prompt,
          selection: options.selection,
          cwd: options.cwd,
          permissionMode: 'bypass',
          ephemeral: options.selection.providerId === 'codex',
        },
        {
          onProviderJson(data) {
            const events = provider.toCanonicalEvents(data as Record<string, unknown> | UIStreamEvent)
            for (const event of events) {
              collectProviderText(collector, event)
            }
          },
          onClose({ exitCode, signal, nonJsonOutput }) {
            const errorLines = [
              ...collector.errors,
              ...nonJsonOutput.map(line => line.trim()).filter(Boolean),
            ]
            const text = collector.textParts.join('').trim()

            if (exitCode === 0 && errorLines.length === 0 && text.length > 0) {
              finish({ success: true, text })
              return
            }

            const status = signal
              ? `Provider exited via signal ${signal}.`
              : `Provider exited with code ${exitCode ?? 'unknown'}.`
            const detail = errorLines.join('\n').trim()
            finish({
              success: false,
              error: detail ? `${status}\n${detail}` : status,
              text,
            })
          },
          onError(error) {
            finish({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            })
          },
        },
      )
    } catch (error) {
      finish({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }

    if (options.abortSignal) {
      if (options.abortSignal.aborted) {
        controller.kill()
      } else {
        options.abortSignal.addEventListener('abort', () => controller.kill(), { once: true })
      }
    }
  })
}
