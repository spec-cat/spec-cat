/**
 * POST /api/chat/generate-commit-message
 * Generate a squash commit message by summarizing all commits in a worktree branch.
 * Uses the AI provider (Claude fallback) to produce a conventional commit message.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { sendMessage } from '~/server/utils/claudeService'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'
import { guardServerProviderCapability } from '~/server/utils/aiProviderSelection'

const execAsync = promisify(exec)

async function git(cwd: string, cmd: string): Promise<string> {
  const { stdout } = await execAsync(`git ${cmd}`, { cwd })
  return stdout.trim()
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ conversationId: string; worktreePath?: string }>(event)

  if (!body?.conversationId) {
    throw createError({ statusCode: 400, message: 'conversationId is required' })
  }

  const { conversationId } = body
  const worktreePath = body.worktreePath || `/tmp/br-${conversationId}`
  const projectDir = getProjectDir()

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

  try {
    // Detect base branch
    let baseBranch = 'main'
    try {
      await git(projectDir, 'rev-parse --verify main')
    } catch {
      baseBranch = 'master'
    }

    // Get commit log summary
    const log = await git(worktreePath, `log --oneline ${baseBranch}..HEAD`)
    if (!log) {
      return { success: false, error: 'No commits to summarize' }
    }

    // Get overall diff stat
    const diffStat = await git(worktreePath, `diff --stat ${baseBranch}..HEAD`)

    const prompt = `Generate a concise squash commit message summarizing these changes.

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

    const result = await sendMessage(prompt, worktreePath, selection.modelKey)

    if (result.success && result.text) {
      return { success: true, message: result.text.trim() }
    }

    return { success: false, error: result.error || 'Failed to generate message' }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.chat.error('Generate commit message failed', { conversationId, error: msg })
    return { success: false, error: msg }
  }
})
