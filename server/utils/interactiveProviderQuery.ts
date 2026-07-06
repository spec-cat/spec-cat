/**
 * Interactive provider query.
 *
 * Spawns the provider's *interactive* CLI inside a PTY (the same mechanism the
 * embedded chat terminal uses), injects a single prompt, scrapes the delimited
 * response out of the terminal output, then disposes the session. This lets us
 * get an AI-generated answer through whichever provider the user selected.
 *
 * The response is bounded by markers the model is asked to print. The marker
 * text is *described* in the prompt (never written literally) so the terminal's
 * echo of the injected prompt cannot collide with the model's real output.
 */

import { stripTerminalControlSequences } from '~/utils/terminalText'
import { normalizeScrapedTerminalText, stripTuiChrome } from './interactiveProviderText'
import { logger } from './logger'
import { readProviderSessionMarkedText } from './providerSessionTranscript'
import {
  getOrCreateTerminalSession,
  subscribeTerminalSession,
  writeTerminalInput,
  disposeTerminalSession,
} from './terminalSessions'

const START = '===BEGIN==='
const END = '===FINISH==='

// Describe (do not spell out) the markers so the literal tokens only ever appear
// in the model's output, never in the echoed prompt.
const MARKER_INSTRUCTION =
  ' When finished, on its own line print exactly three equals signs immediately' +
  ' followed by the word BEGIN immediately followed by three equals signs, then' +
  ' on the following line(s) print the requested output, then on a final line' +
  ' print exactly three equals signs immediately followed by the word FINISH' +
  ' immediately followed by three equals signs. Print nothing after that line.'

// Wait for the TUI to settle before typing: inject once output has been idle for
// READY_IDLE_MS, or force injection after READY_MAX_MS regardless.
const READY_IDLE_MS = 1500
const READY_MAX_MS = 20_000
// After the prompt text is injected, the Enter keystroke is sent *separately*
// once the composer's echo settles (SUBMIT_IDLE_MS idle) or after SUBMIT_MAX_MS
// regardless. Bundling Enter into the same write as a long prompt lets the TUI
// swallow it mid-render, leaving the text in the composer un-submitted.
const SUBMIT_IDLE_MS = 600
const SUBMIT_MAX_MS = 4000
// A single Enter can be swallowed when it lands mid-render of a collapsed paste
// chip (long prompts), leaving the prompt un-submitted and the query hanging
// until RESPONSE_MAX_MS. Re-send Enter while output stays idle after submit — on
// an already-submitted (empty) composer an extra Enter is a harmless no-op, so
// retrying is safe whether the first one landed or not.
const SUBMIT_RETRY_IDLE_MS = 1500
const SUBMIT_RETRY_MS = 2000
const MAX_SUBMIT_ATTEMPTS = 4
const RESPONSE_MAX_MS = 90_000
const POLL_MS = 250
const TRANSCRIPT_GRACE_MS = 5000

export interface InteractiveProviderQueryOptions {
  conversationId: string
  cwd: string
  providerId: string
  modelKey: string
  /** Task prompt WITHOUT any literal marker tokens. */
  prompt: string
  abortSignal?: AbortSignal
  /**
   * Explicit terminal session id so a client can live-stream this PTY (via the
   * terminal-ws `attach` flow). When omitted a random ephemeral id is used.
   */
  previewSessionId?: string
  /**
   * Wrap the injected prompt in bracketed-paste markers so embedded newlines are
   * pasted as literal content instead of submitting the composer line-by-line.
   * Required for multi-line prompts (e.g. code blocks).
   */
  bracketedPaste?: boolean
  /**
   * When true (default) the scraped region is passed through stripTuiChrome to
   * remove composer/footer/banner redraws. Set false when the output is code or
   * other text where those patterns can legitimately occur — only ANSI control
   * sequences are stripped in that case.
   */
  cleanChrome?: boolean
}

export interface InteractiveProviderQueryResult {
  success: boolean
  text?: string
  error?: string
}

/**
 * Run a one-shot prompt through the provider's interactive PTY session.
 */
