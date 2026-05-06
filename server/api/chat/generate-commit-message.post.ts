/**
 * POST /api/chat/generate-commit-message
 * Generate a squash commit message by summarizing all commits in a worktree branch.
 * Uses the AI provider (Claude fallback) to produce a conventional commit message.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { sendMessage } from '~/server/utils/claudeService'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'
import { guardServerProviderCapability } from '~/server/utils/aiProviderSelection'
import { resolveExistingBaseBranch } from '~/server/utils/baseBranch'

const execFileAsync = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd })
  return stdout.trim()
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    conversationId: string
    worktreePath?: string
    baseBranch?: string
    worktreeBranch?: string
  }>(event)

  if (!body?.conversationId) {
    throw createError({ statusCode: 400, message: 'conversationId is required' })
  }

  const { conversationId } = body
  const worktreePath = body.worktreePath || `/tmp/sc-${conversationId}`
  const projectDir = getProjectDir()
  const abortController = new AbortController()
  const abortRequest = () => abortController.abort()
  event.node.res.once('close', abortRequest)

  try {
    if (!existsSync(worktreePath)) {
      throw createError({ statusCode: 404, message: 'Worktree not found' })
    }

    const providerGuard = await guardServerProviderCapability(
      'autoCommit',
      'Switch to a provider with auto-commit support or disable AI-generated commit messages.',
    )
    if ('failure' in providerGuard) {
      return providerGuard.failure
    }
    const { selection } = providerGuard

    let worktreeBranch = body.worktreeBranch?.trim() || ''
    if (!worktreeBranch) {
      try {
        worktreeBranch = await git(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD'])
      } catch {
        worktreeBranch = ''
      }
    }

    const baseBranch = await resolveExistingBaseBranch({
      cwd: projectDir,
      requestedBaseBranch: body.baseBranch,
      worktreeBranch,
    })
    if (!baseBranch) {
      return { success: false, error: 'Unable to resolve a valid base branch for this worktree.' }
    }

    // Summarize only the current worktree branch changes. Using baseBranch..HEAD
    // makes the diff include unrelated changes that landed on base after this
    // branch forked; merge-base..HEAD matches the later squash reset range.
    const mergeBase = await git(worktreePath, ['merge-base', baseBranch, 'HEAD'])
    const range = `${mergeBase}..HEAD`

    const log = await git(worktreePath, ['log', '--oneline', range])
    if (!log) {
      return { success: false, error: 'No commits to summarize' }
    }

    const diffStat = await git(worktreePath, ['diff', '--stat', range])

    const prompt = `Generate a concise squash commit message summarizing these changes.

Base branch: ${baseBranch}
Worktree branch: ${worktreeBranch || '(unknown)'}

Commit history:
${log}

Overall diff:
${diffStat}

Rules:
- Use conventional commit format (feat/fix/refactor/docs/chore)
- First line max 72 chars
- Optionally add a blank line then a short body (2-3 lines max) if the changes are complex
- Be specific about what changed
- No emoji

Output only the commit message, nothing else.`

    const result = await sendMessage(prompt, worktreePath, selection.modelKey, abortController.signal)

    if (result.success && result.text) {
      return { success: true, message: result.text.trim() }
    }

    return { success: false, error: result.error || 'Failed to generate message' }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.chat.error('Generate commit message failed', { conversationId, error: msg })
    return { success: false, error: msg }
  } finally {
    event.node.res.off('close', abortRequest)
  }
})
