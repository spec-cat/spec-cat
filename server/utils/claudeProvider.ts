import { CLAUDE_MODELS } from '~/types/claude'
import type { AIProvider } from '~/server/utils/aiProvider'
import { registerProvider } from '~/server/utils/aiProviderRegistry'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { AIProviderStreamCallbacks, AIProviderStreamController, AIProviderStreamOptions } from '~/server/utils/aiProvider'
import { getClaudeCliPath } from '~/server/utils/claude'
import { getClaudeModelId } from '~/server/utils/claudeModel'
import { transformClaudeEvent } from '~/server/utils/uiAdapter'
import type { UIStreamBlockDeltaEvent, UIStreamBlockEndEvent, UIStreamBlockStartEvent } from '~/types/chat'

function killProc(proc: ChildProcess) {
  try {
    proc.kill('SIGTERM')
    const forceKillTimer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch {}
    }, 3000)
    proc.once('exit', () => clearTimeout(forceKillTimer))
  } catch {}
}

function extractAssistantText(event: Record<string, unknown>): string {
  const message = event.message
  if (!message || typeof message !== 'object' || Array.isArray(message)) return ''

  const content = (message as Record<string, unknown>).content
  if (!Array.isArray(content)) return ''

  const chunks: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const record = block as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string') {
      chunks.push(record.text)
    }
  }
  return chunks.join('')
}

function hasStreamTextDelta(event: Record<string, unknown>): boolean {
  if (event.type !== 'stream_event' || !event.event || typeof event.event !== 'object') {
    return false
  }
  const streamEvent = event.event as Record<string, unknown>
  if (streamEvent.type !== 'content_block_delta' || !streamEvent.delta || typeof streamEvent.delta !== 'object') {
    return false
  }
  const delta = streamEvent.delta as Record<string, unknown>
  return typeof delta.text === 'string' && delta.text.length > 0
}

function extractSessionId(event: Record<string, unknown>): string | undefined {
  const value = event.session_id || event.sessionId
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const metadata = {
  id: 'claude',
  name: 'Claude Code CLI',
  description: 'Local Claude CLI session (Fable/Sonnet/Opus/Haiku) via @anthropic-ai/claude-code.',
  models: CLAUDE_MODELS.map((model) => ({
    key: model.value,
    label: model.label,
    description: model.description,
    default: model.value === 'sonnet',
  })),
  capabilities: {
    streaming: true,
    permissions: true,
    resume: true,
    autoCommit: true,
    conflictResolution: true,
  },
} satisfies AIProvider['metadata']

export function buildClaudeExecArgs(opts: AIProviderStreamOptions, modelId: string): string[] {
  const args: string[] = [
    '-p', opts.message,
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model', modelId,
  ]

  const mode = opts.permissionMode || 'ask'
  switch (mode) {
    case 'plan':
      // Newer/alternate Claude CLI builds may not support `--plan`.
      // Keep plan mode compatible by using ask-mode permissions without a fragile CLI flag.
      if (opts.approvedTools && opts.approvedTools.length > 0) {
        args.push('--allowedTools', opts.approvedTools.join(','))
      }
      break
    case 'auto':
      args.push('--allowedTools', 'Read,Glob,Grep,Edit,Write,Bash,WebFetch,WebSearch')
      break
    case 'bypass':
      args.push('--dangerously-skip-permissions')
      break
    case 'ask':
      if (opts.approvedTools && opts.approvedTools.length > 0) {
        args.push('--allowedTools', opts.approvedTools.join(','))
      }
      break
  }

  if (opts.resumeSessionId) {
    args.push('--resume', opts.resumeSessionId)
  }

  if (opts.systemPrompt) {
    args.push('--append-system-prompt', opts.systemPrompt)
  }

  return args
}

const claudeProvider: AIProvider = {
  metadata,
  toCanonicalEvents(data) {
    return transformClaudeEvent(data as Record<string, unknown>)
  },
  streamChat(opts: AIProviderStreamOptions, callbacks: AIProviderStreamCallbacks): AIProviderStreamController {
    const cliPath = getClaudeCliPath()
    const modelId = getClaudeModelId(opts.selection.modelKey)
    const args = buildClaudeExecArgs(opts, modelId)

    const proc = spawn(cliPath, args, {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        NO_COLOR: '1',
      },
    })
    proc.stdin?.end()

    let lineBuffer = ''
    const nonJsonOutput: string[] = []
    let sawStreamTextDelta = false
    let assistantSnapshotBlockId: string | null = null
    let assistantSnapshotText = ''

    const closeAssistantSnapshotBlock = (sessionId?: string) => {
      if (!assistantSnapshotBlockId) return
      callbacks.onProviderJson({
        type: 'block_end',
        sessionId,
        blockId: assistantSnapshotBlockId,
      } satisfies UIStreamBlockEndEvent)
      assistantSnapshotBlockId = null
      assistantSnapshotText = ''
    }

    const handleProviderJson = (parsed: Record<string, unknown>) => {
      if (hasStreamTextDelta(parsed)) {
        sawStreamTextDelta = true
      }

      if (parsed.type === 'assistant') {
        const text = extractAssistantText(parsed)
        if (!text || sawStreamTextDelta) {
          return
        }

        const sessionId = extractSessionId(parsed)
        if (!assistantSnapshotBlockId) {
          assistantSnapshotBlockId = `blk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
          callbacks.onProviderJson({
            type: 'block_start',
            sessionId,
            blockId: assistantSnapshotBlockId,
            blockType: 'text',
            text: '',
          } satisfies UIStreamBlockStartEvent)
        }

        const delta = text.startsWith(assistantSnapshotText)
          ? text.slice(assistantSnapshotText.length)
          : text
        assistantSnapshotText = text

        if (delta) {
          callbacks.onProviderJson({
            type: 'block_delta',
            sessionId,
            blockId: assistantSnapshotBlockId,
            text: delta,
          } satisfies UIStreamBlockDeltaEvent)
        }
        return
      }

      if (parsed.type === 'result') {
        closeAssistantSnapshotBlock(extractSessionId(parsed))
      }

      callbacks.onProviderJson(parsed)
    }

    proc.stdout?.on('data', (data: Buffer) => {
      lineBuffer += data.toString()
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() || ''

      for (const line of lines) {
        const cleaned = line.trim()
        if (!cleaned) continue
        try {
          handleProviderJson(JSON.parse(cleaned) as Record<string, unknown>)
        } catch {
          nonJsonOutput.push(cleaned)
        }
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim()
      if (text) {
        nonJsonOutput.push(text)
      }
    })

    proc.on('close', (exitCode, signal) => {
      if (lineBuffer.trim()) {
        try {
          handleProviderJson(JSON.parse(lineBuffer.trim()) as Record<string, unknown>)
        } catch {
          nonJsonOutput.push(lineBuffer.trim())
        }
      }
      closeAssistantSnapshotBlock()
      callbacks.onClose({ exitCode, signal, nonJsonOutput })
    })

    proc.on('error', (error) => {
      callbacks.onError(error)
    })

    return {
      kill: () => killProc(proc),
    }
  },
  isModelSupported(modelKey: string) {
    return CLAUDE_MODELS.some((model) => model.value === modelKey)
  },
}

registerProvider(claudeProvider)
export default claudeProvider
