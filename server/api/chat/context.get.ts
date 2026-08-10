import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { listStoredSessions, readStoredSession } from '../../utils/session-store'
import { inspectProviderSession } from '../../utils/providers/claude'

const INSTRUCTION_FILE_CANDIDATES = [
  'CLAUDE.md',
  'AGENTS.md',
  '.claude/settings.json',
  '.claude/settings.local.json',
  'GEMINI.md',
  'codex.md'
]

/**
 * Diagnostics for a conversation: effective cwd, provider, runtime state and
 * the instruction files the CLI will discover there.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedId = typeof query.sessionId === 'string' ? query.sessionId : ''

  const session = requestedId
    ? await readStoredSession(requestedId)
    : (await listStoredSessions())[0] || null
  if (!session || session.archived) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  const instructionFiles = (
    await Promise.all(
      INSTRUCTION_FILE_CANDIDATES.map(async (relativePath) => {
        const filePath = join(session.cwd, relativePath)
        try {
          await access(filePath)
          return relativePath
        } catch {
          return null
        }
      })
    )
  ).filter((value): value is string => Boolean(value))

  return {
    sessionId: session.id,
    provider: session.provider,
    cwd: session.cwd,
    projectDir: session.projectDir,
    cliBin: session.cliBin,
    tmuxName: session.tmuxName,
    worktreeBranch: session.worktreeBranch,
    baseBranch: session.baseBranch,
    previewBranch: session.previewBranch,
    providerSessionId: session.providerSessionId,
    finalized: Boolean(session.finalized),
    runtime: await inspectProviderSession(session),
    instructionFiles,
    checkedAt: new Date().toISOString()
  }
})
