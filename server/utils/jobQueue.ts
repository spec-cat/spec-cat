/**
 * Job queue for AI provider chat execution.
 * Manages job lifecycle, provider process, and event buffering.
 * Emits events through EventBus for decoupled consumption.
 */

import { existsSync } from 'node:fs'
import { eventBus, GLOBAL_CHANNEL, type JobEvent } from './eventBus'
import { getProjectDir } from './projectDir'
import { ensureChatWorktree } from './ensureChatWorktree'
import { loadSpecContext } from './specContext'
import { guardProviderCapability, resolveServerProviderSelection } from './aiProviderSelection'
import type { AIProviderStreamController } from './aiProvider'
import { streamChatWithProvider } from './aiProvider'
import { getProvider } from './aiProviderRegistry'
import {
  hasCodexMissingRolloutPathError,
  hasCodexPermissionError,
  summarizeProviderProcessError,
} from './providerProcessError'
import { isRenderableEvent } from './uiAdapter'
import {
  approveTools,
  deriveApprovalRequestFromEvent,
  deriveApprovalRequestFromProcessOutput,
} from './providerApprovalPolicy'

// ── Types ──────────────────────────────────────────────

type PermissionMode = 'plan' | 'ask' | 'auto' | 'bypass'

export interface ChatImageAttachment {
  id: string
  name: string
  mimeType: string
  size: number
  dataUrl: string
}

export interface ChatJobMessage {
  message: string
  conversationId: string
  attachments?: ChatImageAttachment[]
  requestId: string
  sessionId?: string
  permissionMode?: PermissionMode
  cwd?: string
  worktreeBranch?: string
  featureId?: string
  providerId?: string
  providerModelKey?: string
}

export type JobSource = 'user' | 'scheduler' | 'cascade'
export type JobStatus = 'queued' | 'running' | 'waiting_permission' | 'done' | 'error'

export interface ChatJob {
  id: string
  conversationId: string
  message: ChatJobMessage
  source: JobSource
  status: JobStatus
  events: JobEvent[]
  createdAt: number
}

// Internal per-job process state (not exposed)
interface JobProcessState {
  proc: AIProviderStreamController | null
  procGeneration: number
  pendingTools: string[]
}

// Per-conversation state (persists across jobs within a session)
interface ConversationState {
  approvedTools: Set<string>
  providerSessionId: string | null
  activeJobId: string | null
}

// ── Constants ──────────────────────────────────────────

const MAX_ATTACHMENT_COUNT = 4
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024
const SPECKIT_AUTONOMY_DIRECTIVE = [
  'Speckit Execution Mode (MANDATORY):',
  '- Do not ask the user for confirmation, follow-up, or permission to proceed.',
  '- Do not end with questions like "Would you like me to..." or "Shall I...".',
  '- For remediation and traceability gaps, directly edit the relevant spec files now (spec.md, plan.md, tasks.md) when writable.',
  '- Prefer concrete file edits over recommendations; provide a brief change summary after edits are complete.',
  '- Only stop without edits if blocked by a hard constraint (missing files, permission failure), and report the blocker explicitly.',
].join('\n')

// ── Utility Functions ──────────────────────────────────

function isSpeckitCommand(message: string): boolean {
  return message.trim().startsWith('/speckit.')
}

function killProc(proc: AIProviderStreamController) {
  try { proc.kill() } catch {}
}

