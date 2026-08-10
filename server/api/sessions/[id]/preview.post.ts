import { previewSession } from '../../../utils/session-integration'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Conversation is required' })
  }

  try {
    return await previewSession(id)
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Preview failed'
    })
  }
})
