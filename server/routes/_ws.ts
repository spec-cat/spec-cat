/**
 * WebSocket endpoint for AI provider chat streaming
 * Path: /_ws
 * Uses incremental permission approval for 'ask' mode
 */

import { existsSync } from 'node:fs'
import { getProjectDir } from '~/server/utils/projectDir'
import { ensureChatWorktree } from '~/server/utils/ensureChatWorktree'
import { loadSpecContext } from '~/server/utils/specContext'
import { guardProviderCapability, resolveServerProviderSelection } from '~/server/utils/aiProviderSelection'
import type { AIProviderStreamController } from '~/server/utils/aiProvider'
import { streamChatWithProvider } from '~/server/utils/aiProvider'
import { hasCodexMissingRolloutPathError, hasCodexPermissionError, summarizeProviderProcessError } from '~/server/utils/providerProcessError'
import {
  transformClaudeEvent,
  transformCodexEvent,
  isRenderableEvent,
  checkForPermissionRequest,
  normalizeTools,
  normalizeToolName,
  extractPermissionRequestFromProcessOutput,
} from '~/server/utils/uiAdapter'

type PermissionMode = 'plan' | 'ask' | 'auto' | 'bypass'

interface ChatMessage {
  type: 'chat'
  message: string
  attachments?: ChatImageAttachment[]
  requestId: string
  sessionId?: string
  permissionMode?: PermissionMode
  cwd?: string  // Custom working directory (e.g. worktree path)
  worktreeBranch?: string  // Branch name for worktree recovery
  featureId?: string  // Associated feature ID for spec context injection
  providerId?: string
  providerModelKey?: string
}

interface ChatImageAttachment {
  id: string
  name: string
  mimeType: string
  size: number
  dataUrl: string
}

interface PingMessage {
  type: 'ping'
}

interface PermissionResponse {
  type: 'permission_response'
  allow: boolean
}

interface AbortMessage {
  type: 'abort'
}

interface ResetContextMessage {
  type: 'reset_context'
}

type ClientMessage = ChatMessage | PingMessage | PermissionResponse | AbortMessage | ResetContextMessage

// Track state per peer
interface PeerState {
  proc: AIProviderStreamController | null
  procGeneration: number  // Incremented when process is superseded; stale close handlers skip
  pendingMessage: ChatMessage | null
  approvedTools: Set<string>
  pendingTools: string[]  // Multiple tools can be pending
  providerSessionId: string | null
}

const peerStates = new Map<string, PeerState>()
const MAX_ATTACHMENT_COUNT = 4
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024

function getPeerState(peerId: string): PeerState {
  let state = peerStates.get(peerId)
  if (!state) {
    state = {
      proc: null,
      procGeneration: 0,
      pendingMessage: null,
      approvedTools: new Set(),
      pendingTools: [],
      providerSessionId: null,
    }
    peerStates.set(peerId, state)
  }
  return state
}

function killProc(proc: AIProviderStreamController) {
  try {
    proc.kill()
  } catch {}
}

function normalizeImageAttachments(attachments: unknown): ChatImageAttachment[] {
  if (!Array.isArray(attachments)) return []

  return attachments
    .slice(0, MAX_ATTACHMENT_COUNT)
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const id = typeof record.id === 'string' ? record.id : ''
      const name = typeof record.name === 'string' ? record.name : 'image'
      const mimeType = typeof record.mimeType === 'string' ? record.mimeType : ''
      const size = typeof record.size === 'number' ? record.size : 0
      const dataUrl = typeof record.dataUrl === 'string' ? record.dataUrl : ''
      if (
        !id ||
        !mimeType.startsWith('image/') ||
        size <= 0 ||
        size > MAX_ATTACHMENT_SIZE_BYTES ||
        !dataUrl.startsWith('data:image/')
      ) {
        return null
      }
      return { id, name, mimeType, size, dataUrl }
    })
    .filter((entry): entry is ChatImageAttachment => entry !== null)
}