export function normalizeImageAttachments(attachments: unknown): ChatImageAttachment[] {
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
        !id
        || !mimeType.startsWith('image/')
        || size <= 0
        || size > MAX_ATTACHMENT_SIZE_BYTES
        || !dataUrl.startsWith('data:image/')
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

function generateJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

// ── JobQueue Implementation ────────────────────────────

class ChatJobQueue {
  private jobs = new Map<string, ChatJob>()
  private jobProcessStates = new Map<string, JobProcessState>()
  private conversationStates = new Map<string, ConversationState>()

  private getConversationState(conversationId: string): ConversationState {
    let state = this.conversationStates.get(conversationId)
    if (!state) {
      state = {
        approvedTools: new Set(),
        providerSessionId: null,
        activeJobId: null,
      }
      this.conversationStates.set(conversationId, state)
    }
    return state
  }

  private emitAndBuffer(job: ChatJob, event: JobEvent): void {
    job.events.push(event)
    eventBus.emit(job.conversationId, event)
  }

  private emitGlobal(event: JobEvent): void {
    eventBus.emit(GLOBAL_CHANNEL, event)
  }

  private setJobStatus(job: ChatJob, status: JobStatus): void {
    const prev = job.status
    job.status = status
    if (prev !== status && (status === 'done' || status === 'error')) {
      this.emitGlobal({
        type: 'notification',
        notificationEvent: 'job_completed',
        jobId: job.id,
        conversationId: job.conversationId,
        source: job.source,
        status,
      })
    }
  }

  // ── Public API ─────────────────────────────────────

  /**
   * Submit a new job for provider execution.
   * Returns the job ID.
   */
  submit(msg: ChatJobMessage, source: JobSource = 'user'): string {
    const conversationId = msg.conversationId
    const convState = this.getConversationState(conversationId)
    const speckitCommand = isSpeckitCommand(msg.message)

    // Cancel any active job for this conversation
    if (convState.activeJobId) {
      const prevState = this.jobProcessStates.get(convState.activeJobId)
      if (prevState?.proc) {
        prevState.procGeneration++
        killProc(prevState.proc)
        prevState.proc = null
      }
      const prevJob = this.jobs.get(convState.activeJobId)
      if (prevJob && (prevJob.status === 'running' || prevJob.status === 'waiting_permission')) {
        this.setJobStatus(prevJob, 'done')
      }
    }

    // Session management
    if (speckitCommand) {
      console.log('[JobQueue] Speckit command detected — auto-resetting context:', conversationId)
      convState.providerSessionId = null
      convState.approvedTools.clear()
    } else if (msg.sessionId) {
      convState.providerSessionId = msg.sessionId
      // Keep approvedTools when continuing a session
    } else {
      convState.approvedTools.clear()
      convState.providerSessionId = null
    }

    // Create job
    const job: ChatJob = {
      id: generateJobId(),
      conversationId,
      message: msg,
      source,
      status: 'queued',
      events: [],
      createdAt: Date.now(),
    }
    const procState: JobProcessState = {
      proc: null,
      procGeneration: 0,
      pendingTools: [],
    }
    this.jobs.set(job.id, job)
    this.jobProcessStates.set(job.id, procState)
    convState.activeJobId = job.id

    console.log('[JobQueue] Job submitted:', {
      jobId: job.id,
      conversationId,
      source,
      hasSessionId: !!msg.sessionId,
      sessionId: convState.providerSessionId,
      approvedTools: Array.from(convState.approvedTools),
      isSpeckitCommand: speckitCommand,
    })

    // Notify all connected clients about the new job
    this.emitGlobal({
      type: 'notification',
      notificationEvent: 'job_created',
      jobId: job.id,
      conversationId,
      source,
      message: msg.message,
    })

    this.runProvider(job, false, false)
    return job.id
  }

  /**
   * Handle permission response for the active job.
   */
  respondToPermission(conversationId: string, allow: boolean): void {
    const convState = this.getConversationState(conversationId)
    if (!convState.activeJobId) return

    const job = this.jobs.get(convState.activeJobId)
    const procState = this.jobProcessStates.get(convState.activeJobId)
    if (!job || !procState) return

    console.log('[JobQueue] Permission response:', {
      jobId: job.id,
      allow,
      pendingTools: procState.pendingTools,
      approvedTools: Array.from(convState.approvedTools),
      sessionId: convState.providerSessionId,
      providerId: job.message.providerId,
      providerModelKey: job.message.providerModelKey,
    })

    if (allow) {
      approveTools(convState.approvedTools, procState.pendingTools)
      console.log('[JobQueue] Tools approved:', procState.pendingTools, '- Total:', Array.from(convState.approvedTools))
      procState.pendingTools = []
      job.status = 'running'

      // Resume with original permission mode
      const resumeMode: PermissionMode = job.message.permissionMode || 'ask'
      job.message = { ...job.message, permissionMode: resumeMode }
      this.runProvider(job, false, false)
    } else {
      procState.pendingTools = []
      this.setJobStatus(job, 'done')
      this.emitAndBuffer(job, { type: 'done', requestId: 'denied', denied: true })
    }
  }

  /**
   * Abort the active job for a conversation.
   */
  abort(conversationId: string): void {
    const convState = this.conversationStates.get(conversationId)
    if (!convState?.activeJobId) return

    const job = this.jobs.get(convState.activeJobId)
    const procState = this.jobProcessStates.get(convState.activeJobId)
    if (!job || !procState) return

    console.log('[JobQueue] Abort:', job.id)

    if (procState.proc) {
      procState.procGeneration++
      killProc(procState.proc)
      procState.proc = null
    }
    procState.pendingTools = []
    this.setJobStatus(job, 'done')
  }

  /**
   * Reset provider session state for a conversation.
   */
  resetContext(conversationId: string): void {
    const convState = this.conversationStates.get(conversationId)
    if (!convState) return

    console.log('[JobQueue] Reset context:', conversationId)

    if (convState.activeJobId) {
      const procState = this.jobProcessStates.get(convState.activeJobId)
      if (procState?.proc) {
        procState.procGeneration++
        killProc(procState.proc)
        procState.proc = null
      }
    }

    convState.providerSessionId = null
    convState.approvedTools.clear()
    convState.activeJobId = null
  }

  /**
   * Clean up on peer disconnect. Aborts user-initiated jobs.
   */
  cleanup(conversationId: string): void {
    const convState = this.conversationStates.get(conversationId)
    if (!convState?.activeJobId) return

    const job = this.jobs.get(convState.activeJobId)
    if (job && job.source === 'user') {
      this.abort(conversationId)
    }
  }

  getJob(id: string): ChatJob | undefined {
    return this.jobs.get(id)
  }

  getActiveJob(conversationId: string): ChatJob | undefined {
    const convState = this.conversationStates.get(conversationId)
    if (!convState?.activeJobId) return undefined
    return this.jobs.get(convState.activeJobId)
  }

  listJobs(conversationId: string): ChatJob[] {
    return Array.from(this.jobs.values()).filter(j => j.conversationId === conversationId)
  }

  listAllJobs(): ChatJob[] {
    return Array.from(this.jobs.values())
  }

  // ── Provider Execution ─────────────────────────────

  private async runProvider(job: ChatJob, isRetry: boolean, forceEphemeral: boolean): Promise<void> {
    const msg = job.message
    const convState = this.getConversationState(job.conversationId)
    const procState = this.jobProcessStates.get(job.id)
    if (!procState) return

    job.status = 'running'

    const requestedSelection = msg.providerId
      ? { providerId: msg.providerId, modelKey: msg.providerModelKey || '' }
      : { providerId: 'claude', modelKey: msg.providerModelKey || '' }
    const selection = await resolveServerProviderSelection(requestedSelection)
    const provider = getProvider(selection.providerId)
    if (!provider) {
      this.emitAndBuffer(job, {
        type: 'error',
        error: `Provider "${selection.providerId}" is not registered`,
        requestId: msg.requestId,
      })
      this.setJobStatus(job, 'error')
      return
    }

    const providerGuard = await guardProviderCapability(
      selection,
      'streaming',
      'Choose a provider with streaming capability in Settings.',
    )
    if ('failure' in providerGuard) {
      this.emitAndBuffer(job, {
        type: 'error',
        error: providerGuard.failure.error,
        requestId: msg.requestId,
      })
      this.setJobStatus(job, 'error')
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
        this.emitAndBuffer(job, {
          type: 'error',
          error: permissionGuard.failure.error,
          requestId: msg.requestId,
        })
        this.setJobStatus(job, 'error')
        return
      }
    }

    // Recover worktree if /tmp was wiped
    if (workingDirectory.startsWith('/tmp/sc-') && !existsSync(workingDirectory)) {
      const result = await ensureChatWorktree(projectDir, workingDirectory, msg.worktreeBranch)
      if (result.recovered) {
        this.emitAndBuffer(job, { type: 'worktree_recovered' })
      } else if (result.error) {
        this.emitAndBuffer(job, {
          type: 'error',
          error: `Worktree recovery failed: ${result.error}`,
          requestId: msg.requestId,
        })
        this.setJobStatus(job, 'error')
        return
      }
    }

    // Resume flag (skip on retry)
    const usedResumeFlag = !isRetry && !!convState.providerSessionId
    const resumeSessionId = usedResumeFlag ? convState.providerSessionId! : undefined

    // Inject feature spec context
    let systemPrompt: string | undefined
    const speckitCommand = isSpeckitCommand(msg.message)
    if (msg.featureId && !usedResumeFlag) {
      try {
        const specContext = await loadSpecContext(projectDir, msg.featureId)
        if (specContext) {
          systemPrompt = specContext
        }
      } catch (error) {
        console.error('[JobQueue] Failed to load spec context:', error)
      }
    }
    if (speckitCommand && !usedResumeFlag) {
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n${SPECKIT_AUTONOMY_DIRECTIVE}`
        : SPECKIT_AUTONOMY_DIRECTIVE
    }

    console.log('[JobQueue] Running provider:', selection.providerId, selection.modelKey, isRetry ? '(retry)' : '')

    const generation = procState.procGeneration
    let permissionRequested = false
    let emittedRenderableContent = false
    let emittedTerminalErrorEvent = false

    const attachments = msg.attachments || []
    const providerMessage = buildProviderMessage(msg.message, attachments)

    try {
      procState.proc = await streamChatWithProvider(
        {
          message: providerMessage,
          selection,
          cwd: workingDirectory,
          permissionMode: mode,
          approvedTools: Array.from(convState.approvedTools),
          resumeSessionId,
          systemPrompt,
          ephemeral: forceEphemeral && selection.providerId === 'codex',
        },
        {
          onProviderJson: (parsed) => {
            const events = provider.toCanonicalEvents(parsed)

            for (const event of events) {
              if (event.sessionId) {
                convState.providerSessionId = event.sessionId
              }
              if (isRenderableEvent(event)) {
                emittedRenderableContent = true
              }
              if (event.type === 'error' || (event.type === 'turn_result' && event.subtype !== 'success')) {
                emittedTerminalErrorEvent = true
              }

              // Permission interception
              if ((mode === 'ask' || mode === 'plan') && !permissionRequested) {
                const permRequest = deriveApprovalRequestFromEvent(
                  event,
                  convState.approvedTools,
                  selection.providerId,
                  mode,
                )
                if (permRequest) {
                  permissionRequested = true
                  procState.pendingTools = permRequest.tools || [permRequest.tool]
                  job.status = 'waiting_permission'
                  this.emitAndBuffer(job, {
                    type: 'permission_request',
                    tool: permRequest.tool,
                    tools: procState.pendingTools,
                    description: permRequest.description || `Permission required: ${permRequest.tool}`,
                  })
                  procState.proc?.kill()
                  return
                }
              }

              // Emit canonical UI event
              this.emitAndBuffer(job, { type: 'ui_event', event })
            }
          },

          onClose: ({ exitCode, signal, nonJsonOutput }) => {
            if (procState.procGeneration !== generation) {
              return
            }

            try {
              if (!permissionRequested) {
                if (exitCode !== 0 && exitCode !== null) {
                  console.error('[JobQueue] Provider exited unexpectedly', {
                    providerId: selection.providerId,
                    modelKey: selection.modelKey,
                    permissionMode: mode,
                    requestId: msg.requestId,
                    exitCode,
                    signal,
                    nonJsonOutput: nonJsonOutput.slice(-25),
                  })

                  const inferred = deriveApprovalRequestFromProcessOutput(nonJsonOutput, mode)
                  if (inferred) {
                    permissionRequested = true
                    procState.pendingTools = inferred.tools || [inferred.tool]
                    job.status = 'waiting_permission'
                    this.emitAndBuffer(job, {
                      type: 'permission_request',
                      tool: inferred.tool,
                      tools: procState.pendingTools,
                      description: inferred.description,
                    })
                    procState.proc = null
                    return
                  }

                  const hasPermissionError = hasCodexPermissionError(nonJsonOutput)
                  const missingRolloutPath = hasCodexMissingRolloutPathError(nonJsonOutput)
                  if (missingRolloutPath && !hasPermissionError && !isRetry) {
                    this.emitAndBuffer(job, {
                      type: 'session_reset',
                      reason: 'Codex session state was missing rollout data. Retrying with a fresh ephemeral session.',
                    })
                    convState.providerSessionId = null
                    procState.proc = null
                    this.runProvider(job, true, true)
                    return
                  }

                  if (usedResumeFlag && !isRetry) {
                    const retryWithEphemeral = selection.providerId === 'codex'
                    this.emitAndBuffer(job, {
                      type: 'session_reset',
                      reason: retryWithEphemeral
                        ? `Session resume failed (exit code ${exitCode}). Retrying with a fresh ephemeral session.`
                        : `Session resume failed (exit code ${exitCode}). Retrying with a fresh session.`,
                    })
                    convState.providerSessionId = null
                    procState.proc = null
                    this.runProvider(job, true, retryWithEphemeral)
                    return
                  }

                  const summary = summarizeProviderProcessError(nonJsonOutput, 700)
                  if (!summary && emittedTerminalErrorEvent && emittedRenderableContent) {
                    this.emitAndBuffer(job, { type: 'done', requestId: msg.requestId })
                    this.setJobStatus(job, 'done')
                    return
                  }

                  const details = summary ? ` — ${summary}` : ''
                  this.emitAndBuffer(job, {
                    type: 'error',
                    error: `Provider process exited unexpectedly (code: ${exitCode}${signal ? ', signal: ' + signal : ''})${details}`,
                    requestId: msg.requestId,
                  })
                  this.setJobStatus(job, 'error')
                } else if (exitCode === null && signal) {
                  const summary = summarizeProviderProcessError(nonJsonOutput, 700)
                  const details = summary ? ` — ${summary}` : ''
                  this.emitAndBuffer(job, {
                    type: 'error',
                    error: `Provider process was killed by signal ${signal}${details}`,
                    requestId: msg.requestId,
                  })
                  this.setJobStatus(job, 'error')
                  console.error('[JobQueue] Provider killed by signal', {
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
                    this.emitAssistantText(job, fallbackText, convState.providerSessionId)
                  }
                  this.emitAndBuffer(job, { type: 'done', requestId: msg.requestId })
                  this.setJobStatus(job, 'done')
                }
              }
            } finally {
              procState.proc = null
            }
          },

          onError: (error) => {
            try {
              this.emitAndBuffer(job, {
                type: 'error',
                error: `Provider process error: ${error.message}`,
                requestId: msg.requestId,
              })
              this.setJobStatus(job, 'error')
            } finally {
              procState.pendingTools = []
              procState.proc = null
            }
          },
        },
      )
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to start provider process'
      this.emitAndBuffer(job, {
        type: 'error',
        error: errorMsg,
        requestId: msg.requestId,
      })
      this.setJobStatus(job, 'error')
      procState.pendingTools = []
      procState.proc = null
    }
  }

  private emitAssistantText(job: ChatJob, text: string, sessionId?: string | null): void {
    const blockId = `blk-${Date.now()}`
    this.emitAndBuffer(job, {
      type: 'ui_event',
      event: {
        type: 'block_start',
        sessionId: sessionId || undefined,
        blockId,
        blockType: 'text',
        text,
      },
    })
    this.emitAndBuffer(job, {
      type: 'ui_event',
      event: {
        type: 'block_end',
        sessionId: sessionId || undefined,
        blockId: '',
      },
    })
  }
}

export const jobQueue = new ChatJobQueue()
