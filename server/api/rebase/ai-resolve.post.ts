/**
 * POST /api/rebase/ai-resolve
 * Use the settings-configured AI provider to resolve a merge conflict.
 *
 * Optimization: Instead of sending the entire file, extracts only the conflict
 * blocks with surrounding context (~5 lines), sends those to AI, then stitches
 * the resolved blocks back into the original file. This dramatically reduces
 * token usage for large files (e.g., 2000 lines → ~50 lines).
 * [FR-004, FR-007]
 */

import { validateWorktreePath, validateFilePath } from '~/server/utils/validateWorktree'
import { getServerProviderSelection } from '~/server/utils/aiProviderSelection'
import { logger } from '~/server/utils/logger'
import { runProviderOneShot } from '~/server/utils/providerOneShot'
import type { AiResolveRequest, AiResolveResponse } from '~/types/chat'

const CONTEXT_LINES = 5

interface ConflictBlock {
  /** Index of the <<<<<<< line in the original lines array */
  startLine: number
  /** Index of the >>>>>>> line in the original lines array */
  endLine: number
  /** The full conflict block including markers and surrounding context */
  contextSnippet: string
  /** The ours side content */
  ours: string
  /** The theirs side content */
  theirs: string
}

/**
 * Parse a file's content and extract individual conflict blocks with context.
 */
function extractConflictBlocks(content: string): { lines: string[]; blocks: ConflictBlock[] } {
  const lines = content.split('\n')
  const blocks: ConflictBlock[] = []

  let i = 0
  while (i < lines.length) {
    if (/^<{7}\s/.test(lines[i])) {
      const startLine = i
      let separatorLine = -1
      let endLine = -1

      // Find ======= and >>>>>>>
      for (let j = i + 1; j < lines.length; j++) {
        if (/^={7}$/.test(lines[j]) && separatorLine === -1) {
          separatorLine = j
        } else if (/^>{7}\s/.test(lines[j])) {
          endLine = j
          break
        }
      }

      if (separatorLine !== -1 && endLine !== -1) {
        const ctxStart = Math.max(0, startLine - CONTEXT_LINES)
        const ctxEnd = Math.min(lines.length - 1, endLine + CONTEXT_LINES)
        const contextLines = lines.slice(ctxStart, ctxEnd + 1)
        const ours = lines.slice(startLine + 1, separatorLine).join('\n')
        const theirs = lines.slice(separatorLine + 1, endLine).join('\n')

        blocks.push({
          startLine,
          endLine,
          contextSnippet: contextLines.join('\n'),
          ours,
          theirs,
        })
        i = endLine + 1
        continue
      }
    }
    i++
  }

  return { lines, blocks }
}

/**
 * Extract resolved content from AI response.
 * Tries marker extraction, then code block, then raw content validation.
 */
function extractResolved(raw: string, marker: string): string | null {
  const startTag = `===BLOCK_${marker}_START===`
  const endTag = `===BLOCK_${marker}_END===`

  // 1. Marker-based extraction
  const startIdx = raw.indexOf(startTag)
  const endIdx = raw.indexOf(endTag)
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return raw.slice(startIdx + startTag.length, endIdx).replace(/^\n/, '').replace(/\n$/, '')
  }

  // 2. Code block extraction
  const codeBlockMatch = raw.match(/```[\w]*\n([\s\S]*?)\n```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1]
  }

  // 3. Reject if conflict markers remain
  if (/^<{7}\s/m.test(raw)) {
    return null
  }

  // 4. Reject obvious commentary
  const trimmed = raw.trim()
  if (/^(Now |Here |Let me |I'll |I can |I've |The |This |Looking |Analyzing |Resolved |Conflict )/i.test(trimmed)) {
    return null
  }
  if (/^\*\*/.test(trimmed) || /^#+\s/.test(trimmed)) {
    return null
  }

  return trimmed || null
}

/**
 * Build a prompt that resolves one or more conflict blocks at once.
 * Each block is labeled BLOCK_1, BLOCK_2, etc. and must be output with corresponding markers.
 */
