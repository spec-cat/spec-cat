import { killShellSession, normalizeShellId } from '../../utils/shell-terminals'

export default defineEventHandler(async (event) => {
  const id = normalizeShellId(getRouterParam(event, 'id'))
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid shell id' })
  }
  await killShellSession(id)
  return { ok: true }
})
