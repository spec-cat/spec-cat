import { squashSession } from '../../../utils/session-integration'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  const body = await readBody<{ baseBranch?: string }>(event)
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(id) || !body.baseBranch) {
    throw createError({ statusCode: 400, statusMessage: 'Conversation and base branch are required' })
  }

  try {
    return await squashSession(id, body.baseBranch)
  } catch (error) {
    const conflictFiles = getConflictFiles(error)
    throw createError({
      statusCode: conflictFiles.length ? 409 : 400,
      statusMessage: error instanceof Error ? error.message : 'Squash failed',
      data: { conflictFiles }
    })
  }
})

function getConflictFiles(error: unknown) {
  if (!error || typeof error !== 'object' || !('conflictFiles' in error)) return []
  return Array.isArray(error.conflictFiles) ? error.conflictFiles : []
}
