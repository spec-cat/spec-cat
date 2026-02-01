/**
 * POST /api/rebase/ai-resolve
 * Use the AI provider (Claude fallback) to intelligently resolve a merge conflict.
 * Sends the conflicted file content and returns AI-merged result. [FR-018, FR-020]
 */

import { validateWorktreePath, validateFilePath } from '~/server/utils/validateWorktree'
import { sendMessage } from '~/server/utils/claudeService'
import { guardServerProviderCapability } from '~/server/utils/aiProviderSelection'
import type { AiResolveRequest, AiResolveResponse } from '~/types/chat'

export default defineEventHandler(async (event): Promise<AiResolveResponse> => {
  const body = await readBody<AiResolveRequest>(event)

  if (!body?.worktreePath || !body?.filePath || !body?.conflictContent) {
    throw createError({ statusCode: 400, message: 'worktreePath, filePath, and conflictContent are required' })
  }

  validateWorktreePath(body.worktreePath)
  validateFilePath(body.filePath)

  const providerGuard = await guardServerProviderCapability(
    'conflictResolution',
    'Switch to a provider that supports AI conflict resolution.',
  )
  if ('failure' in providerGuard) {
    return providerGuard.failure
  }
  const { selection } = providerGuard

  const prompt = `You are a merge conflict resolution expert. Resolve the following Git merge conflict in the file "${body.filePath}".

The file contains Git conflict markers:
- \`<<<<<<< HEAD\` marks the start of "ours" (current branch) changes
- \`=======\` separates the two versions
- \`>>>>>>> ...\` marks the end of "theirs" (incoming branch) changes

Your task:
1. Analyze both sides of each conflict
2. Produce the best merged result that preserves the intent of both changes
3. If both sides add different things, include both in a logical order
4. If both sides modify the same thing differently, choose the most complete/correct version or combine them
5. Remove ALL conflict markers (<<<<<<, =======, >>>>>>>)

IMPORTANT: Output ONLY the complete resolved file content. No explanations, no markdown code blocks, no comments about the resolution. Just the raw file content.

File content with conflicts:
${body.conflictContent}`

  try {
    const result = await sendMessage(prompt, body.worktreePath, selection.modelKey)

    if (result.success && result.text) {
      // Strip any markdown code block wrappers the AI might add
      let resolved = result.text
      const codeBlockMatch = resolved.match(/^```[\w]*\n([\s\S]*?)\n```$/m)
      if (codeBlockMatch) {
        resolved = codeBlockMatch[1]
      }

      return { success: true, resolvedContent: resolved }
    }

    return { success: false, error: result.error || 'AI resolution failed' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
})
