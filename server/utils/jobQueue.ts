/**
 * Job queue for AI provider chat execution.
 * Manages job lifecycle, provider process, and event buffering.
 * Emits events through EventBus for decoupled consumption.
 */

import { existsSync } from 'node:fs'
import { eventBus, GLOBAL_CHANNEL, type JobEvent } from './eventBus'
import { getProjectDir } from './projectDir'
import { readConversationFromStorage, updateConversationProviderSessionInStorage } from './conversationStore'
import { ensureChatWorktree } from './ensureChatWorktree'
import { isSpecCatWorktreePath } from './worktreePaths'
import { loadSpecContext } from './specContext'
import { guardProviderCapability, resolveServerProviderSelection } from './aiProviderSelection'
import type { AIProviderStreamController } from './aiProvider'
import { getProvider } from './aiProviderRegistry'
import { startCliHookMonitor } from './cliHookMonitor'
import {
  buildTerminalSessionId,
  disposeTerminalSession,
  getOrCreateTerminalSession,
  subscribeTerminalSession,
  writeTerminalInput,
  type TerminalSession,
} from './terminalSessions'
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
  isUserInputToolName,
  parseToolInputJson,
  trackStreamingToolInput,
  type StreamingToolInput,
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
  baseBranch?: string
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
// Hard cap on a single PTY turn before it is force-failed. Generous so genuine
// long-running turns are unaffected; exists only to stop a job leaking forever
// when the Stop hook never fires.
const PTY_TURN_TIMEOUT_MS = 30 * 60_000
// Fallback turn-completion signal for when the CLI Stop hook never lands (hook
// not honored, spool race, reused session without hooks). The interactive TUI
// streams output continuously while working (animated spinner/status line), so a
// sustained gap of zero PTY output after the prompt is submitted means the TUI
// is idle at the composer = the turn finished. Long enough that a healthy Stop
// hook (which fires within ~1s of completion) always wins; short enough that a
// broken hook recovers in seconds instead of hanging for PTY_TURN_TIMEOUT_MS.
const PTY_IDLE_FINALIZE_MS = 8000
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

function getStoredProviderSessionId(conversation: unknown): string | null {
  if (!conversation || typeof conversation !== 'object') return null
  const record = conversation as Record<string, unknown>
  const value = record.providerSessionId ?? record.claudeSessionId
  return typeof value === 'string' && value.length > 0 ? value : null
}

