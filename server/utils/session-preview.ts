import { open, stat } from 'node:fs/promises'
import { getSessionLogPath } from './session-store'

const PREVIEW_TAIL_BYTES = 8192
const PREVIEW_MAX_LENGTH = 80
const MAX_LINKED_FEATURES = 8
const previewCache = new Map<string, { size: number; preview: string; features: string[] }>()

const FEATURE_ID_PATTERN = /\b(\d{3}-[a-z0-9][a-z0-9-]{2,60})\b/g

// CSI, OSC and single-char escape sequences emitted by the TUI.
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[@-_]/g
// eslint-disable-next-line no-control-regex
const CONTROL_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g
const CHROME_PATTERN = /esc to interrupt|shortcuts|bypass permissions|accept edits|manual mode|\/model to change|yolo mode|openai codex/i

/**
 * Best-effort human-readable tail of a terminal log: strips escape sequences
 * and TUI chrome, returns the last line that still carries content.
 */
export function extractSessionPreview(raw: string): string {
  const text = raw.replace(ANSI_PATTERN, '').replace(CONTROL_PATTERN, '')
  const lines = text.split(/\r?\n|\r/)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = (lines[index] || '')
      .replace(/[─-▟■-◿]/g, '')
      .replace(/^[❯›>$#%*+·\s]+/, '')
      .trim()
    if (!line || CHROME_PATTERN.test(line)) continue
    if (!/[\p{L}\p{N}]{2}/u.test(line)) continue
    const cleaned = line.replace(/\s+/g, ' ')
    return cleaned.length > PREVIEW_MAX_LENGTH
      ? `${cleaned.slice(0, PREVIEW_MAX_LENGTH - 3)}...`
      : cleaned
  }
  return ''
}

/** Spec feature ids (e.g. 012-some-feature) mentioned in the log tail. */
export function extractLinkedFeatures(raw: string): string[] {
  const text = raw.replace(ANSI_PATTERN, '')
  const features = new Set<string>()
  for (const match of text.matchAll(FEATURE_ID_PATTERN)) {
    features.add(match[1]!)
    if (features.size >= MAX_LINKED_FEATURES) break
  }
  return [...features]
}

export type SessionInsights = {
  preview: string
  features: string[]
}

export async function readSessionInsights(id: string): Promise<SessionInsights> {
  const path = getSessionLogPath(id)
  try {
    const info = await stat(path)
    if (!info.size) return { preview: '', features: [] }
    const cached = previewCache.get(id)
    if (cached && cached.size === info.size) {
      return { preview: cached.preview, features: cached.features }
    }

    const readLength = Math.min(info.size, PREVIEW_TAIL_BYTES)
    const handle = await open(path, 'r')
    try {
      const buffer = Buffer.alloc(readLength)
      await handle.read(buffer, 0, readLength, info.size - readLength)
      const raw = buffer.toString('utf8')
      const preview = extractSessionPreview(raw)
      const features = extractLinkedFeatures(raw)
      previewCache.set(id, { size: info.size, preview, features })
      return { preview, features }
    } finally {
      await handle.close()
    }
  } catch {
    return { preview: '', features: [] }
  }
}

export async function readSessionPreview(id: string): Promise<string> {
  return (await readSessionInsights(id)).preview
}
