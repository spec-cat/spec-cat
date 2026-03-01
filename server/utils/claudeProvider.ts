import { CLAUDE_MODELS } from '~/types/claude'
import type { AIProvider } from '~/server/utils/aiProvider'
import { registerProvider } from '~/server/utils/aiProviderRegistry'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { AIProviderStreamCallbacks, AIProviderStreamController, AIProviderStreamOptions } from '~/server/utils/aiProvider'
import { getClaudeCliPath } from '~/server/utils/claude'
import { getClaudeModelId } from '~/server/utils/claudeModel'
import { transformClaudeEvent } from '~/server/utils/uiAdapter'

function killProc(proc: ChildProcess) {
  try {
    proc.kill('SIGTERM')
    const forceKillTimer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch {}
    }, 3000)
    proc.once('exit', () => clearTimeout(forceKillTimer))
  } catch {}
}

const metadata = {
  id: 'claude',
  name: 'Claude Code CLI',
  description: 'Local Claude CLI session (Sonnet/Opus/Haiku) via @anthropic-ai/claude-code.',
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

const claudeProvider: AIProvider = {
  metadata,
  toCanonicalEvents(data) {
    return transformClaudeEvent(data as Record<string, unknown>)
  },
  streamChat(opts: AIProviderStreamOptions, callbacks: AIProviderStreamCallbacks): AIProviderStreamController {
    const cliPath = getClaudeCliPath()
    const modelId = getClaudeModelId(opts.selection.modelKey)

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
        args.push('--plan')
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

    proc.stdout?.on('data', (data: Buffer) => {
      lineBuffer += data.toString()
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() || ''

      for (const line of lines) {
        const cleaned = line.trim()
        if (!cleaned) continue
        try {
          callbacks.onProviderJson(JSON.parse(cleaned))
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
          callbacks.onProviderJson(JSON.parse(lineBuffer.trim()))
        } catch {
          nonJsonOutput.push(lineBuffer.trim())
        }
      }
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
