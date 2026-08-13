export function extractFetchError(error: unknown, fallback = 'Git action failed') {
  if (error && typeof error === 'object') {
    const data = 'data' in error
      ? (error as { data?: { statusMessage?: string; message?: string; data?: { conflictFiles?: string[] } } }).data
      : undefined
    const conflicts = data?.data?.conflictFiles
    if (data?.statusMessage) {
      return conflicts?.length ? `${data.statusMessage}\nConflicts: ${conflicts.join(', ')}` : data.statusMessage
    }
    if (data?.message) return data.message
    if ('statusMessage' in error && typeof (error as { statusMessage?: unknown }).statusMessage === 'string') {
      return String((error as { statusMessage: string }).statusMessage)
    }
  }
  return error instanceof Error ? error.message : fallback
}
