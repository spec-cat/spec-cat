import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { STORE_ROOT } from './session-store'

export type AppSettings = {
  theme?: string
  gitGraphState?: 'floating' | 'pinned' | 'none'
  defaultProvider?: 'claude' | 'codex'
}

const SETTINGS_PATH = join(STORE_ROOT, 'settings.json')
const GIT_GRAPH_STATES = new Set(['floating', 'pinned', 'none'])
const PROVIDERS = new Set(['claude', 'codex'])

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const settings: AppSettings = {}
  if (typeof record.theme === 'string' && record.theme.length <= 100) {
    settings.theme = record.theme
  }
  if (typeof record.gitGraphState === 'string' && GIT_GRAPH_STATES.has(record.gitGraphState)) {
    settings.gitGraphState = record.gitGraphState as AppSettings['gitGraphState']
  }
  if (typeof record.defaultProvider === 'string' && PROVIDERS.has(record.defaultProvider)) {
    settings.defaultProvider = record.defaultProvider as AppSettings['defaultProvider']
  }
  return settings
}

export async function readAppSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf8')
    return normalizeAppSettings(JSON.parse(raw))
  } catch {
    return {}
  }
}

export async function writeAppSettings(patch: AppSettings): Promise<AppSettings> {
  const merged = { ...(await readAppSettings()), ...normalizeAppSettings(patch) }
  await mkdir(dirname(SETTINGS_PATH), { recursive: true })
  const tmpPath = `${SETTINGS_PATH}.tmp`
  await writeFile(tmpPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  await rename(tmpPath, SETTINGS_PATH)
  return merged
}