export async function queryInteractiveProvider(
  opts: InteractiveProviderQueryOptions,
): Promise<InteractiveProviderQueryResult> {
  if (opts.providerId !== 'claude' && opts.providerId !== 'codex') {
    return { success: false, error: `Interactive query is not supported for provider "${opts.providerId}"` }
  }

  const sessionId =
    opts.previewSessionId
    || `commitgen:${opts.conversationId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  let session
  let providerSessionId = ''
  try {
    session = getOrCreateTerminalSession({
      sessionId,
      cwd: opts.cwd,
      providerId: opts.providerId,
      modelKey: opts.modelKey,
      onProviderSessionId: id => { providerSessionId = id },
    })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }

  return await new Promise<InteractiveProviderQueryResult>((resolve) => {
    let injected = false
    let submitted = false
    let injectedAt = 0
    let firstDataAt = 0
    let lastDataAt = Date.now()
    let settled = false
    let lastSubmitAt = 0
    let submitAttempts = 0
    let finishSeenAt = 0
    const startedAt = Date.now()

    const extract = (): string | null => {
      // Cheap guard before the (potentially large) strip+search.
      if (!session.buffer.includes('FINISH')) return null
      const now = Date.now()
      if (!finishSeenAt) finishSeenAt = now
      const transcriptText = readProviderSessionMarkedText({
        providerId: opts.providerId,
        cwd: opts.cwd,
        providerSessionId,
        startMarker: START,
        endMarker: END,
      })
      if (transcriptText) return transcriptText
      if ((opts.providerId === 'claude' || opts.providerId === 'codex') && now - finishSeenAt < TRANSCRIPT_GRACE_MS) {
        return null
      }
      const clean = normalizeScrapedTerminalText(stripTerminalControlSequences(session.buffer))
      const startIdx = clean.lastIndexOf(START)
      if (startIdx === -1) return null
      const endIdx = clean.indexOf(END, startIdx + START.length)
      if (endIdx === -1) return null
      const region = clean.slice(startIdx + START.length, endIdx)
      const text = opts.cleanChrome === false ? normalizeScrapedTerminalText(region).trim() : stripTuiChrome(region)
      return text.length > 0 ? text : null
    }

    const finish = (result: InteractiveProviderQueryResult) => {
      if (settled) return
      settled = true
      clearInterval(timer)
      unsubscribe()
      opts.abortSignal?.removeEventListener('abort', onAbort)
      disposeTerminalSession(sessionId)
      resolve(result)
    }

    const onAbort = () => finish({ success: false, error: 'Aborted' })

    const unsubscribe = subscribeTerminalSession(session, {
      onData: () => {
        const now = Date.now()
        if (!firstDataAt) firstDataAt = now
        lastDataAt = now
        if (injected) {
          const text = extract()
          if (text) finish({ success: true, text })
        }
      },
      onExit: (code) => {
        const text = extract()
        if (text) finish({ success: true, text })
        else finish({ success: false, error: `Provider terminal exited (code ${code}) before producing a message` })
      },
    })

    if (opts.abortSignal) {
      if (opts.abortSignal.aborted) {
        onAbort()
        return
      }
      opts.abortSignal.addEventListener('abort', onAbort)
    }

    const timer = setInterval(() => {
      const now = Date.now()

      if (!injected) {
        const idleReady = firstDataAt > 0 && now - lastDataAt >= READY_IDLE_MS
        const forced = now - startedAt >= READY_MAX_MS
        if (idleReady || forced) {
          injected = true
          injectedAt = now
          // Reset the idle clock so SUBMIT_IDLE_MS is measured from injection,
          // not from a stale pre-injection idle gap (which would submit Enter
          // before the composer even echoes the typed prompt).
          lastDataAt = now
          // Type the prompt only — Enter is sent separately below. Multi-line
          // prompts are bracketed-pasted so newlines don't submit prematurely.
          const payload = opts.prompt + MARKER_INSTRUCTION
          const ok = writeTerminalInput(
            sessionId,
            opts.bracketedPaste ? `[200~${payload}[201~` : payload,
          )
          if (!ok) {
            finish({ success: false, error: 'Failed to write to provider terminal' })
          }
        }
        return
      }

      if (!submitted) {
        // Submit once the composer has echoed the typed prompt and gone quiet,
        // or after a hard cap so a perpetually-animating TUI still submits.
        const echoSettled = now - lastDataAt >= SUBMIT_IDLE_MS
        const submitForced = now - injectedAt >= SUBMIT_MAX_MS
        if (echoSettled || submitForced) {
          submitted = true
          lastSubmitAt = now
          submitAttempts = 1
          const ok = writeTerminalInput(sessionId, '\r')
          if (!ok) {
            finish({ success: false, error: 'Failed to submit prompt to provider terminal' })
          }
        }
        return
      }

      // Guard against a swallowed Enter (common on collapsed paste chips): while
      // no response output is flowing and we're under the attempt cap, re-send
      // Enter. Once the model starts streaming, onData keeps lastDataAt fresh so
      // the idle condition fails and retries stop on their own.
      const text = extract()
      if (text) {
        finish({ success: true, text })
        return
      }
      if (finishSeenAt && now - finishSeenAt < TRANSCRIPT_GRACE_MS) {
        return
      }

      if (submitAttempts < MAX_SUBMIT_ATTEMPTS
        && now - lastDataAt >= SUBMIT_RETRY_IDLE_MS
        && now - lastSubmitAt >= SUBMIT_RETRY_MS) {
        submitAttempts++
        lastSubmitAt = now
        writeTerminalInput(sessionId, '\r')
      }

      if (now - startedAt >= RESPONSE_MAX_MS) {
        logger.chat.warn('Interactive provider query timed out', { providerId: opts.providerId })
        finish({ success: false, error: 'Timed out waiting for provider response' })
      }
    }, POLL_MS)
  })
}
