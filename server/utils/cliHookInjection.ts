import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getSpecCatStorePath } from './specCatStore'

export interface CliHookContext {
  providerId: string
  conversationId: string
  jobId: string
  requestId: string
}

export interface CliHookInjection {
  env: Record<string, string>
  spoolPath: string
  runnerPath: string
}

export interface CliHookRecord {
  timestamp?: string
  providerId?: string
  conversationId?: string
  jobId?: string
  requestId?: string
  hookEventName?: string
  sessionId?: string
  turnId?: string
  cwd?: string
  payload?: Record<string, unknown> | null
}

const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'SubagentStop',
] as const

function ensureHookRunner(): string {
  const runnerPath = getSpecCatStorePath('cli-hooks/spec-cat-hook-runner.cjs')
  const dir = dirname(runnerPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const script = `#!/usr/bin/env node
const fs = require('node:fs')

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', () => {
  const contextRaw = process.env.SPEC_CAT_HOOK_CONTEXT || '{}'
  const spoolPath = process.env.SPEC_CAT_HOOK_SPOOL
  if (!spoolPath) {
    process.exit(0)
  }

  let payload = null
  let context = {}
  try { payload = input.trim() ? JSON.parse(input) : null } catch { payload = { parseError: true, raw: input } }
  try { context = JSON.parse(contextRaw) } catch { context = {} }

  const event = {
    timestamp: new Date().toISOString(),
    ...context,
    hookEventName: payload && typeof payload === 'object' ? payload.hook_event_name : undefined,
    sessionId: payload && typeof payload === 'object' ? payload.session_id : undefined,
    turnId: payload && typeof payload === 'object' ? payload.turn_id : undefined,
    cwd: payload && typeof payload === 'object' ? payload.cwd : undefined,
    payload,
  }

  try {
    fs.mkdirSync(require('node:path').dirname(spoolPath), { recursive: true })
    fs.appendFileSync(spoolPath, JSON.stringify(event) + '\\n', 'utf8')
  } catch {}

  if (event.hookEventName === 'Stop' || event.hookEventName === 'SubagentStop') {
    process.stdout.write('{}')
  }
})
`

  try {
    const existing = existsSync(runnerPath) ? readFileSync(runnerPath, 'utf-8') : ''
    if (existing !== script) {
      writeFileSync(runnerPath, script, { encoding: 'utf-8', mode: 0o755 })
    }
  } catch {
    writeFileSync(runnerPath, script, { encoding: 'utf-8', mode: 0o755 })
  }

  return runnerPath
}

export function prepareCliHookInjection(context: CliHookContext): CliHookInjection {
  const runnerPath = ensureHookRunner()
  const spoolPath = getCliHookSpoolPath(context.conversationId)

  return {
    runnerPath,
    spoolPath,
    env: {
      SPEC_CAT_HOOK_CONTEXT: JSON.stringify(context),
      SPEC_CAT_HOOK_SPOOL: spoolPath,
    },
  }
}

export function getCliHookSpoolPath(conversationId: string): string {
  return getSpecCatStorePath(`cli-hooks/${conversationId}.jsonl`)
}

export function parseCliHookRecord(line: string): CliHookRecord | null {
  const cleaned = line.trim()
  if (!cleaned) return null
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as CliHookRecord
  } catch {
    return null
  }
}

function buildCommandHook(runnerPath: string, statusMessage?: string) {
  return {
    type: 'command',
    command: `node "${runnerPath}"`,
    timeout: 30,
    ...(statusMessage ? { statusMessage } : {}),
  }
}

export function buildCodexHooksJson(runnerPath: string): Record<string, unknown> {
  const hooks: Record<string, unknown[]> = {}
  for (const event of HOOK_EVENTS) {
    hooks[event] = [
      {
        hooks: [
          buildCommandHook(runnerPath, `Spec Cat ${event}`),
        ],
      },
    ]
  }
  return { hooks }
}

export function buildClaudeHooksJson(runnerPath: string): Record<string, unknown> {
  const hooks: Record<string, unknown[]> = {}
  for (const event of HOOK_EVENTS) {
    hooks[event] = [
      {
        hooks: [
          buildCommandHook(runnerPath),
        ],
      },
    ]
  }
  return { hooks }
}

export function writeCodexHooks(codexHome: string, runnerPath: string): void {
  const hooksPath = join(codexHome, 'hooks.json')
  mkdirSync(dirname(hooksPath), { recursive: true })
  writeFileSync(hooksPath, JSON.stringify(buildCodexHooksJson(runnerPath), null, 2), 'utf-8')
}

function mergeHookConfig(existing: Record<string, unknown>, generated: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...existing }
  const existingHooks = existing.hooks && typeof existing.hooks === 'object' && !Array.isArray(existing.hooks)
    ? existing.hooks as Record<string, unknown>
    : {}
  const generatedHooks = generated.hooks as Record<string, unknown[]>
  const hooks: Record<string, unknown> = { ...existingHooks }

  for (const [event, entries] of Object.entries(generatedHooks)) {
    const current = Array.isArray(existingHooks[event]) ? existingHooks[event] as unknown[] : []
    hooks[event] = [
      ...current.filter((entry) => {
        const serialized = JSON.stringify(entry)
        return !serialized.includes('SPEC_CAT_HOOK_SPOOL') && !serialized.includes('spec-cat-hook-runner.cjs')
      }),
      ...entries,
    ]
  }

  merged.hooks = hooks
  return merged
}

export function writeClaudeLocalSettings(cwd: string, runnerPath: string): void {
  const settingsPath = join(cwd, '.claude', 'settings.local.json')
  mkdirSync(dirname(settingsPath), { recursive: true })

  let existing: Record<string, unknown> = {}
  if (existsSync(settingsPath)) {
    try {
      const parsed = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>
      }
    } catch {
      existing = {}
    }
  }

  const generated = buildClaudeHooksJson(runnerPath)
  writeFileSync(settingsPath, JSON.stringify(mergeHookConfig(existing, generated), null, 2), 'utf-8')
}
