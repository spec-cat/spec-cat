import { existsSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { getProjectDir } from '~/server/utils/projectDir'

export interface InstructionFileHit {
  path: string
  source: 'cwd' | 'ancestor'
  kind: 'file' | 'directory'
  hint: string
  mtime: string | null
}

export interface ChatContextDiagnostics {
  generatedAt: string
  projectDir: string
  requestedCwd: string
  effectiveCwd: string
  providerId: string
  providerModelKey: string
  permissionMode: string
  providerSessionId: string | null
  sessionState: 'resume' | 'fresh'
  featureId: string | null
  specContext: {
    active: boolean
    reason: string
    files: string[]
  }
  instructionFiles: InstructionFileHit[]
  notes: string[]
}

function toDisplayPath(projectDir: string, absPath: string): string {
  const rel = relative(projectDir, absPath)
  if (!rel.startsWith('..') && rel !== '') {
    return rel
  }
  return absPath
}

function safeMtime(path: string): string | null {
  try {
    return statSync(path).mtime.toISOString()
  } catch {
    return null
  }
}

function discoverInstructionFiles(projectDir: string, cwd: string): InstructionFileHit[] {
  const normalizedCwd = resolve(cwd)
  const hits: InstructionFileHit[] = []
  const visited = new Set<string>()
  const candidates = [
    { name: 'AGENTS.md', hint: 'Agent instruction file' },
    { name: 'CLAUDE.md', hint: 'Claude project instruction file' },
    { name: '.claude', hint: 'Claude command/agent directory' },
    { name: '.codex/AGENTS.md', hint: 'Codex-specific instruction file' },
  ] as const

  let current = normalizedCwd
  while (true) {
    const source: 'cwd' | 'ancestor' = current === normalizedCwd ? 'cwd' : 'ancestor'

    for (const candidate of candidates) {
      const absPath = resolve(current, candidate.name)
      if (visited.has(absPath) || !existsSync(absPath)) {
        continue
      }
      visited.add(absPath)

      const isDirectory = candidate.name.endsWith('.claude')
      hits.push({
        path: toDisplayPath(projectDir, absPath),
        source,
        kind: isDirectory ? 'directory' : 'file',
        hint: candidate.hint,
        mtime: safeMtime(absPath),
      })
    }

    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }

  return hits
}

export function buildChatContextDiagnostics(input: {
  cwd?: string
  featureId?: string
  providerId?: string
  providerModelKey?: string
  providerSessionId?: string
  permissionMode?: string
}): ChatContextDiagnostics {
  const projectDir = getProjectDir()
  const requestedCwd = input.cwd?.trim() || projectDir
  const effectiveCwd = resolve(requestedCwd)
  const sessionId = input.providerSessionId?.trim() || null
  const sessionState: 'resume' | 'fresh' = sessionId ? 'resume' : 'fresh'
  const featureId = input.featureId?.trim() || null

  const specFiles: string[] = []
  if (featureId) {
    const base = resolve(projectDir, 'specs', featureId)
    const specPath = resolve(base, 'spec.md')
    const planPath = resolve(base, 'plan.md')
    const tasksPath = resolve(base, 'tasks.md')
    if (existsSync(specPath)) specFiles.push(toDisplayPath(projectDir, specPath))
    if (existsSync(planPath)) specFiles.push(toDisplayPath(projectDir, planPath))
    if (existsSync(tasksPath)) specFiles.push(toDisplayPath(projectDir, tasksPath))
  }

  let specActive = false
  let specReason = 'No feature-linked conversation'

  if (featureId) {
    if (sessionState === 'resume') {
      specReason = 'Feature exists, but spec context is not re-injected on resumed sessions'
    } else if (specFiles.length === 0) {
      specReason = 'Feature linked, but spec files were not found'
    } else {
      specActive = true
      specReason = 'Feature spec context will be injected as system prompt on next message'
    }
  }

  const instructionFiles = discoverInstructionFiles(projectDir, effectiveCwd)

  const notes = [
    'Session state is inferred from providerSessionId. Empty value means next turn starts fresh.',
    'Spec context injection only applies on new sessions for feature-linked conversations.',
    'Instruction file discovery shows files visible from cwd ancestry; provider behavior may still vary by CLI.',
  ]

  return {
    generatedAt: new Date().toISOString(),
    projectDir,
    requestedCwd,
    effectiveCwd,
    providerId: input.providerId?.trim() || 'claude',
    providerModelKey: input.providerModelKey?.trim() || 'sonnet',
    permissionMode: input.permissionMode?.trim() || 'ask',
    providerSessionId: sessionId,
    sessionState,
    featureId,
    specContext: {
      active: specActive,
      reason: specReason,
      files: specFiles,
    },
    instructionFiles,
    notes,
  }
}