function getStoredProviderSelection(conversation: unknown): { providerId: string; providerModelKey: string } | null {
  if (!conversation || typeof conversation !== 'object') return null
  const record = conversation as Record<string, unknown>
  const providerId = record.providerId
  if (typeof providerId !== 'string' || providerId.length === 0) return null
  const providerModelKey = record.providerModelKey
  return {
    providerId,
    providerModelKey: typeof providerModelKey === 'string' ? providerModelKey : '',
  }
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

    this.runProvider(job, false)
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
      this.runProvider(job, false)
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
    if (!convState?.activeJobId) {
      console.warn('[JobQueue] Abort: no active job for conversation', conversationId)
      return
    }

    const job = this.jobs.get(convState.activeJobId)
    const procState = this.jobProcessStates.get(convState.activeJobId)
    if (!job || !procState) {
      console.warn('[JobQueue] Abort: job or procState not found for', convState.activeJobId)
      return
    }

    console.log('[JobQueue] Abort:', job.id, 'status:', job.status, 'hasProc:', !!procState.proc)

    if (procState.proc) {
      procState.procGeneration++
      killProc(procState.proc)
      procState.proc = null
      console.log('[JobQueue] Abort: process killed for', job.id)
    }
    procState.pendingTools = []
    // Emit aborted event so persister can flush the message as 'stopped'
    this.emitAndBuffer(job, { type: 'done', requestId: 'aborted', aborted: true })
    this.setJobStatus(job, 'done')
    console.log('[JobQueue] Abort: job status set to done for', job.id)
  }

  /**
   * Terminate any provider process associated with a conversation that has
   * been finalized. Unlike abort(), this is cleanup for a read-only
   * conversation, so it must not emit a stopped assistant turn.
   */
  finalizeConversation(conversationId: string): void {
    // Kill the persistent interactive PTY for this conversation. The synthetic
    // job controller only sends Ctrl+C (interrupts a turn but leaves the CLI at
    // the composer), so without this the claude/codex process leaks once the
    // conversation is finalized. Done unconditionally — an idle, job-less
    // session (turn already completed) is the most common leak.
    disposeTerminalSession(buildTerminalSessionId(conversationId))

    const convState = this.conversationStates.get(conversationId)
    if (!convState) return

    if (convState.activeJobId) {
      const job = this.jobs.get(convState.activeJobId)
      const procState = this.jobProcessStates.get(convState.activeJobId)

      if (procState?.proc) {
        procState.procGeneration++
        killProc(procState.proc)
        procState.proc = null
        console.log('[JobQueue] Finalize: process killed for', convState.activeJobId)
      }

      if (procState) {
        procState.pendingTools = []
      }

      if (job && job.status !== 'done' && job.status !== 'error') {
        this.setJobStatus(job, 'done')
      }
    }

    convState.providerSessionId = null
    convState.approvedTools.clear()
    convState.activeJobId = null
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
   * Clean up on peer disconnect.
   * Jobs are NOT aborted — they run to completion so that a reconnecting
   * client (e.g. after browser refresh) can subscribe and replay events.
   */
  cleanup(_conversationId: string): void {
    // Intentionally no-op: the job process keeps running and events
    // continue to buffer in ChatJob.events for later replay.
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

  /**
   * Execute a job through the provider's interactive PTY session. Turn
   * completion is detected via the CLI Stop hook.
   */
  private async runProvider(job: ChatJob, isRetry: boolean): Promise<void> {
    return this.runProviderViaPty(job, isRetry)
  }

  /**
   * Inject a prompt into a (possibly freshly-spawned) PTY session once its TUI
   * composer is ready, then submit it. The prompt is bracketed-pasted so
   * embedded newlines don't submit line-by-line. Server-side and
   * client-independent — runs whether or not a terminal-ws viewer is attached.
   */
  private injectMessage(
    session: TerminalSession,
    sessionId: string,
    text: string,
    stillValid: () => boolean,
    onSubmitted: () => void,
  ): void {
    const READY_IDLE_MS = 1200
    const REUSED_READY_MS = 800
    const READY_MAX_MS = 15_000
    const SUBMIT_IDLE_MS = 600
    const SUBMIT_MAX_MS = 4000
    const reused = session.buffer.length > 0

    // Strip embedded bracketed-paste markers so a message cannot break out of
    // paste mode and submit early or inject control sequences.
    const safeText = text.replace(/\x1b\[20[01]~/g, '')

    const startedAt = Date.now()
    let firstDataAt = reused ? startedAt : 0
    let lastDataAt = Date.now()
    let injected = false
    let injectedAt = 0
    let submitted = false

    const unsubscribe = subscribeTerminalSession(session, {
      onData: () => {
        const now = Date.now()
        if (!firstDataAt) firstDataAt = now
        lastDataAt = now
      },
      onExit: () => {},
    })

    const timer = setInterval(() => {
      if (!stillValid()) {
        clearInterval(timer)
        unsubscribe()
        return
      }
      const now = Date.now()

      if (!injected) {
        const idleMs = reused ? REUSED_READY_MS : READY_IDLE_MS
        const ready = firstDataAt > 0 && now - lastDataAt >= idleMs
        const forced = now - startedAt >= READY_MAX_MS
        if (ready || forced) {
          injected = true
          injectedAt = now
          lastDataAt = now
          writeTerminalInput(sessionId, `\x1b[200~${safeText}\x1b[201~`)
        }
        return
      }

      if (!submitted) {
        const echoSettled = now - lastDataAt >= SUBMIT_IDLE_MS
        const submitForced = now - injectedAt >= SUBMIT_MAX_MS
        if (echoSettled || submitForced) {
          submitted = true
          writeTerminalInput(sessionId, '\r')
          onSubmitted()
          clearInterval(timer)
          unsubscribe()
        }
        return
      }
    }, 250)
  }

  private async runProviderViaPty(job: ChatJob, isRetry: boolean): Promise<void> {
    const msg = job.message
    const convState = this.getConversationState(job.conversationId)
    const procState = this.jobProcessStates.get(job.id)
    if (!procState) return

    job.status = 'running'

    // Resolve provider (mirror of the stream path: prefer the message, fall
    // back to the persisted conversation provider rather than hardcoding claude).
    let requestedSelection: { providerId: string; modelKey: string }
    if (msg.providerId) {
      requestedSelection = { providerId: msg.providerId, modelKey: msg.providerModelKey || '' }
    } else {
      const storedSelection = getStoredProviderSelection(
        await readConversationFromStorage(job.conversationId),
      )
      requestedSelection = storedSelection
        ? { providerId: storedSelection.providerId, modelKey: msg.providerModelKey || storedSelection.providerModelKey }
        : { providerId: 'claude', modelKey: msg.providerModelKey || '' }
    }
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

    const projectDir = getProjectDir()
    const workingDirectory = msg.cwd || projectDir

    // Recover worktree if the spec-cat tmp directory was wiped.
    if (isSpecCatWorktreePath(workingDirectory) && !existsSync(workingDirectory)) {
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

    // Hydrate resume session id from storage when starting fresh.
    const speckitCommand = isSpeckitCommand(msg.message)
    if (!isRetry && !speckitCommand && !convState.providerSessionId) {
      const storedSessionId = getStoredProviderSessionId(await readConversationFromStorage(job.conversationId))
      if (storedSessionId) convState.providerSessionId = storedSessionId
    }
    const usedResumeFlag = !isRetry && !!convState.providerSessionId
    const resumeSessionId = usedResumeFlag ? convState.providerSessionId! : undefined

    // The interactive TUI has no --append-system-prompt, so spec context and the
    // speckit autonomy directive are prepended to the injected message instead.
    let preface = ''
    if (msg.featureId && !usedResumeFlag) {
      try {
        const specContext = await loadSpecContext(projectDir, msg.featureId)
        if (specContext) preface = specContext
      } catch (error) {
        console.error('[JobQueue] Failed to load spec context:', error)
      }
    }
    if (speckitCommand && !usedResumeFlag) {
      preface = preface ? `${preface}\n\n${SPECKIT_AUTONOMY_DIRECTIVE}` : SPECKIT_AUTONOMY_DIRECTIVE
    }
    const attachments = msg.attachments || []
    const baseMessage = buildProviderMessage(msg.message, attachments)
    const fullMessage = preface ? `${preface}\n\n${baseMessage}` : baseMessage

    console.log('[JobQueue] Running provider via PTY:', selection.providerId, selection.modelKey, isRetry ? '(retry)' : '')

    const generation = procState.procGeneration
    const sessionId = buildTerminalSessionId(job.conversationId)

    let session: TerminalSession
    try {
      session = getOrCreateTerminalSession({
        sessionId,
        cwd: workingDirectory,
        providerId: selection.providerId,
        modelKey: selection.modelKey,
        resumeSessionId,
        hookContext: {
          enabled: true,
          providerId: selection.providerId,
          conversationId: job.conversationId,
          jobId: job.id,
          requestId: msg.requestId,
        },
        onProviderSessionId: (providerSessionId) => {
          convState.providerSessionId = providerSessionId
          updateConversationProviderSessionInStorage(job.conversationId, providerSessionId).catch((error) => {
            console.warn('[JobQueue] Failed to persist provider session id:', error)
          })
        },
      })
    } catch (error) {
      this.emitAndBuffer(job, {
        type: 'error',
        error: error instanceof Error ? error.message : 'Failed to start provider terminal',
        requestId: msg.requestId,
      })
      this.setJobStatus(job, 'error')
      return
    }

    // Turn completion is signalled by the CLI Stop hook landing in the
    // conversation's spool. The monitor reads only records appended after it
    // starts, so the next Stop corresponds to this turn.
    let finished = false
    let submitted = false
    let watchdog: ReturnType<typeof setTimeout> | undefined
    let idleCheck: ReturnType<typeof setInterval> | undefined
    let unsubscribeExit: (() => void) | undefined
    // Output-idle fallback bookkeeping (see PTY_IDLE_FINALIZE_MS).
    let lastDataAt = Date.now()
    let sawPostSubmitData = false
    const cleanup = () => {
      monitor.stop()
      if (watchdog) clearTimeout(watchdog)
      if (idleCheck) clearInterval(idleCheck)
      unsubscribeExit?.()
    }
    const finalize = (lastAssistantMessage?: string) => {
      if (finished) return
      finished = true
      cleanup()
      if (procState.procGeneration !== generation) return // superseded by a newer job
      const text = lastAssistantMessage?.trim()
      if (text) this.emitAssistantText(job, text, convState.providerSessionId)
      this.emitAndBuffer(job, { type: 'cli_turn_stop_confirmed', requestId: msg.requestId })
      this.emitAndBuffer(job, { type: 'done', requestId: msg.requestId })
      this.setJobStatus(job, 'done')
      procState.proc = null
    }

    // Fallback so a turn can never hang in `running` forever. Without this, a
    // crashed/auth-failed PTY or a silently-broken hook injection (no Stop hook
    // ever lands) would leak the active job indefinitely.
    const finalizeError = (reason: string) => {
      if (finished) return
      finished = true
      cleanup()
      if (procState.procGeneration !== generation) return // superseded by a newer job
      this.emitAndBuffer(job, { type: 'error', error: reason, requestId: msg.requestId })
      this.setJobStatus(job, 'error')
      procState.proc = null
    }

    // A Ctrl+C from a superseded turn in a reused PTY can emit a stray Stop
    // before this turn's prompt is even submitted; arming on `submitted` ensures
    // only a post-submit Stop is treated as this turn's completion.
    const monitor = startCliHookMonitor({
      conversationId: job.conversationId,
      emit: (event) => this.emitAndBuffer(job, event),
      onStop: (lastAssistantMessage) => finalize(lastAssistantMessage),
      isArmed: () => submitted,
      // Only finalize on a Stop that follows this turn's own (post-submit)
      // UserPromptSubmit, so a stray Stop from a superseded turn in the reused
      // PTY can never be mistaken for completion. The output-idle watchdog below
      // remains the guaranteed fallback if the prompt hook never lands.
      requireArmedPromptSubmit: true,
    })

    // The PTY is a persistent session, so a normal turn never exits it; an exit
    // here means the provider process died mid-turn. A resumed session that dies
    // is almost always a stale resume id (rollout/jsonl wiped) — retry once from
    // a fresh session, mirroring the stream path's ephemeral fallback.
    const handleExit = () => {
      if (finished) return
      if (usedResumeFlag && !isRetry) {
        finished = true
        cleanup()
        if (procState.procGeneration !== generation) return // superseded by a newer job
        convState.providerSessionId = null
        this.emitAndBuffer(job, { type: 'session_reset', reason: 'Resume failed; starting a fresh session' })
        this.runProviderViaPty(job, true).catch((error) => {
          this.emitAndBuffer(job, {
            type: 'error',
            error: error instanceof Error ? error.message : 'Provider retry failed',
            requestId: msg.requestId,
          })
          this.setJobStatus(job, 'error')
        })
        return
      }
      finalizeError('Provider terminal exited before the turn completed')
    }
    unsubscribeExit = subscribeTerminalSession(session, {
      onData: () => {
        lastDataAt = Date.now()
        if (submitted) sawPostSubmitData = true
      },
      onExit: () => handleExit(),
    })

    // Primary completion is the Stop hook (finalize via onStop). This idle watch
    // is the fallback: once the prompt is submitted and the TUI has produced
    // output then fallen silent for PTY_IDLE_FINALIZE_MS, treat the turn as
    // complete so `done` is always emitted even when the hook never lands. A
    // healthy Stop hook calls finalize() first (finished=true), so this no-ops.
    idleCheck = setInterval(() => {
      if (finished) return
      if (!submitted || !sawPostSubmitData) return
      if (Date.now() - lastDataAt >= PTY_IDLE_FINALIZE_MS) {
        console.warn('[JobQueue] PTY turn completed via output-idle fallback (no Stop hook).')
        finalize()
      }
    }, 500)

    // Absolute cap as the last line of defence when no Stop hook arrives.
    watchdog = setTimeout(() => finalizeError('Provider turn timed out'), PTY_TURN_TIMEOUT_MS)

    // Synthetic controller so abort()/finalizeConversation()/submit() can
    // interrupt the in-flight turn. Ctrl+C interrupts the TUI without killing
    // the persistent session so the next turn can resume context.
    procState.proc = {
      kill: () => {
        try { writeTerminalInput(sessionId, '\x03') } catch {}
        cleanup()
      },
    }

    this.injectMessage(
      session,
      sessionId,
      fullMessage,
      () => procState.procGeneration === generation && !finished,
      () => { submitted = true },
    )
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
