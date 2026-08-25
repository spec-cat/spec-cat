import type { ProviderId } from '../../utils/session-store'
import { startSpecWorkflow } from '../../utils/spec-workflows'
import { sessionWorktreeBranch } from '../../utils/worktree'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    featureId?: unknown
    provider?: unknown
    branch?: unknown
    baseBranch?: unknown
    maxPlanningRounds?: unknown
    maxReviewRounds?: unknown
  }>(event).catch(() => null)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Request body must be a JSON object' })
  }
  if (typeof body.featureId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(body.featureId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid featureId' })
  }
  const provider = body.provider === undefined ? 'codex' : body.provider
  if (provider !== 'claude' && provider !== 'codex') {
    throw createError({ statusCode: 400, statusMessage: 'Provider must be claude or codex' })
  }
  const branch = optionalString(body.branch, 'branch')
  if (branch) {
    try {
      sessionWorktreeBranch('validation', undefined, branch)
    } catch (error) {
      throw createError({
        statusCode: 400,
        statusMessage: error instanceof Error ? error.message : 'Invalid branch'
      })
    }
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

  const workflow = startSpecWorkflow({
    featureId: body.featureId,
    provider: provider as ProviderId,
    branch,
    baseBranch,
    maxPlanningRounds: Number(planningRounds),
    maxReviewRounds: Number(reviewRounds)
  })
  setResponseStatus(event, 202)
  return { workflow }
})

function optionalString(value: unknown, name: string) {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim()) {
    throw createError({ statusCode: 400, statusMessage: `${name} must be a non-empty string` })
  }
  return value.trim()
}
