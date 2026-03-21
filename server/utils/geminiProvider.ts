import { GEMINI_MODELS, type GeminiModel } from '~/types/gemini'
import type { AIProvider, AIProviderStreamCallbacks, AIProviderStreamController, AIProviderStreamOptions } from '~/server/utils/aiProvider'
import { registerProvider } from '~/server/utils/aiProviderRegistry'
import { spawn, type ChildProcess } from 'node:child_process'
import { getGeminiCliPath } from '~/server/utils/gemini'
import type {
  UIStreamEvent,
  UIStreamBlockDeltaEvent,
  UIStreamBlockStartEvent,
  UIStreamBlockEndEvent,
  UIStreamSessionInitEvent,
  UIStreamToolResultEvent,
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

// Track per-session state: whether a text block is open, current text block id, and the next block index.
const sessionState = new Map<string, { textOpen: boolean; textBlockId: string; nextIndex: number }>()

// Remember the real session ID from the init event so subsequent events (which lack session_id) can reuse it.
let lastKnownSessionId: string | null = null

const geminiProvider: AIProvider = {
  metadata,
  toCanonicalEvents(data) {
    const event = data as Record<string, unknown>
    const events: UIStreamEvent[] = []

    // Use session_id from the event if present, otherwise fall back to the last known one.
    const rawSessionId = event.session_id as string | undefined
    if (rawSessionId) {
      lastKnownSessionId = rawSessionId
    }
    const sessionId = lastKnownSessionId || ''
    const getErrorText = (): string => {
      const direct = event.error
      if (typeof direct === 'string' && direct.trim()) {
        return direct.trim()
      }
      if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
        const msg = (direct as Record<string, unknown>).message
        if (typeof msg === 'string' && msg.trim()) {
          return msg.trim()
        }
      }

      const msg = event.message
      if (typeof msg === 'string' && msg.trim()) {
        return msg.trim()
      }

      const result = event.result
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        const resultObj = result as Record<string, unknown>
        const nestedError = resultObj.error
        if (typeof nestedError === 'string' && nestedError.trim()) {
          return nestedError.trim()
        }
        if (nestedError && typeof nestedError === 'object' && !Array.isArray(nestedError)) {
          const nestedMsg = (nestedError as Record<string, unknown>).message
          if (typeof nestedMsg === 'string' && nestedMsg.trim()) {
            return nestedMsg.trim()
          }
        }
        const nestedMsg = resultObj.message
        if (typeof nestedMsg === 'string' && nestedMsg.trim()) {
          return nestedMsg.trim()
        }
      }

      return ''
    }

    // Helper: get or create per-session state
    if (!sessionState.has(sessionId)) {
      sessionState.set(sessionId, { textOpen: false, textBlockId: '', nextIndex: 0 })
    }
    const state = sessionState.get(sessionId)!

    // Helper: close an open text block
    const closeTextBlock = () => {
      if (!state.textOpen) return
      state.textOpen = false
      events.push({
        type: 'block_end',
        sessionId,
        blockId: state.textBlockId,
      } as UIStreamBlockEndEvent)
    }

    // Helper: ensure a text block is open (create a new one after tool use)
    const ensureTextBlock = () => {
      if (state.textOpen) return
      state.textOpen = true
      const idx = state.nextIndex++
      state.textBlockId = `gemini-text-${sessionId}-${idx}`
      events.push({
        type: 'block_start',
        sessionId,
        blockId: state.textBlockId,
        blockType: 'text',
        index: idx,
        text: '',
      } as UIStreamBlockStartEvent)
    }

    if (event.type === 'message' && event.role === 'assistant') {
      ensureTextBlock()

      const text = event.content as string
      if (text) {
        events.push({
          type: 'block_delta',
          sessionId,
          blockId: state.textBlockId,
          text,
        } as UIStreamBlockDeltaEvent)
      }
    }

    // Gemini tool invocation: { type: "tool_use", tool_name, tool_id, parameters }
    if (event.type === 'tool_use') {
      const toolId = (event.tool_id as string) || `gemini-tool-${Date.now()}`
      const toolName = (event.tool_name as string) || 'unknown'
      const params = (event.parameters && typeof event.parameters === 'object')
        ? event.parameters as Record<string, unknown>
        : {}

      // Close any open text block before tool block
      closeTextBlock()

      const toolIndex = state.nextIndex++
      events.push({
        type: 'block_start',
        sessionId,
        blockId: toolId,
        blockType: 'tool_use',
        name: toolName,
        toolUseId: toolId,
        index: toolIndex,
      } as UIStreamBlockStartEvent)

      // Send the full input as a single partial_json delta so the UI can parse it
      if (Object.keys(params).length > 0) {
        events.push({
          type: 'block_delta',
          sessionId,
          blockId: toolId,
          index: toolIndex,
          partialJson: JSON.stringify(params),
        } as UIStreamBlockDeltaEvent)
      }

      events.push({
        type: 'block_end',
        sessionId,
        blockId: toolId,
        index: toolIndex,
      } as UIStreamBlockEndEvent)
    }

    // Gemini tool result: { type: "tool_result", tool_id, status, output?, error? }
    if (event.type === 'tool_result') {
      const toolId = (event.tool_id as string) || ''
      const isError = (event.status as string) !== 'success'
      let content = ''
      if (typeof event.output === 'string') {
        content = event.output
      }
      if (isError && event.error && typeof event.error === 'object') {
        const errMsg = (event.error as Record<string, unknown>).message
        if (typeof errMsg === 'string') {
          content = content ? `${content}\n${errMsg}` : errMsg
        }
      }

      events.push({
        type: 'tool_result',
        sessionId,
        toolUseId: toolId,
        content,
        isError,
      } as UIStreamToolResultEvent)
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
      // Close any open text block and clean up session state
      closeTextBlock()
      sessionState.delete(sessionId)
      
      const status = (event.status as string) || ''
      const isError = status !== 'success'
      const stats = event.stats as Record<string, number> | undefined
      events.push({
        type: 'turn_result',
        sessionId,
        subtype: isError ? 'error' : 'success',
        durationMs: stats?.duration_ms,
        usage: stats ? {
          inputTokens: stats.input_tokens || 0,
          outputTokens: stats.output_tokens || 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
        } : undefined,
      } as UIStreamTurnResultEvent)

      if (isError) {
        events.push({
          type: 'error',
          sessionId,
          error: getErrorText() || 'Provider reported an execution error.',
        } as any)
      }
    }

    if (event.type === 'error') {
      events.push({
        type: 'error',
        sessionId,
        error: getErrorText() || 'Provider reported an execution error.',
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