function buildProviderMessage(baseMessage: string, attachments: ChatImageAttachment[]): string {
  if (attachments.length === 0) return baseMessage

  const lines: string[] = []
  if (baseMessage.trim().length > 0) {
    lines.push(baseMessage)
    lines.push('')
  } else {
    lines.push('User sent image attachments without additional text.')
    lines.push('')
  }
  lines.push('Attached images (data URLs):')
  attachments.forEach((attachment, index) => {
    lines.push(`${index + 1}. ${attachment.name} (${attachment.mimeType}, ${attachment.size} bytes)`)
    lines.push(attachment.dataUrl)
    lines.push('')
  })
  lines.push('Use the attached images as part of your answer.')
  return lines.join('\n')
}

function sendAssistantText(peer: any, text: string, sessionId?: string | null) {
  peer.send(JSON.stringify({
    type: 'ui_event',
    event: {
      type: 'block_start',
      sessionId: sessionId || undefined,
      blockId: `blk-${Date.now()}`,
      blockType: 'text',
      text,
    },
  }))
  peer.send(JSON.stringify({
    type: 'ui_event',
    event: {
      type: 'block_end',
      sessionId: sessionId || undefined,
      blockId: '',
    },
  }))
}

export default defineWebSocketHandler({
  open(_peer) {
    // Client connected
  },

  close(peer) {
    const state = peerStates.get(peer.id)
    if (state?.proc) {
      killProc(state.proc)
    }
    peerStates.delete(peer.id)
  },

  error(peer, error) {
    console.error('[WS] Error for peer', peer.id, ':', error)
  },

  message(peer, rawMessage) {
    let msg: ClientMessage
    try {
      msg = JSON.parse(rawMessage.text())
    } catch {
      peer.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }))
      return
    }

    if (msg.type === 'ping') {
      peer.send(JSON.stringify({ type: 'pong' }))
      return
    }

    if (msg.type === 'chat') {
      handleChatMessage(peer, msg)
      return
    }

    if (msg.type === 'permission_response') {
      handlePermissionResponse(peer, msg)
      return
    }

    if (msg.type === 'abort') {
      handleAbort(peer)
      return
    }

    if (msg.type === 'reset_context') {
      handleResetContext(peer)
      return
    }
  },
})

function handlePermissionResponse(peer: any, msg: PermissionResponse) {
  const state = getPeerState(peer.id)

  console.log('[WS] Permission response:', {
    allow: msg.allow,
    pendingTools: state.pendingTools,
    approvedTools: Array.from(state.approvedTools),
    sessionId: state.providerSessionId,
    providerId: state.pendingMessage?.providerId,
    providerModelKey: state.pendingMessage?.providerModelKey,
  })

  if (msg.allow && state.pendingMessage) {
    // Add all pending tools to approved set
    for (const tool of state.pendingTools) {
      const normalized = normalizeToolName(tool)
      if (normalized) {
        state.approvedTools.add(normalized)
      }
    }
    console.log('[WS] Tools approved:', state.pendingTools, '- Total approved:', Array.from(state.approvedTools))
    state.pendingTools = []
    // Keep providerSessionId to resume the conversation and preserve the original
    // permission mode so ask/plan continue to gate subsequent tools.
    const resumeMode: PermissionMode = state.pendingMessage.permissionMode || 'ask'
    runProvider(peer, state, {
      ...state.pendingMessage,
      permissionMode: resumeMode,
    })
  } else {
    state.pendingTools = []
    state.pendingMessage = null
    peer.send(JSON.stringify({ type: 'done', requestId: 'denied', denied: true }))
  }
}

function handleAbort(peer: any) {
  const state = getPeerState(peer.id)

  console.log('[WS] Abort requested for peer:', peer.id)

  // Kill the process if running
  if (state.proc) {
    state.procGeneration++
    killProc(state.proc)
    state.proc = null
  }

  // Clear pending state
  state.pendingMessage = null
  state.pendingTools = []

  // Send confirmation
  peer.send(JSON.stringify({ type: 'aborted' }))

  console.log('[WS] Abort completed for peer:', peer.id)
}

