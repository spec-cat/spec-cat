import { GEMINI_MODELS, type GeminiModel } from '~/types/gemini'
import type { AIProvider, AIProviderStreamCallbacks, AIProviderStreamController, AIProviderStreamOptions } from '~/server/utils/aiProvider'
import { registerProvider } from '~/server/utils/aiProviderRegistry'
import { spawn, type ChildProcess } from 'node:child_process'
import { getGeminiCliPath } from '~/server/utils/gemini'
import type { 
  UIStreamEvent, 
  UIStreamBlockDeltaEvent, 
  UIStreamBlockStartEvent, 
  UIStreamSessionInitEvent, 
  UIStreamTurnResultEvent 
} from '~/types/chat'

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
  id: 'gemini',
  name: 'Gemini CLI',
  description: 'Local Gemini CLI session via Google Gemini API.',
  models: GEMINI_MODELS.map((model) => ({
    key: model.value,
    label: model.label,
    description: model.description,
    default: model.default || false,
  })),
  capabilities: {
    streaming: true,
    permissions: true,
    resume: true,
    autoCommit: true,
    conflictResolution: true,
  },
} satisfies AIProvider['metadata']

// Track which sessions have already sent a block_start to ensure UI handles deltas correctly.
const startedSessions = new Set<string>()

const geminiProvider: AIProvider = {
  metadata,
  toCanonicalEvents(data) {
    const event = data as Record<string, unknown>
    const events: UIStreamEvent[] = []
    const sessionId = (event.session_id as string) || 'default-session'

    if (event.type === 'message' && event.role === 'assistant') {
      const blockId = 'gemini-text-block'
      
      // Ensure block_start is sent before any deltas for the UI to register the block.
      if (!startedSessions.has(sessionId)) {
        startedSessions.add(sessionId)
        events.push({
          type: 'block_start',
          sessionId,
          blockId,
          blockType: 'text',
          index: 0,
          text: '',
        } as UIStreamBlockStartEvent)
      }

      if (event.delta === true) {
        events.push({
          type: 'block_delta',
          sessionId,
          blockId,
          index: 0,
          text: event.content as string,
        } as UIStreamBlockDeltaEvent)
      } else if (event.content) {
        // If it's a full message (unlikely in streaming but for safety), append as delta.
        events.push({
          type: 'block_delta',
          sessionId,
          blockId,
          index: 0,
          text: event.content as string,
        } as UIStreamBlockDeltaEvent)
      }
    }

    if (event.type === 'init' || event.subtype === 'init') {
      const rawModel = (event.model as string) || ''
      const matched = GEMINI_MODELS.find(m => m.modelId === rawModel || m.value === rawModel)
      const modelLabel = matched ? matched.label : rawModel

      events.push({
        type: 'session_init',
        sessionId,
        model: modelLabel,
        tools: (event.tools as string[]) || [],
        permissionMode: '',
        cwd: '',
      } as UIStreamSessionInitEvent)
    }

    if (event.type === 'result') {
      // Clean up session state on completion
      startedSessions.delete(sessionId)
      
      const stats = event.stats as Record<string, number> | undefined
      events.push({
        type: 'turn_result',
        sessionId,
        subtype: (event.status as string) === 'success' ? 'success' : 'error',
        durationMs: stats?.duration_ms,
        usage: stats ? {
          inputTokens: stats.input_tokens || 0,
          outputTokens: stats.output_tokens || 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
        } : undefined,
      } as UIStreamTurnResultEvent)
    }

    if (event.type === 'error') {
      events.push({
        type: 'error',
        sessionId,
        error: (event.error as any)?.message || String(event.error),
      } as any)
    }

    return events
  },
  streamChat(opts: AIProviderStreamOptions, callbacks: AIProviderStreamCallbacks): AIProviderStreamController {
    const cliPath = getGeminiCliPath()
    const modelEntry = GEMINI_MODELS.find(m => m.value === opts.selection.modelKey) || GEMINI_MODELS[0]
    const modelId = modelEntry.modelId

    const args: string[] = [
      '--prompt', opts.message,
      '--output-format', 'stream-json',
    ]

    if (!modelId.startsWith('auto-') && modelId !== 'manual') {
      args.push('--model', modelId)
    }

    const mode = opts.permissionMode || 'ask'
    switch (mode) {
      case 'plan':
        args.push('--approval-mode', 'plan')
        break
      case 'auto':
        args.push('--approval-mode', 'yolo')
        break
      case 'bypass':
        args.push('--yolo')
        break
      case 'ask':
        args.push('--approval-mode', 'default')
        if (opts.approvedTools && opts.approvedTools.length > 0) {
          args.push('--allowed-tools', opts.approvedTools.join(','))
        }
        break
    }

    if (opts.resumeSessionId) {
      args.push('--resume', opts.resumeSessionId)
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
          const parsed = JSON.parse(cleaned)
          callbacks.onProviderJson(parsed)
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
    return GEMINI_MODELS.some((model) => model.value === modelKey)
  },
}

registerProvider(geminiProvider)
export default geminiProvider
