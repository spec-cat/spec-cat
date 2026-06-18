import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'
import type { JobEvent } from './eventBus'
import { getCliHookSpoolPath, parseCliHookRecord, type CliHookRecord } from './cliHookInjection'

export interface CliHookMonitor {
  stop: () => void
  sawStop: () => boolean
}

interface CliHookMonitorOptions {
  conversationId: string
  /**
   * Match only records carrying this jobId. Omit to match every record in the
   * conversation's spool — required for persistent PTY sessions where the env
   * jobId is fixed at spawn and goes stale across turns.
   */
  jobId?: string
  emit: (event: JobEvent) => void
  /** Invoked once when the first Stop hook is observed after monitoring starts. */
  onStop?: (lastAssistantMessage?: string) => void
  /**
   * When provided, a Stop hook only counts as turn completion once this returns
   * true. Stops observed before arming — e.g. a Ctrl+C-induced Stop from a
   * superseded turn in a reused PTY — still emit their events but never trigger
   * onStop. Defaults to always-armed.
   */
  isArmed?: () => boolean
  /**
   * When true, a Stop only completes the turn after an armed `UserPromptSubmit`
   * has been observed. Every turn begins with that hook, so this guarantees the
   * Stop belongs to a turn whose prompt submission we actually witnessed
   * post-arm — closing the residual race where a superseded turn's Stop lands in
   * the shared spool just as `isArmed()` flips true. Off by default so the
   * jobId-scoped (single-turn) monitor keeps its simpler semantics.
   */
  requireArmedPromptSubmit?: boolean
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

function extractPrompt(payload: Record<string, unknown>): string | undefined {
  const direct = pickString(payload, ['prompt', 'message', 'user_prompt', 'userPrompt', 'input'])
  if (direct) return direct

  const nestedKeys = ['tool_input', 'toolInput', 'request', 'data']
  for (const key of nestedKeys) {
    const nested = asRecord(payload[key])
    const nestedPrompt = pickString(nested, ['prompt', 'message', 'input'])
    if (nestedPrompt) return nestedPrompt
  }

  return undefined
}

function extractToolName(payload: Record<string, unknown>): string | undefined {
  const direct = pickString(payload, ['tool_name', 'toolName', 'name'])
  if (direct) return direct
  const tool = asRecord(payload.tool)
  return pickString(tool, ['name', 'tool_name', 'toolName'])
}

function isToolFailure(eventName: string): boolean {
  return eventName === 'PostToolUseFailure' || eventName === 'PermissionDenied'
}

function toEvents(record: CliHookRecord): JobEvent[] {
  const payload = asRecord(record.payload)
  const eventName = record.hookEventName || pickString(payload, ['hook_event_name', 'hookEventName']) || 'unknown'
  const base = {
    providerId: record.providerId,
    jobId: record.jobId,
    requestId: record.requestId,
    hookEventName: eventName,
    sessionId: record.sessionId,
    turnId: record.turnId,
    cwd: record.cwd,
    timestamp: record.timestamp,
  }

  const events: JobEvent[] = [
    {
      type: 'cli_hook',
      ...base,
      payload: record.payload,
    },
  ]

  if (eventName === 'UserPromptSubmit') {
    events.push({
      type: 'cli_prompt_submitted',
      ...base,
      prompt: extractPrompt(payload),
    })
  }

  if (eventName === 'PostToolUse' || eventName === 'PostToolUseFailure') {
    events.push({
      type: 'cli_tool_completed',
      ...base,
      toolName: extractToolName(payload),
      failed: isToolFailure(eventName),
    })
  }

  if (eventName === 'Stop' || eventName === 'SubagentStop') {
    events.push({
      type: eventName === 'Stop' ? 'cli_turn_stop' : 'cli_subagent_stop',
      ...base,
      stopHookActive: payload.stop_hook_active,
      lastAssistantMessage: pickString(payload, ['last_assistant_message', 'lastAssistantMessage']),
    })
  }

  return events
}

export function startCliHookMonitor(options: CliHookMonitorOptions): CliHookMonitor {
  const spoolPath = getCliHookSpoolPath(options.conversationId)
  // Byte offset into the append-only spool. We read only the bytes appended
  // since the last poll (via a positioned read) rather than re-reading the whole
  // file each tick, so cost stays flat as the spool grows over a long session.
  let offset = 0
  // Bytes of the final, not-yet-newline-terminated line carried to the next
  // poll. Kept as a Buffer (not a string) so a multibyte UTF-8 sequence split
  // across a read boundary — e.g. a Korean prompt mid-flush — reassembles
  // intact instead of being decoded as two mojibake halves.
  let tail = Buffer.alloc(0)
  let stopped = false
  let sawStopHook = false
  // Whether an armed UserPromptSubmit has been seen (gates Stop completion when
  // requireArmedPromptSubmit is set).
  let sawArmedPrompt = false

  try {
    offset = existsSync(spoolPath) ? statSync(spoolPath).size : 0
  } catch {
    offset = 0
  }

  const readAppendedBytes = (size: number): Buffer | null => {
    const length = size - offset
    if (length <= 0) return null
    let fd: number | null = null
    try {
      fd = openSync(spoolPath, 'r')
      const buffer = Buffer.alloc(length)
      const bytesRead = readSync(fd, buffer, 0, length, offset)
      offset += bytesRead
      return buffer.subarray(0, bytesRead)
    } catch {
      return null
    } finally {
      if (fd !== null) {
        try { closeSync(fd) } catch { /* ignore */ }
      }
    }
  }

  const poll = () => {
    if (stopped || !existsSync(spoolPath)) return

    let size = 0
    try {
      size = statSync(spoolPath).size
    } catch {
      return
    }

    // Spool shrank — rotated or recreated. Reset and reread from the top.
    if (size < offset) {
      offset = 0
      tail = Buffer.alloc(0)
    }

    const chunk = readAppendedBytes(size)
    if (!chunk || chunk.length === 0) return

    const combined = tail.length > 0 ? Buffer.concat([tail, chunk]) : chunk
    const lines: string[] = []
    let lineStart = 0
    for (let i = 0; i < combined.length; i++) {
      if (combined[i] === 0x0a) {
        lines.push(combined.toString('utf-8', lineStart, i))
        lineStart = i + 1
      }
    }
    tail = lineStart < combined.length ? Buffer.from(combined.subarray(lineStart)) : Buffer.alloc(0)

    for (const line of lines) {
      const record = parseCliHookRecord(line)
      if (!record) continue
      if (options.jobId !== undefined && record.jobId !== options.jobId) continue
      const armed = options.isArmed ? options.isArmed() : true
      if (armed && record.hookEventName === 'UserPromptSubmit') {
        sawArmedPrompt = true
      }
      const isStop = record.hookEventName === 'Stop'
      const promptGateOpen = !options.requireArmedPromptSubmit || sawArmedPrompt
      const firstStop = isStop && armed && promptGateOpen && !sawStopHook
      if (firstStop) {
        sawStopHook = true
      }
      for (const event of toEvents(record)) {
        options.emit(event)
      }
      if (firstStop && options.onStop) {
        const payload = asRecord(record.payload)
        options.onStop(pickString(payload, ['last_assistant_message', 'lastAssistantMessage']))
      }
    }
  }

  const interval = setInterval(poll, 100)

  return {
    stop: () => {
      poll()
      stopped = true
      clearInterval(interval)
    },
    sawStop: () => sawStopHook,
  }
}
