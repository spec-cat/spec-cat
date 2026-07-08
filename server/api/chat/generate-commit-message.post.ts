/**
 * POST /api/chat/generate-commit-message
 * Generate a squash commit message by summarizing all commits in a worktree branch.
 * Uses the conversation's AI provider (settings fallback) to produce a conventional commit message.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { queryInteractiveProvider } from '~/server/utils/interactiveProviderQuery'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'
import {
  guardProviderCapability,
  guardServerProviderCapability,
  resolveServerProviderSelection,
} from '~/server/utils/aiProviderSelection'
import { resolveExistingBaseBranch } from '~/server/utils/baseBranch'
import { readConversationFromStorage } from '~/server/utils/conversationStore'
import { getChatWorktreePath } from '~/server/utils/worktreePaths'
import { validateWorktreePath } from '~/server/utils/validateWorktree'

const execFileAsync = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd })
  return stdout.trim()
}

function readNonEmptyString(record: unknown, key: string): string {
  if (!record || typeof record !== 'object') return ''
  const value = (record as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : ''
}

async function guardConversationProviderCapability(conversationId: string) {
  const conversation = await readConversationFromStorage(conversationId)
  const providerId = readNonEmptyString(conversation, 'providerId')

  if (!providerId) {
    return guardServerProviderCapability(
      'autoCommit',
      'Switch to a provider with auto-commit support or disable AI-generated commit messages.',
    )
  }

  const selection = await resolveServerProviderSelection({
    providerId,
    modelKey: readNonEmptyString(conversation, 'providerModelKey'),
  })

  return guardProviderCapability(
    selection,
    'autoCommit',
    'Switch to a provider with auto-commit support or disable AI-generated commit messages.',
  )
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    conversationId: string
    worktreePath?: string
    baseBranch?: string
    worktreeBranch?: string
    previewSessionId?: string
  }>(event)

  if (!body?.conversationId) {
    throw createError({ statusCode: 400, message: 'conversationId is required' })
  }

  const { conversationId } = body
  // Only allow client-supplied preview ids inside the ephemeral commit-gen
  // namespace so a request can't co-opt the live `conversation:<id>` PTY.
  const previewSessionId =
    typeof body.previewSessionId === 'string' && body.previewSessionId.startsWith('commitgen:')
      ? body.previewSessionId
      : undefined
  const worktreePath = body.worktreePath || getChatWorktreePath(conversationId)
  const projectDir = getProjectDir()
  const abortController = new AbortController()
  const abortRequest = () => abortController.abort()
  event.node.res.once('close', abortRequest)

  try {
    if (!existsSync(worktreePath)) {
      throw createError({ statusCode: 404, message: 'Worktree not found' })
    }
    validateWorktreePath(worktreePath)

    const providerGuard = await guardConversationProviderCapability(conversationId)
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

    // Keep the prompt single-line: the interactive TUI treats newlines in typed
    // input as submit/insert, so commit history and diff stats are flattened.
    const flatten = (value: string) => value.replace(/\s*\n\s*/g, ' | ').trim()
    const prompt =
      `Write a single concise squash git commit message summarizing the work on branch ` +
      `"${worktreeBranch || '(unknown)'}" (base "${baseBranch}"). ` +
      `Commits: ${flatten(log)}. File changes: ${flatten(diffStat)}. ` +
      `Use conventional commit format (feat/fix/refactor/docs/chore). First line max 72 chars, no emoji. ` +
      `Add a short body of 2-3 lines only if the changes are complex. ` +
      `Use only the supplied commit list and file changes. Do not inspect files, run commands, or use tools. ` +
      `Output only the commit message.`

    const result = await queryInteractiveProvider({
      conversationId,
      cwd: worktreePath,
      providerId: selection.providerId,
      modelKey: selection.modelKey,
      prompt,
      // Long histories make this prompt big enough that the TUI collapses it
      // into a "[Pasted text]" chip. Inject it as an explicit bracketed paste so
      // the chip is created deterministically rather than depending on raw-type
      // burst-render timing (which intermittently dropped the submit).
      bracketedPaste: true,
      abortSignal: abortController.signal,
      previewSessionId,
    })

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
