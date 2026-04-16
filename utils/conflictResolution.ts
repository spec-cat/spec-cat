import type { ConflictChatMessage, ConflictFile } from '~/types/chat'

/**
 * Create a ConflictChatMessage with a unique id and current timestamp.
 * Pure factory — the caller is responsible for pushing it into the state.
 */
export function createConflictChatMessage(
  role: ConflictChatMessage['role'],
  content: string,
  type: ConflictChatMessage['type'] = 'info',
  fileRef?: string,
  now: () => number = Date.now,
  random: () => number = Math.random,
): ConflictChatMessage {
  return {
    id: `conflict-msg-${now()}-${random().toString(36).slice(2, 7)}`,
    role,
    content,
    timestamp: now(),
    type,
    fileRef,
  }
}

/**
 * Compute the summary message for the end of an AI conflict resolution run.
 * Returns the summary string plus whether the run should be considered
 * successful. Caller applies the lifecycle state.
 */
export function summarizeAiResolution(
  successCount: number,
  failCount: number,
): { message: string; succeeded: boolean } {
  if (failCount === 0) {
    const plural = successCount === 1 ? '' : 's'
    return {
      message: `All ${successCount} file${plural} resolved successfully. Click "Continue Rebase" to proceed.`,
      succeeded: true,
    }
  }
  return {
    message: `Resolution complete: ${successCount} succeeded, ${failCount} failed. You can retry or abort.`,
    succeeded: false,
  }
}

/**
 * Group an array into fixed-size batches while preserving order.
 * Batches are eagerly materialized; callers iterate and apply concurrency.
 */
export function batchFiles<T>(items: readonly T[], batchSize: number): T[][] {
  if (batchSize <= 0) throw new Error('batchSize must be positive')
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize))
  }
  return batches
}

/**
 * Filter unresolved conflict files given a set of resolved file paths.
 */
export function filterUnresolvedFiles(
  files: readonly ConflictFile[],
  resolvedPaths: ReadonlySet<string>,
): ConflictFile[] {
  return files.filter((f) => !resolvedPaths.has(f.path))
}

/**
 * Build the initial "detected N conflicts" system message text.
 */
export function buildDetectedConflictsMessage(fileCount: number): string {
  const plural = fileCount === 1 ? '' : 's'
  return `Detected ${fileCount} conflicted file${plural}. Enter optional guidance below and click "Resolve Conflicts Automatically" to start.`
}

/**
 * Build the "starting AI resolution" progress message.
 */
export function buildStartResolutionMessage(unresolvedCount: number): string {
  const plural = unresolvedCount === 1 ? '' : 's'
  return `Starting AI resolution for ${unresolvedCount} file${plural} (parallel)...`
}
