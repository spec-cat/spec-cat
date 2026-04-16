import type { ChatImageAttachment } from '~/types/chat'

export const MAX_IMAGE_ATTACHMENTS = 4
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

export type AttachmentValidationResult =
  | { ok: true }
  | { ok: false; reason: 'not-image' | 'too-large' }

export interface ProcessedAttachment {
  attachment: ChatImageAttachment
}

export type FileReadError = { kind: 'read-failed'; file: File }

/**
 * Human-friendly size formatter: B / KB / MB with one decimal.
 */
export function formatAttachmentSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Check whether a file is a valid image attachment candidate.
 * Returns an ok result or a specific rejection reason.
 */
export function validateImageFile(
  file: File,
  maxSizeBytes: number = MAX_IMAGE_SIZE_BYTES,
): AttachmentValidationResult {
  if (!file.type.startsWith('image/')) return { ok: false, reason: 'not-image' }
  if (file.size > maxSizeBytes) return { ok: false, reason: 'too-large' }
  return { ok: true }
}

/**
 * Read a file's contents as a data URL. Rejects with a descriptive error
 * when the result is not a string or the underlying FileReader fails.
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read image'))
      }
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}

/**
 * Produce a unique attachment id. Injected clocks/RNG make the output
 * deterministic for tests.
 */
export function createAttachmentId(
  now: () => number = Date.now,
  random: () => number = Math.random,
): string {
  return `att-${now()}-${random().toString(36).slice(2, 8)}`
}
