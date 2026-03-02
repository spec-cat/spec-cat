/**
 * Gemini model types
 */

export type GeminiModel = 'auto-3' | 'auto-2.5' | 'manual'

export interface GeminiModelEntry {
  value: GeminiModel
  label: string
  description: string
  modelId: string
  default?: boolean
}

export const GEMINI_MODELS: GeminiModelEntry[] = [
  {
    value: 'auto-3',
    label: 'Auto (Gemini 3)',
    description: 'Let Gemini CLI decide the best model for the task (Gemini 3 series)',
    modelId: 'auto-3',
    default: true
  },
  {
    value: 'auto-2.5',
    label: 'Auto (Gemini 2.5)',
    description: 'Let Gemini CLI decide the best model for the task (Gemini 2.5 series)',
    modelId: 'auto-2.5'
  },
  {
    value: 'manual',
    label: 'Manual',
    description: 'Manually select a model',
    modelId: 'manual'
  }
]
