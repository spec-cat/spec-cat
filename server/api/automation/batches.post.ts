import type { ProviderId } from '../../utils/session-store'
import { startSpecBatch } from '../../utils/spec-batches'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    provider?: unknown
    baseBranch?: unknown
    maxPlanningRounds?: unknown
    maxReviewRounds?: unknown
  }>(event).catch(() => null)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Request body must be a JSON object' })
  }
  const provider = body.provider === undefined ? 'codex' : body.provider
  if (provider !== 'claude' && provider !== 'codex') {
    throw createError({ statusCode: 400, statusMessage: 'Provider must be claude or codex' })
  }
  const baseBranch = body.baseBranch === undefined ? undefined : String(body.baseBranch).trim()
  if (body.baseBranch !== undefined && (!baseBranch || typeof body.baseBranch !== 'string')) {
    throw createError({ statusCode: 400, statusMessage: 'baseBranch must be a non-empty string' })
  }
  const planningRounds = body.maxPlanningRounds === undefined ? 3 : body.maxPlanningRounds
  if (!Number.isInteger(planningRounds) || Number(planningRounds) < 1 || Number(planningRounds) > 10) {
    throw createError({ statusCode: 400, statusMessage: 'maxPlanningRounds must be an integer from 1 to 10' })
  }
  const reviewRounds = body.maxReviewRounds === undefined ? 3 : body.maxReviewRounds
  if (!Number.isInteger(reviewRounds) || Number(reviewRounds) < 1 || Number(reviewRounds) > 10) {
    throw createError({ statusCode: 400, statusMessage: 'maxReviewRounds must be an integer from 1 to 10' })
  }

  const batch = await startSpecBatch({
    provider: provider as ProviderId,
    baseBranch,
    maxPlanningRounds: Number(planningRounds),
    maxReviewRounds: Number(reviewRounds)
  })
  setResponseStatus(event, 202)
  return { batch }
})
