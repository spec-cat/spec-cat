/**
 * POST /api/chat
 * Send a message to the active AI provider and stream response via provider abstraction.
 */

import { getProjectDir } from '~/server/utils/projectDir'
import { getServerProviderSelection, guardProviderCapability, resolveServerProviderSelection } from '~/server/utils/aiProviderSelection'
import { streamChatWithProvider } from '~/server/utils/aiProvider'
import { hasCodexMissingRolloutPathError, hasCodexPermissionError, summarizeProviderProcessError } from '~/server/utils/providerProcessError'
import { doneEvent, errorEvent, providerJsonEvent, sessionResetEvent } from '~/server/utils/chatEventFormatters'
import { buildSearchContextForImplement } from '~/server/utils/specSearch/contextInjector'

interface ChatRequest {
  message: string
  requestId: string
  sessionId?: string
  providerId?: string
  providerModelKey?: string
}

const FEATURE_ID_PATTERN = /\b\d{3}-[a-z0-9][a-z0-9-]*\b/i
const SEARCH_ACTION_PATTERN = /\b(find|search|look up|lookup|where is|what feature)\b/i
const SEARCH_DOMAIN_PATTERN = /\b(spec|requirement|requirements|fr-|feature)\b/i
const SEARCH_ACTION_KR_PATTERN = /(찾아줘|검색|어디|찾아봐|찾아봐줘)/i
const SEARCH_DOMAIN_KR_PATTERN = /(스펙|요구사항|기능|fr-)/i

function extractFeatureIdFromMessage(message: string): string | undefined {
  const match = message.match(FEATURE_ID_PATTERN)
  return match?.[0]
}

function shouldInjectSearchContextForChatMessage(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('/')) return false
  const enIntent = SEARCH_ACTION_PATTERN.test(trimmed) && SEARCH_DOMAIN_PATTERN.test(trimmed)
  const koIntent = SEARCH_ACTION_KR_PATTERN.test(trimmed) && SEARCH_DOMAIN_KR_PATTERN.test(trimmed)
  return enIntent || koIntent
}

