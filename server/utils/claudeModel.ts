import type { ClaudeModel } from '~/types/claude'
import { readSpecCatStore } from './specCatStore'

const DEFAULT_MODEL: ClaudeModel = 'sonnet'

const MODEL_IDS: Record<ClaudeModel, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-3-5-haiku-20241022',
}

function isClaudeModel(value: unknown): value is ClaudeModel {
  return value === 'sonnet' || value === 'opus' || value === 'haiku'
}

export async function getConfiguredClaudeModel(): Promise<ClaudeModel> {
  const settings = await readSpecCatStore<Record<string, unknown>>('settings.json', {})
  const stored = settings.claudeModel
  return isClaudeModel(stored) ? stored : DEFAULT_MODEL
}

export async function getConfiguredClaudeModelId(): Promise<string> {
  const model = await getConfiguredClaudeModel()
  return MODEL_IDS[model]
}

export function getClaudeModelId(modelKey?: string): string {
  const model = isClaudeModel(modelKey) ? modelKey : DEFAULT_MODEL
  return MODEL_IDS[model]
}