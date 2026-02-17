import type { AIProvider } from '~/server/utils/aiProvider'
import { registerProvider } from '~/server/utils/aiProviderRegistry'
import type { AIProviderStreamCallbacks, AIProviderStreamController, AIProviderStreamOptions } from '~/server/utils/aiProvider'
import { processCodexJsonLine } from '~/server/utils/codexStreamParser'
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { execSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function detectCodexCli(): string | null {
  if (typeof process.env.CODEX_CLI_PATH === 'string' && process.env.CODEX_CLI_PATH.length > 0 && existsSync(process.env.CODEX_CLI_PATH)) {
    return process.env.CODEX_CLI_PATH
  }

  const systemPaths = [
    join(process.env.HOME || '', '.local/bin/codex'),
    '/usr/local/bin/codex',
    '/usr/bin/codex',
  ]

  for (const candidate of systemPaths) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  try {
    const whichResult = execSync('which codex 2>/dev/null', { encoding: 'utf-8' }).trim()
    if (whichResult && existsSync(whichResult)) {
      return whichResult
    }
  } catch {
    // ignore
  }

  return null
}

let cachedCodexCliPath: string | null | undefined
function getCodexCliPath(): string {
  if (cachedCodexCliPath === undefined) {
    cachedCodexCliPath = detectCodexCli()
  }

  if (!cachedCodexCliPath) {
    throw new Error('Codex CLI not found. Install codex CLI or set CODEX_CLI_PATH.')
  }
  return cachedCodexCliPath
}

function isCodexAvailable(): boolean {
  try {
    getCodexCliPath()
    return true
  } catch {
    return false
  }
}

function killProc(proc: ChildProcess) {
  try {
    proc.kill('SIGTERM')
    const forceKillTimer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch {}
    }, 3000)
    proc.once('exit', () => clearTimeout(forceKillTimer))
  } catch {}
}

function resolveCodexHomeForSpawn(ephemeral: boolean): string | null {
  // For ephemeral retries, isolate state in a fresh temp home so corrupted
  // rollout/session records in ~/.codex cannot poison the retry attempt.
  if (ephemeral) {
    try {
      return mkdtempSync(join(tmpdir(), 'spec-cat-codex-home-'))
    } catch {
      // Fall back to shared temp path if mkdtemp fails.
      const fallbackEphemeralHome = '/tmp/spec-cat-codex-home'
      try {
        mkdirSync(fallbackEphemeralHome, { recursive: true })
        return fallbackEphemeralHome
      } catch {
        return null
      }
    }
  }

  if (typeof process.env.CODEX_HOME === 'string' && process.env.CODEX_HOME.length > 0) {
    return process.env.CODEX_HOME
  }

  const homeDir = process.env.HOME || ''
  const defaultCodexHome = join(homeDir, '.codex')
  const codexArg0Tmp = join(defaultCodexHome, 'tmp', 'arg0')

  try {
    if (existsSync(defaultCodexHome)) {
      accessSync(defaultCodexHome, constants.W_OK)
      // Some environments have partially unwritable ~/.codex (e.g. tmp/arg0).
      // If this path is not writable, Codex can run but fail to persist/resume reliably.
      if (existsSync(codexArg0Tmp)) {
        accessSync(codexArg0Tmp, constants.W_OK)
      } else {
        mkdirSync(codexArg0Tmp, { recursive: true })
        accessSync(codexArg0Tmp, constants.W_OK)
      }
      return null
    }

    if (homeDir) {
      accessSync(homeDir, constants.W_OK)
      return null
    }
  } catch {
    // Fall through to a writable fallback.
  }

  const fallbackCodexHome = '/tmp/spec-cat-codex-home'
  try {
    mkdirSync(fallbackCodexHome, { recursive: true })
    return fallbackCodexHome
  } catch {
    return null
  }
}

const metadata = {
  id: 'codex',
  name: 'OpenAI Codex CLI',
  description: 'Codex provider metadata and model defaults for capability-gated selection.',
  models: [
    {
      key: 'gpt-5.3-codex',
      label: 'gpt-5.3-codex (current)',
      description: 'Latest frontier agentic coding model.',
      default: true,
    },
    {
      key: 'gpt-5.3-codex-spark',
      label: 'gpt-5.3-codex-spark',
      description: 'Ultra-fast coding model.',
    },
    {
      key: 'gpt-5.2-codex',
      label: 'gpt-5.2-codex',
      description: 'Frontier agentic coding model.',
    },
    {
      key: 'gpt-5.1-codex-max',
      label: 'gpt-5.1-codex-max',
      description: 'Codex-optimized flagship for deep and fast reasoning.',
    },
    {
      key: 'gpt-5.2',
      label: 'gpt-5.2',
      description: 'Latest frontier model with improvements across knowledge, reasoning and coding',
    },
    {
      key: 'gpt-5.1-codex-mini',
      label: 'gpt-5.1-codex-mini',
      description: 'Optimized for codex. Cheaper, faster, but less capable.',
    },
  ],
  capabilities: {
    streaming: isCodexAvailable(),
    permissions: isCodexAvailable(),
    resume: isCodexAvailable(),
    autoCommit: true,
    conflictResolution: false,
  },
} satisfies AIProvider['metadata']

