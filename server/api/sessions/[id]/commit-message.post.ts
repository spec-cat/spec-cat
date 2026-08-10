import { requireRef } from '../../../utils/git-access'
import { runGit } from '../../../utils/git-state'
import { buildCommitMessagePrompt, runProviderQuery, sanitizeCommitMessage } from '../../../utils/provider-query'
import { readStoredSession } from '../../../utils/session-store'

/** How much of the raw diff is sent to the provider alongside the stat. */
const DIFF_SAMPLE_BYTES = 12 * 1024

/**
 * Drafts a squash commit message for a conversation's worktree branch by
 * asking the session's own provider CLI (headless one-shot query) to summarize
 * the merge-base..worktreeBranch diff against the base branch.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid conversation id' })
  }

  const session = await readStoredSession(id)
  if (!session || session.archived || session.finalized) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }
  if (!session.projectDir || !session.worktreeBranch) {
    throw createError({ statusCode: 400, statusMessage: 'Conversation has no managed worktree' })
  }
  const projectDir = session.projectDir

  const body = await readBody<{ baseBranch?: string } | null>(event).catch(() => null)
  let baseBranch: string
  let worktreeBranch: string
  try {
    baseBranch = requireRef(body?.baseBranch ?? session.baseBranch, 'baseBranch')
    worktreeBranch = requireRef(session.worktreeBranch, 'worktreeBranch')
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: toStatusMessage(error, 'Invalid branch') })
  }

  let mergeBase = ''
  let diffStat = ''
  let diffSample = ''
  try {
    mergeBase = await runGit(projectDir, ['merge-base', worktreeBranch, baseBranch])
    diffStat = await runGit(projectDir, ['diff', '--stat', `${mergeBase}..${worktreeBranch}`])
    const diff = await runGit(projectDir, ['diff', `${mergeBase}..${worktreeBranch}`], { trim: false })
    diffSample = diff.slice(0, DIFF_SAMPLE_BYTES)
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: toStatusMessage(error, `Unable to diff ${worktreeBranch} against ${baseBranch}`)
    })
  }

  if (!diffStat && !diffSample.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'No changes to describe' })
  }

  const prompt = buildCommitMessagePrompt(diffStat, diffSample, baseBranch)
  let message: string
  try {
    message = sanitizeCommitMessage(
      await runProviderQuery(session.provider, prompt, { cwd: projectDir, trackKey: id })
    )
  } catch (error) {
    throw createError({ statusCode: 502, statusMessage: toStatusMessage(error, 'Provider query failed') })
  }
  if (!message) {
    throw createError({ statusCode: 502, statusMessage: 'Provider returned an empty commit message' })
  }

  return { message }
})

/** Flattens an error into a single-line HTTP status message. */
function toStatusMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  return (message || fallback).replace(/\s+/g, ' ').trim()
}
