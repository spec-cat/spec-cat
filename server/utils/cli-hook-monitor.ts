/**
 * Tails a CLI hook spool file (see cli-hooks.ts) and translates appended
 * records into callbacks. One monitor runs per active terminal session and
 * lives across many turns, so unlike a single-turn monitor its Stop handling
 * is per-turn: each armed Stop fires `onStop` once, and with
 * `requireArmedPromptSubmit` every Stop must be preceded by its own armed
 * `UserPromptSubmit`.
 */
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'
import { parseCliHookRecord, type CliHookRecord } from './cli-hooks'

export type CliHookMonitor = {
  stop: () => void
  /** Whether any armed Stop has been observed since the monitor started. */
  sawStop: () => boolean
}

export type CliHookMonitorOptions = {
  /** Absolute path of the per-conversation spool file to tail. */
  spoolPath: string
  /** Poll interval in ms (default 100). Shorten in tests. */
  pollMs?: number
  /**
   * When provided, records only count while this returns true. Stops observed
   * while disarmed — e.g. from a superseded turn — never trigger onStop.
   * Defaults to always-armed.
   */
  isArmed?: () => boolean
  /**
   * When true, a Stop only fires `onStop` after an armed `UserPromptSubmit`
   * has been observed for the current turn. Every turn begins with that hook,
   * so this guarantees the Stop belongs to a turn whose prompt submission was
   * actually witnessed — closing the race where a stray Stop from an earlier
   * turn lands in the spool. The armed prompt is consumed by the Stop, so the
   * next Stop needs a fresh prompt submit.
   */
  requireArmedPromptSubmit?: boolean
  /** Checked every poll; when it returns true the monitor stops itself. */
  shouldDispose?: () => boolean
  onPromptSubmit?: (record: CliHookRecord) => void
  /** PostToolUse / PostToolUseFailure / SubagentStop — mid-turn progress. */
  onToolEvent?: (record: CliHookRecord, failed: boolean) => void
  onStop?: (record: CliHookRecord) => void
}

const DEFAULT_POLL_MS = 100

export function startCliHookMonitor(options: CliHookMonitorOptions): CliHookMonitor {
  const spoolPath = options.spoolPath
  // Byte offset into the append-only spool. Each poll reads only the bytes
  // appended since the last one (positioned read), so cost stays flat as the
  // spool grows over a long session. Start at the current end so records from
  // before the monitor existed (previous server run) are skipped.
  let offset = 0
  // Bytes of the final, not-yet-newline-terminated line carried to the next
  // poll. Kept as a Buffer (not a string) so a multibyte UTF-8 sequence split
  // across a read boundary — e.g. a Korean prompt mid-flush — reassembles
  // intact instead of decoding as two mojibake halves.
  let tail = Buffer.alloc(0)
  let stopped = false
  let sawStopHook = false
  // Whether an armed UserPromptSubmit has been seen for the current turn
  // (gates Stop delivery when requireArmedPromptSubmit is set).
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
        try { closeSync(fd) } catch {}
      }
    }
  }

  const handleRecord = (record: CliHookRecord) => {
    const eventName = record.hookEventName
    const armed = options.isArmed ? options.isArmed() : true

    if (eventName === 'UserPromptSubmit') {
      if (armed) sawArmedPrompt = true
      options.onPromptSubmit?.(record)
      return
    }

    if (eventName === 'PostToolUse' || eventName === 'PostToolUseFailure' || eventName === 'SubagentStop') {
      options.onToolEvent?.(record, eventName === 'PostToolUseFailure')
      return
    }

    if (eventName === 'Stop') {
      const promptGateOpen = !options.requireArmedPromptSubmit || sawArmedPrompt
      if (!armed || !promptGateOpen) return
      sawStopHook = true
      // Consume the prompt so the next Stop needs its own armed submit.
      sawArmedPrompt = false
      options.onStop?.(record)
    }
  }

  const poll = () => {
    if (stopped) return
    if (options.shouldDispose?.()) {
      stop()
      return
    }
    if (!existsSync(spoolPath)) return

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
      if (record) handleRecord(record)
    }
  }

  const interval = setInterval(poll, options.pollMs ?? DEFAULT_POLL_MS)
  interval.unref?.()

  const stop = () => {
    if (stopped) return
    stopped = true
    clearInterval(interval)
  }

  return {
    stop: () => {
      // Drain anything already flushed before shutting down.
      if (!stopped) poll()
      stop()
    },
    sawStop: () => sawStopHook
  }
}
