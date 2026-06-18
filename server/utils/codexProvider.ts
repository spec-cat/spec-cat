import type { AIProvider } from '~/server/utils/aiProvider'
import { registerProvider } from '~/server/utils/aiProviderRegistry'
import { accessSync, constants, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { ensureSpecCatTmpDir } from '~/server/utils/worktreePaths'
import { getSpecCatStorePath } from '~/server/utils/specCatStore'

// Codex chat runs through the interactive PTY path (terminalSessions.ts +
// jobQueue.runProviderViaPty). This module contributes provider metadata, model
// validation, and the Codex home resolver used by the PTY layer.

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

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || 'default'
}

export function resolveCodexHomeForSpawn(ephemeral: boolean, hookHomeKey?: string): string | null {
  const sourceCodexHome = (() => {
    if (typeof process.env.CODEX_HOME === 'string' && process.env.CODEX_HOME.length > 0) {
      return process.env.CODEX_HOME
    }
    const homeDir = process.env.HOME || ''
    if (!homeDir) return null
    return join(homeDir, '.codex')
  })()

  const seedCodexAuth = (targetHome: string) => {
    if (!sourceCodexHome || sourceCodexHome === targetHome || !existsSync(sourceCodexHome)) {
      return
    }

    try {
      mkdirSync(targetHome, { recursive: true })
    } catch {
      return
    }

    const copyFileIfExists = (fileName: string) => {
      const from = join(sourceCodexHome, fileName)
      const to = join(targetHome, fileName)
      if (!existsSync(from)) return
      try {
        copyFileSync(from, to)
      } catch {
        // Best-effort only.
      }
    }

    const copyDirIfExists = (dirName: string) => {
      const from = join(sourceCodexHome, dirName)
      const to = join(targetHome, dirName)
      if (!existsSync(from)) return
      try {
        cpSync(from, to, { recursive: true, force: true })
      } catch {
        // Best-effort only.
      }
    }

    // Keep retries isolated from potentially corrupted state DB while preserving auth.
    copyFileIfExists('auth.json')
    copyFileIfExists('config.toml')
    copyFileIfExists('version.json')
    copyDirIfExists('rules')
    copyDirIfExists('prompts')
  }

  // For ephemeral retries, isolate state in a fresh temp home so corrupted
  // rollout/session records in ~/.codex cannot poison the retry attempt.
  if (ephemeral) {
    try {
      const tempHome = mkdtempSync(join(ensureSpecCatTmpDir(), 'codex-home-'))
      seedCodexAuth(tempHome)
      return tempHome
    } catch {
      // Fall back to shared temp path if mkdtemp fails.
      try {
        const fallbackEphemeralHome = join(ensureSpecCatTmpDir(), 'codex-home')
        mkdirSync(fallbackEphemeralHome, { recursive: true })
        seedCodexAuth(fallbackEphemeralHome)
        return fallbackEphemeralHome
      } catch {
        return null
      }
    }
  }

  if (hookHomeKey) {
    try {
      const managedHome = getSpecCatStorePath(join('codex-home', safePathSegment(hookHomeKey)))
      mkdirSync(managedHome, { recursive: true })
      seedCodexAuth(managedHome)
      // Share rollout/session records with the real Codex home so `codex resume`
      // can find sessions created before/outside this managed home (e.g. after a
      // server restart). Without this, the managed home starts empty and resume
      // fails with "missing rollout path", falling back to a fresh session.
      if (sourceCodexHome && sourceCodexHome !== managedHome) {
        const realSessions = join(sourceCodexHome, 'sessions')
        const linkedSessions = join(managedHome, 'sessions')
        if (existsSync(realSessions) && !existsSync(linkedSessions)) {
          try {
            symlinkSync(realSessions, linkedSessions, 'dir')
          } catch {
            // Best-effort: if symlink fails (e.g. it already exists as a real
            // dir, or the platform disallows it), resume falls back gracefully.
          }
        }
      }
      return managedHome
    } catch {
      // Fall through to the normal home resolution path.
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

  try {
    const fallbackCodexHome = join(ensureSpecCatTmpDir(), 'codex-home')
    mkdirSync(fallbackCodexHome, { recursive: true })
    seedCodexAuth(fallbackCodexHome)
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
      key: 'gpt-5.5',
      label: 'gpt-5.5 (current)',
      description: 'Latest flagship model for complex reasoning and coding.',
      default: true,
    },
    {
      key: 'gpt-5.4',
      label: 'gpt-5.4',
      description: 'Frontier model for coding and general reasoning.',
    },
    {
      key: 'gpt-5.3-codex',
      label: 'gpt-5.3-codex',
      description: 'Latest frontier agentic coding model.',
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
    conflictResolution: true,
  },
} satisfies AIProvider['metadata']

const codexProvider: AIProvider = {
  metadata,
  isModelSupported(modelKey: string) {
    return metadata.models.some((model) => model.key === modelKey)
  },
}

registerProvider(codexProvider)
export default codexProvider
