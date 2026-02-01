/**
 * Claude CLI path detection utilities
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync, spawn } from 'node:child_process'
import { getConfiguredClaudeModelId } from './claudeModel'

/**
 * Detect the Claude Code CLI path
 * Tries system installation first, then falls back to node_modules
 */
export function detectClaudeCli(): string | null {
  // 1. First try system-installed claude binary (most reliable for user installations)
  const systemPaths = [
    // User local bin (common for npm/pnpm global installs)
    join(process.env.HOME || '', '.local/bin/claude'),
    // Standard unix paths
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ]

  for (const path of systemPaths) {
    if (existsSync(path)) {
      // Use the path directly (don't follow symlinks - let the OS handle it)
      console.log(`[Claude CLI] Found system installation: ${path}`)
      return path
    }
  }

  // 2. Try 'which claude' to find in PATH
  try {
    const whichResult = execSync('which claude 2>/dev/null', { encoding: 'utf-8' }).trim()
    if (whichResult && existsSync(whichResult)) {
      console.log(`[Claude CLI] Found via which: ${whichResult}`)
      return whichResult
    }
  } catch {
    // which command failed, continue to other methods
  }

  return null
}

// Cache the CLI path
let cachedCliPath: string | null = null

/**
 * Get the Claude CLI path (cached)
 */
export function getClaudeCliPath(): string {
  if (cachedCliPath === null) {
    cachedCliPath = detectClaudeCli()
  }

  if (!cachedCliPath) {
    throw new Error(
      'Claude Code CLI not found. Please install Claude Code CLI globally.'
    )
  }

  return cachedCliPath
}

export interface ClaudeCliRunOptions {
  cwd: string
  prompt: string
  modelId?: string
  resumeSessionId?: string
  includePartial?: boolean
  abortSignal?: AbortSignal
  onMessage?: (message: Record<string, unknown>) => void
}

export interface ClaudeCliRunResult {
  success: boolean
  text?: string
  sessionId?: string
  error?: string
}

/**
 * Run Claude CLI with stream-json output and parse responses.
 */
export async function runClaudeCliStream(options: ClaudeCliRunOptions): Promise<ClaudeCliRunResult> {
  const cliPath = getClaudeCliPath()
  const modelId = options.modelId || await getConfiguredClaudeModelId()

  const args: string[] = [
    '-p', options.prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
  ]

  args.push('--model', modelId)

  if (options.includePartial) {
    args.push('--include-partial-messages')
  }

  if (options.resumeSessionId) {
    args.push('--resume', options.resumeSessionId)
  }

  const proc = spawn(cliPath, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  proc.stdin.end()

  let lineBuffer = ''
  let resultText = ''
  let sessionId: string | undefined

  const handleMessage = (msg: Record<string, unknown>) => {
    if (options.onMessage) {
      options.onMessage(msg)
    }

    if ('session_id' in msg && typeof msg.session_id === 'string') {
      sessionId = msg.session_id
    }

    if (msg.type === 'assistant' && typeof msg.message === 'object' && msg.message) {
      const message = msg.message as { content?: Array<{ type: string; text?: string }> }
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'text' && block.text) {
            resultText += block.text
          }
        }
      }
    }
  }

  const parseLine = (line: string) => {
    if (!line.trim()) return
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>
      handleMessage(parsed)
    } catch {
      // ignore malformed lines
    }
  }

  proc.stdout.on('data', (chunk: Buffer) => {
    lineBuffer += chunk.toString()
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() || ''
    for (const line of lines) {
      parseLine(line)
    }
  })

  const errorChunks: string[] = []
  proc.stderr.on('data', (chunk: Buffer) => {
    errorChunks.push(chunk.toString())
  })

  if (options.abortSignal) {
    if (options.abortSignal.aborted) {
      proc.kill('SIGTERM')
    } else {
      options.abortSignal.addEventListener('abort', () => {
        proc.kill('SIGTERM')
      })
    }
  }

  return await new Promise((resolve) => {
    proc.on('close', (code) => {
      if (lineBuffer.trim()) {
        parseLine(lineBuffer)
      }

      if (code === 0) {
        resolve({ success: true, text: resultText, sessionId })
        return
      }

      const stderr = errorChunks.join('').trim()
      const parts = [`Claude CLI exited with code ${code}`]
      if (stderr) {
        parts.push(`stderr: ${stderr}`)
      }
      const errorText = parts.join('\n')
      resolve({ success: false, error: errorText, text: resultText, sessionId })
    })
  })
}