function buildBlockPrompt(
  filePath: string,
  blocks: ConflictBlock[],
  userGuidance?: string,
): string {
  const guidanceLine = userGuidance ? `\nUser guidance: ${userGuidance}` : ''

  if (blocks.length === 1) {
    const b = blocks[0]
    return `Resolve this Git merge conflict. Output ONLY the resolved code between the markers.

RULES:
- Remove ALL conflict markers (<<<<<<< ======= >>>>>>>)
- Merge both sides, preserving the intent of both changes
- Output only the replacement for the conflict block, not the surrounding context
${guidanceLine}

OUTPUT FORMAT (strict):
===BLOCK_1_START===
<resolved code replacing the conflict>
===BLOCK_1_END===

No text before ===BLOCK_1_START=== or after ===BLOCK_1_END===.

File: ${filePath}
Conflict with context:
${b.contextSnippet}`
  }

  // Multiple blocks
  const blockSections = blocks.map((b, i) => {
    return `--- CONFLICT ${i + 1} ---
${b.contextSnippet}`
  }).join('\n\n')

  const outputFormat = blocks.map((_, i) => {
    return `===BLOCK_${i + 1}_START===
<resolved code for conflict ${i + 1}>
===BLOCK_${i + 1}_END===`
  }).join('\n')

  return `Resolve ${blocks.length} Git merge conflicts in file "${filePath}". Output ONLY the resolved code for each block between its markers.

RULES:
- Remove ALL conflict markers (<<<<<<< ======= >>>>>>>)
- Merge both sides, preserving the intent of both changes
- Output only the replacement for each conflict block, not surrounding context
- Maintain output order matching the conflict order
${guidanceLine}

OUTPUT FORMAT (strict — one section per conflict):
${outputFormat}

No text before the first marker or after the last marker. No explanations.

${blockSections}`
}

export default defineEventHandler(async (event): Promise<AiResolveResponse> => {
  const body = await readBody<AiResolveRequest>(event)

  if (!body?.worktreePath || !body?.filePath || !body?.conflictContent) {
    throw createError({ statusCode: 400, message: 'worktreePath, filePath, and conflictContent are required' })
  }

  validateWorktreePath(body.worktreePath)
  validateFilePath(body.filePath)

  const selection = await getServerProviderSelection()
  const { lines, blocks } = extractConflictBlocks(body.conflictContent)

  // No conflicts found — return content as-is
  if (blocks.length === 0) {
    return { success: true, resolvedContent: body.conflictContent }
  }

  const prompt = buildBlockPrompt(body.filePath, blocks, body.userGuidance)

  try {
    const result = await runProviderOneShot({
      selection,
      prompt,
      cwd: body.worktreePath,
      capability: 'conflictResolution',
    })

    if (!result.success || !result.text) {
      return {
        success: false,
        error: result.error || 'AI resolution failed',
        providerId: selection.providerId,
      }
    }

    // Extract resolved content for each block
    const resolvedBlocks: string[] = []
    for (let i = 0; i < blocks.length; i++) {
      const resolved = extractResolved(result.text, String(i + 1))
      if (resolved === null) {
        logger.chat.error('Failed to extract resolved block from AI response', {
          filePath: body.filePath,
          blockIndex: i,
          responsePreview: result.text.slice(0, 300),
        })
        return {
          success: false,
          error: `Failed to extract resolved content for conflict block ${i + 1}/${blocks.length}. AI may have output commentary instead of code.`,
        }
      }
      resolvedBlocks.push(resolved)
    }

    // Stitch resolved blocks back into the original file (replace in reverse to preserve indices)
    const resultLines = [...lines]
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i]
      const replacementLines = resolvedBlocks[i].split('\n')
      resultLines.splice(block.startLine, block.endLine - block.startLine + 1, ...replacementLines)
    }

    return {
      success: true,
      resolvedContent: resultLines.join('\n'),
      providerId: selection.providerId,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message, providerId: selection.providerId }
  }
})
