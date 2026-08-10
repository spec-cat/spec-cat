import { finalizeSession } from '../../../utils/session-integration'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  const body = await readBody<{ baseBranch?: string; commitMessage?: string }>(event)
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(id) || !body.baseBranch || !body.commitMessage?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Conversation, base branch, and commit message are required' })
  }

  try {
    return await finalizeSession(id, body.baseBranch, body.commitMessage)
  } catch (error) {
    const conflictFiles = getConflictFiles(error)
    throw createError({
      statusCode: conflictFiles.length ? 409 : 400,
      statusMessage: error instanceof Error ? error.message : 'Finalize failed',
      data: { conflictFiles }
    })
  }
})

function getConflictFiles(error: unknown) {
  if (!error || typeof error !== 'object' || !('conflictFiles' in error)) return []
  return Array.isArray(error.conflictFiles) ? error.conflictFiles : []
}
