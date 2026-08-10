/**
 * Submits a prompt turn into a provider CLI running in a tmux session.
 *
 * The prompt is delivered as a tmux paste buffer (`load-buffer` +
 * `paste-buffer -p`) rather than typed with `send-keys -l`:
 *
 * - `send-keys -l` pushes the whole payload into the pane's input queue at
 *   once. Codex drains that queue slowly, so a large prompt stops arriving
 *   partway (~7 KB in practice) and the rest only trickles in when another key
 *   is sent — the CLI is left holding a truncated prompt and the Enter that
 *   should submit it never reaches the front of the queue. The commit-message
 *   query, which sends a 12 KB diff, is the visible symptom: Codex sits there
 *   forever and no message is ever produced.
 * - `paste-buffer -p` wraps the text in a bracketed paste, which both CLIs
 *   consume in one shot (Codex collapses it into a "[Pasted Content N chars]"
 *   chip) and which keeps embedded newlines as newlines instead of a burst of
 *   Enters that would submit the prompt line by line.
 *
 * The buffer content can never be parsed as a tmux key name or flag either, so
 * this keeps the injection safety `send-keys -l --` provided. A separate
 * `Enter` submits the turn.
 */
import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Resolved per call so tests can point the helpers at a stub binary. */
function tmuxBin(): string {
  return process.env.TMUX_BIN || 'tmux'
}

/**
 * Pause between delivering the prompt and pressing Enter. Codex's input widget
 * drops an Enter that arrives in the same render frame as the paste: the prompt
 * is left sitting unsubmitted in the input box, the turn never runs, and any
 * waiter times out. This settle lets the paste land before Enter submits it.
 * Claude tolerates an immediate Enter, but the pause is harmless for it too.
 */
const SUBMIT_SETTLE_MS = 500

/** Delivers `prompt` into `tmuxName` and submits it as a turn. */
export async function submitPromptTurn(tmuxName: string, prompt: string): Promise<void> {
  await deliverPrompt(tmuxName, prompt)
  await settle(SUBMIT_SETTLE_MS)
  await execFileAsync(tmuxBin(), ['send-keys', '-t', tmuxName, 'Enter'])
}

/**
 * Pastes `prompt` into the session's input box. Falls back to literal typing
 * when the paste buffer cannot be created, so a tmux that rejects the buffer
 * still submits short prompts instead of failing outright.
 */
async function deliverPrompt(tmuxName: string, prompt: string): Promise<void> {
  const bufferName = `code-cat-prompt-${randomBytes(6).toString('hex')}`
  try {
    await loadTmuxBuffer(bufferName, prompt)
  } catch {
    await execFileAsync(tmuxBin(), ['send-keys', '-t', tmuxName, '-l', '--', prompt])
    return
  }

  try {
    // -d drops the buffer once pasted; -p brackets it so the CLI treats the
    // payload as a paste and not as typed keys.
    await execFileAsync(tmuxBin(), ['paste-buffer', '-d', '-p', '-b', bufferName, '-t', tmuxName])
  } catch (error) {
    await execFileAsync(tmuxBin(), ['delete-buffer', '-b', bufferName]).catch(() => {})
    throw error
  }
}

/** Writes `text` into the named tmux paste buffer via `load-buffer -`. */
function loadTmuxBuffer(bufferName: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(tmuxBin(), ['load-buffer', '-b', bufferName, '-'])
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tmux load-buffer failed (${code}): ${stderr.trim()}`))
    })
    // A dead tmux closes the pipe; the close handler reports the failure.
    child.stdin?.on('error', () => {})
    child.stdin?.end(text)
  })
}

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
}