/**
 * Clear AI provider session state (shared logic for reset and speckit commands)
 */
function clearProviderSession(state: PeerState) {
  // Kill the process if running
  if (state.proc) {
    state.procGeneration++
    killProc(state.proc)
    state.proc = null
  }

  // Clear all session state (this forces a new conversation context)
  state.providerSessionId = null
  state.approvedTools.clear()
  state.pendingMessage = null
  state.pendingTools = []
}

function handleResetContext(peer: any) {
  const state = getPeerState(peer.id)

  console.log('[WS] Reset context requested for peer:', peer.id)

  clearProviderSession(state)

  // Send confirmation
  peer.send(JSON.stringify({ type: 'context_reset' }))

  console.log('[WS] Context reset completed for peer:', peer.id)
}

async function handleChatMessage(peer: any, msg: ChatMessage) {
  const state = getPeerState(peer.id)
  const attachments = normalizeImageAttachments(msg.attachments)

  // Validate message content
  if (typeof msg.message !== 'string') {
    console.error('[WS] Invalid chat message - missing or invalid message property:', msg)
    peer.send(JSON.stringify({ 
      type: 'error', 
      error: 'Invalid message: message property is required',
      requestId: msg.requestId 
    }))
    return
  }
  if (msg.message.trim().length === 0 && attachments.length === 0) {
    peer.send(JSON.stringify({
      type: 'error',
      error: 'Invalid message: message or image attachment is required',
      requestId: msg.requestId,
    }))
    return
  }

  // Detect /speckit.* commands (e.g., /speckit.plan, /speckit.tasks, /speckit.implement)
  const isSpeckitCommand = msg.message.trim().startsWith('/speckit.')

  // Auto-reset context for speckit commands to prevent context pollution between pipeline steps
  if (isSpeckitCommand) {
    console.log('[WS] Speckit command detected - auto-resetting context for peer:', peer.id)
    clearProviderSession(state)
    // Note: don't send context_reset event here to avoid UI noise
  } else {
    // Kill any existing process for non-speckit messages
    if (state.proc) {
      state.procGeneration++
      killProc(state.proc)
      state.proc = null
    }
  }

  // Reset state for new message
  state.pendingMessage = msg
  state.pendingTools = []

  // Use existing session ID if provided (continuing conversation)
  // But for speckit commands, session was already cleared above
  if (!isSpeckitCommand && msg.sessionId) {
    state.providerSessionId = msg.sessionId
    // Keep approvedTools when continuing a session
  } else if (!isSpeckitCommand) {
    // New conversation - clear approved tools
    state.approvedTools.clear()
    state.providerSessionId = null
  }

  console.log('[WS] Chat message received:', {
    hasSessionId: !!msg.sessionId,
    sessionId: state.providerSessionId,
    approvedTools: Array.from(state.approvedTools),
    attachmentCount: attachments.length,
    providerId: msg.providerId,
    providerModelKey: msg.providerModelKey,
    isSpeckitCommand,
  })

  runProvider(peer, state, msg)
}