export default defineEventHandler(async (event) => {
  const chatRequest = await readBody<ChatRequest>(event)

  if (!chatRequest?.message?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Message is required',
    })
  }

  if (!chatRequest?.requestId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request ID is required',
    })
  }

  console.log('[Chat API] Received request', {
    message: chatRequest.message.slice(0, 100),
    requestId: chatRequest.requestId,
    sessionId: chatRequest.sessionId,
  })

  let providerMessage = chatRequest.message
  const implementMatch = chatRequest.message.match(/^\/speckit\.implement\s+([^\s]+)/)
  if (implementMatch) {
    try {
      const featureId = implementMatch[1]
      const context = await buildSearchContextForImplement({
        query: chatRequest.message,
        featureId,
        maxResults: 5,
      })
      if (context.injected && context.context) {
        providerMessage = `${chatRequest.message}\n\n${context.context}`
      }
    } catch (error) {
      console.warn('[Chat API] Failed to inject spec search context:', error)
    }
  } else if (shouldInjectSearchContextForChatMessage(chatRequest.message)) {
    try {
      const context = await buildSearchContextForImplement({
        query: chatRequest.message,
        featureId: extractFeatureIdFromMessage(chatRequest.message),
        maxResults: 5,
      })
      if (context.injected && context.context) {
        providerMessage = `${chatRequest.message}\n\n${context.context}`
      }
    } catch (error) {
      console.warn('[Chat API] Failed to inject spec search context for chat intent:', error)
    }
  }

  const workingDirectory = getProjectDir()
  const requestedSelection = chatRequest.providerId
    ? { providerId: chatRequest.providerId, modelKey: chatRequest.providerModelKey || '' }
    : await getServerProviderSelection()
  const selection = await resolveServerProviderSelection(requestedSelection)

  const providerGuard = await guardProviderCapability(
    selection,
    'streaming',
    'Choose a provider that supports streaming chat.',
  )
  if ('failure' in providerGuard) {
    throw createError({
      statusCode: 400,
      statusMessage: providerGuard.failure.error,
    })
  }

  // Get raw Node.js response for direct streaming
  const res = event.node.res

  // Set headers for streaming (disable buffering)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering
  res.flushHeaders()

  // Helper to write and flush
  const writeChunk = (data: string) => {
    res.write(data)
    // Force flush if available
    if (typeof (res as any).flush === 'function') {
      (res as any).flush()
    }
  }

  const isUnexpectedExit = (exitCode: number | null) => exitCode !== 0 && exitCode !== null

  // Return a promise that resolves when the process ends
  return new Promise<void>((resolve, reject) => {
    let controller: { kill: () => void } | null = null
    const runStream = (resumeSessionId: string | undefined, isRetry = false, forceEphemeral = false) => {
      streamChatWithProvider(
        {
          message: providerMessage,
          selection,
          cwd: workingDirectory,
          permissionMode: 'bypass',
          resumeSessionId,
          ephemeral: forceEphemeral && selection.providerId === 'codex',
        },
        {
          onProviderJson(data) {
            writeChunk(providerJsonEvent(data))
          },
          onClose({ exitCode, signal, nonJsonOutput }) {
            const hasPermissionError = hasCodexPermissionError(nonJsonOutput)
            const missingRolloutPath = hasCodexMissingRolloutPathError(nonJsonOutput)
            if (isUnexpectedExit(exitCode) && missingRolloutPath && !hasPermissionError && !isRetry) {
              writeChunk(sessionResetEvent('Codex session state was missing rollout data. Retrying with a fresh ephemeral session.'))
              runStream(undefined, true, true)
              return
            }

            if (isUnexpectedExit(exitCode) && resumeSessionId && !isRetry) {
              const retryWithEphemeral = selection.providerId === 'codex'
              writeChunk(sessionResetEvent(
                retryWithEphemeral
                  ? `Session resume failed (exit code ${exitCode}). Retrying with a fresh ephemeral session.`
                  : `Session resume failed (exit code ${exitCode}). Retrying with a fresh session.`,
              ))
              runStream(undefined, true, retryWithEphemeral)
              return
            }

            if (isUnexpectedExit(exitCode)) {
              console.error('[Chat API] Provider process exited unexpectedly', {
                providerId: selection.providerId,
                modelKey: selection.modelKey,
                requestId: chatRequest.requestId,
                exitCode,
                signal,
                nonJsonOutput: nonJsonOutput.slice(-25),
              })
              const summary = summarizeProviderProcessError(nonJsonOutput, 700)
              const details = summary ? ` — ${summary}` : ''
              writeChunk(errorEvent(`Provider process exited unexpectedly (code: ${exitCode}${signal ? `, signal: ${signal}` : ''})${details}`))
            } else if (exitCode === null && signal) {
              console.error('[Chat API] Provider process killed by signal', {
                providerId: selection.providerId,
                modelKey: selection.modelKey,
                requestId: chatRequest.requestId,
                signal,
                nonJsonOutput: nonJsonOutput.slice(-25),
              })
              const summary = summarizeProviderProcessError(nonJsonOutput, 700)
              const details = summary ? ` — ${summary}` : ''
              writeChunk(errorEvent(`Provider process was killed by signal ${signal}${details}`))
            } else {
              writeChunk(doneEvent())
            }
            res.end()
            resolve()
          },
          onError(error) {
            console.error('[Chat API] Process error:', error)
            writeChunk(errorEvent(error.message))
            res.end()
            reject(error)
          },
        },
      )
        .then((activeController) => {
          controller = activeController
        })
        .catch((error) => {
          writeChunk(errorEvent(error instanceof Error ? error.message : String(error)))
          res.end()
          reject(error)
        })
    }

    runStream(chatRequest.sessionId)

    res.on('close', () => {
      controller?.kill()
    })
  })
})