export function buildCodexExecArgs(opts: AIProviderStreamOptions): string[] {
  const prompt = buildCodexPrompt(opts)
  const args: string[] = opts.resumeSessionId
    ? ['exec', 'resume', '--json', '--model', opts.selection.modelKey]
    : ['exec', '--json', '--model', opts.selection.modelKey]

  if (opts.ephemeral) {
    args.push('--ephemeral')
  }

  const mode = opts.permissionMode || 'ask'
  switch (mode) {
    case 'plan':
    case 'ask':
      // Codex exec does not support the Claude-style --ask-for-approval flag.
      // Leave ask/plan to the CLI default approval behavior.
      break
    case 'auto':
      args.push('--full-auto')
      break
    case 'bypass':
      args.push('--dangerously-bypass-approvals-and-sandbox')
      break
  }

  if (opts.resumeSessionId) {
    args.push(opts.resumeSessionId, prompt)
  } else {
    args.push(prompt)
  }

  return args
}

function buildCodexPrompt(opts: AIProviderStreamOptions): string {
  if (!opts.systemPrompt) {
    return opts.message
  }

  // Codex CLI does not expose a Claude-like --append-system-prompt flag,
  // so we inline the system instructions into the initial prompt payload.
  return [
    'System instructions:',
    opts.systemPrompt,
    '',
    'User request:',
    opts.message,
  ].join('\n')
}

const codexProvider: AIProvider = {
  metadata,
  streamChat(opts: AIProviderStreamOptions, callbacks: AIProviderStreamCallbacks): AIProviderStreamController {
    const cliPath = getCodexCliPath()
    const fallbackCodexHome = resolveCodexHomeForSpawn(!!opts.ephemeral)
    const args = buildCodexExecArgs(opts)

    const proc = spawn(cliPath, args, {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        NO_COLOR: '1',
        ...(fallbackCodexHome ? { CODEX_HOME: fallbackCodexHome } : {}),
      },
    })
    proc.stdin?.end()

    let stdoutBuffer = ''
    let stderrBuffer = ''
    const nonJsonOutput: string[] = []

    const handleStreamChunk = (chunk: string, stream: 'stdout' | 'stderr') => {
      const merged = (stream === 'stdout' ? stdoutBuffer : stderrBuffer) + chunk
      const lines = merged.split('\n')
      const tail = lines.pop() || ''
      if (stream === 'stdout') {
        stdoutBuffer = tail
      } else {
        stderrBuffer = tail
      }
      for (const line of lines) {
        const cleaned = line.trim()
        if (!cleaned) continue
        const processed = processCodexJsonLine(cleaned)
        nonJsonOutput.push(...processed.diagnostics)
        if (processed.nonJson) {
          nonJsonOutput.push(processed.nonJson)
          continue
        }
        for (const mapped of processed.mappedEvents) {
          callbacks.onProviderJson(mapped)
        }
      }
    }

    proc.stdout?.on('data', (data: Buffer) => {
      handleStreamChunk(data.toString(), 'stdout')
    })

    proc.stderr?.on('data', (data: Buffer) => {
      handleStreamChunk(data.toString(), 'stderr')
    })

    proc.on('close', (exitCode, signal) => {
      const flushTail = (tail: string) => {
        const cleaned = tail.trim()
        if (!cleaned) return
        const processed = processCodexJsonLine(cleaned)
        nonJsonOutput.push(...processed.diagnostics)
        if (processed.nonJson) {
          nonJsonOutput.push(processed.nonJson)
          return
        }
        for (const mapped of processed.mappedEvents) {
          callbacks.onProviderJson(mapped)
        }
      }
      flushTail(stdoutBuffer)
      flushTail(stderrBuffer)
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
    return metadata.models.some((model) => model.key === modelKey)
  },
}

registerProvider(codexProvider)
export default codexProvider