async function runProvider(peer: any, state: PeerState, msg: ChatMessage, isRetry = false, forceEphemeral = false) {
  const requestedSelection = msg.providerId
    ? { providerId: msg.providerId, modelKey: msg.providerModelKey || '' }
    : { providerId: 'claude', modelKey: msg.providerModelKey || '' }
  const selection = await resolveServerProviderSelection(requestedSelection)
  const providerGuard = await guardProviderCapability(
    selection,
    'streaming',
    'Choose a provider with streaming capability in Settings.',
  )
  if ('failure' in providerGuard) {
    peer.send(JSON.stringify({
      type: 'error',
      error: providerGuard.failure.error,
      requestId: msg.requestId,
    }))
    return
  }

  const projectDir = getProjectDir()
  const workingDirectory = msg.cwd || projectDir
  const mode = msg.permissionMode || 'ask'

  if (mode === 'ask' || mode === 'plan') {
    const permissionGuard = await guardProviderCapability(
      selection,
      'permissions',
      'Use auto/bypass permission mode or choose a provider that supports permission prompts.',
    )
    if ('failure' in permissionGuard) {
      peer.send(JSON.stringify({
        type: 'error',
        error: permissionGuard.failure.error,
        requestId: msg.requestId,
      }))
      return
    }
  }

  // Recover worktree if /tmp was wiped (e.g. after reboot)
  if (workingDirectory.startsWith('/tmp/sc-') && !existsSync(workingDirectory)) {
    const result = await ensureChatWorktree(projectDir, workingDirectory, msg.worktreeBranch)
    if (result.recovered) {
      peer.send(JSON.stringify({ type: 'worktree_recovered' }))
    } else if (result.error) {
      peer.send(JSON.stringify({
        type: 'error',
        error: `Worktree recovery failed: ${result.error}`,
        requestId: msg.requestId,
      }))
      return
    }
  }

  // Add resume flag if we have a session (skip on retry)
  const usedResumeFlag = !isRetry && !!state.providerSessionId
  const resumeSessionId = usedResumeFlag ? state.providerSessionId! : undefined

  // Inject feature spec context via --append-system-prompt (new sessions only)
  let systemPrompt: string | undefined
  if (msg.featureId && !usedResumeFlag) {
    try {
      const specContext = await loadSpecContext(projectDir, msg.featureId)
      if (specContext) {
        systemPrompt = specContext
      }
    } catch (error) {
      console.error('[WS] Failed to load spec context:', error)
      // Non-fatal: proceed without spec context
    }
  }

  console.log('[WS] Running provider stream:', selection.providerId, selection.modelKey, isRetry ? '(retry)' : '')

  const generation = state.procGeneration
  let permissionRequested = false
  let emittedRenderableContent = false

  const attachments = normalizeImageAttachments(msg.attachments)
  const providerMessage = buildProviderMessage(msg.message, attachments)

  try {
    state.proc = await streamChatWithProvider(
      {
        message: providerMessage,
        selection,
        cwd: workingDirectory,
        permissionMode: mode,
        approvedTools: Array.from(state.approvedTools),
        resumeSessionId,
        systemPrompt,
        ephemeral: forceEphemeral && selection.providerId === 'codex',
      },
      {
        onProviderJson(parsed) {
          const adapter = selection.providerId === 'claude' ? transformClaudeEvent : transformCodexEvent
          const events = adapter(parsed as Record<string, unknown>)

          for (const event of events) {
            if (event.sessionId) {
              state.providerSessionId = event.sessionId
            }
            if (isRenderableEvent(event)) {
              emittedRenderableContent = true
            }

            // Handle permission interception
            if ((mode === 'ask' || mode === 'plan') && !permissionRequested) {
              const permRequest = checkForPermissionRequest(event, state.approvedTools, selection.providerId)
              if (permRequest) {
                permissionRequested = true
                state.pendingTools = permRequest.tools || [permRequest.tool]
                peer.send(JSON.stringify({
                  type: 'permission_request',
                  tool: permRequest.tool,
                  tools: state.pendingTools,
                  description: permRequest.description || `Permission required: ${permRequest.tool}`,
                }))
                state.proc?.kill()
                return
              }
            }

            // Emit canonical UI event
            peer.send(JSON.stringify({ type: 'ui_event', event }))
          }
        },
        onClose({ exitCode, signal, nonJsonOutput }) {
          if (state.procGeneration !== generation) {
            return
          }

          try {
            if (!permissionRequested) {
              if (exitCode !== 0 && exitCode !== null) {
                console.error('[WS] Provider process exited unexpectedly', {
                  providerId: selection.providerId,
                  modelKey: selection.modelKey,
                  permissionMode: mode,
                  requestId: msg.requestId,
                  exitCode,
                  signal,
                  nonJsonOutput: nonJsonOutput.slice(-25),
                })

                if ((mode === 'ask' || mode === 'plan')) {
                  const inferred = extractPermissionRequestFromProcessOutput(nonJsonOutput)
                  if (inferred) {
                    permissionRequested = true
                    state.pendingTools = normalizeTools(inferred.tools)
                    peer.send(JSON.stringify({
                      type: 'permission_request',
                      tool: state.pendingTools[0] || 'Permission',
                      tools: state.pendingTools,
                      description: inferred.description,
                    }))
                    state.proc = null
                    return
                  }
                }

                const hasPermissionError = hasCodexPermissionError(nonJsonOutput)
                const missingRolloutPath = hasCodexMissingRolloutPathError(nonJsonOutput)
                if (missingRolloutPath && !hasPermissionError && !isRetry) {
                  peer.send(JSON.stringify({
                    type: 'session_reset',
                    reason: 'Codex session state was missing rollout data. Retrying with a fresh ephemeral session.',
                  }))
                  state.providerSessionId = null
                  state.proc = null
                  runProvider(peer, state, msg, true, true)
                  return
                }

                if (usedResumeFlag && !isRetry) {
                  const retryWithEphemeral = selection.providerId === 'codex'
                  peer.send(JSON.stringify({
                    type: 'session_reset',
                    reason: retryWithEphemeral
                      ? `Session resume failed (exit code ${exitCode}). Retrying with a fresh ephemeral session.`
                      : `Session resume failed (exit code ${exitCode}). Retrying with a fresh session.`,
                  }))
                  state.providerSessionId = null
                  state.proc = null
                  runProvider(peer, state, msg, true, retryWithEphemeral)
                  return
                }

                const summary = summarizeProviderProcessError(nonJsonOutput, 700)
                const details = summary ? ` — ${summary}` : ''
                peer.send(JSON.stringify({
                  type: 'error',
                  error: `Provider process exited unexpectedly (code: ${exitCode}${signal ? ', signal: ' + signal : ''})${details}`,
                  requestId: msg.requestId,
                }))
              } else if (exitCode === null && signal) {
                const summary = summarizeProviderProcessError(nonJsonOutput, 700)
                const details = summary ? ` — ${summary}` : ''
                peer.send(JSON.stringify({
                  type: 'error',
                  error: `Provider process was killed by signal ${signal}${details}`,
                  requestId: msg.requestId,
                }))
                console.error('[WS] Provider process killed by signal', {
                  providerId: selection.providerId,
                  modelKey: selection.modelKey,
                  permissionMode: mode,
                  requestId: msg.requestId,
                  signal,
                  nonJsonOutput: nonJsonOutput.slice(-25),
                })
              } else {
                if (!emittedRenderableContent) {
                  const summary = summarizeProviderProcessError(nonJsonOutput, 700)
                  const fallbackText = summary
                    ? `Provider returned no structured response.\n\nRaw output:\n${summary}`
                    : 'Provider completed without returning visible response content.'
                  sendAssistantText(peer, fallbackText, state.providerSessionId)
                }
                peer.send(JSON.stringify({ type: 'done', requestId: msg.requestId }))
              }
              state.pendingMessage = null
            }
          } finally {
            state.proc = null
          }
        },
        onError(error) {
          try {
            peer.send(JSON.stringify({
              type: 'error',
              error: `Provider process error: ${error.message}`,
              requestId: msg.requestId,
            }))
          } finally {
            state.pendingMessage = null
            state.pendingTools = []
            state.proc = null
          }
        },
      },
    )
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to start provider process'
    peer.send(JSON.stringify({
      type: 'error',
      error: errorMsg,
      requestId: msg.requestId,
    }))
    state.pendingMessage = null
    state.pendingTools = []
    state.proc = null
  }
}
