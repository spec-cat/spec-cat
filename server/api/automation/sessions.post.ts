import type { ProviderId } from '../../utils/session-store'
import { createAutomationConversation } from '../terminal'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    provider?: unknown
    baseBranch?: unknown
    featureId?: unknown
  }>(event).catch(() => null)

  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Request body must be a JSON object' })
  }

  const provider = body.provider === undefined ? 'codex' : body.provider
  if (provider !== 'claude' && provider !== 'codex' && provider !== 'agy') {
    throw createError({ statusCode: 400, statusMessage: 'Provider must be claude, codex, or agy' })
  }
  const baseBranch = optionalString(body.baseBranch, 'baseBranch')
  const featureId = optionalString(body.featureId, 'featureId')

  const session = await createAutomationConversation({
    provider: provider as ProviderId,
    baseBranch,
    featureId
  })
  setResponseStatus(event, 201)
  return { session }
})

function optionalString(value: unknown, name: string) {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim()) {
    throw createError({ statusCode: 400, statusMessage: `${name} must be a non-empty string` })
  }
  return value.trim()
}
