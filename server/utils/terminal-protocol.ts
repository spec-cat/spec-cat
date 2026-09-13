import type { TerminalControlMessage, TerminalMessage } from '../../types/terminal'

export const DEFAULT_TERMINAL_COLS = 100
export const DEFAULT_TERMINAL_ROWS = 30

export function parseTerminalMessage(text: string): TerminalMessage | null {
  if (!text.startsWith('{')) return null
  try {
    return JSON.parse(text) as TerminalMessage
  } catch {
    return null
  }
}

export function encodeTerminalControl(message: TerminalControlMessage): string {
  return `\x00${JSON.stringify(message)}`
}

export function clampTerminalDimension(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(8, Math.min(240, Math.floor(value)))
}

export function normalizeTerminalSessionId(value?: string): string | null {
  if (!value || !/^[a-zA-Z0-9_-]{8,120}$/.test(value)) return null
  return value
}

export function sanitizeTmuxName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}
