import { readStoredSession } from '../utils/session-store'
import { getJobQueue } from '../utils/job-executor'
import { toJobSummary } from '../utils/job-queue'

const MAX_PROMPT_BYTES = 32 * 1024

/**
 * POST /api/jobs — submits a browserless chat turn to an existing
 * conversation. Responds 202 with the queued job (no event buffer).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ sessionId?: unknown; prompt?: unknown }>(event).catch(() => null)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Request body must be a JSON object' })
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(sessionId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid session id' })
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt : ''
  if (!prompt.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Prompt must be a non-empty string' })
  }
  if (Buffer.byteLength(prompt, 'utf8') > MAX_PROMPT_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Prompt must be at most 32KB' })
  }

  const session = await readStoredSession(sessionId)
  if (!session) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  if (session.archived) throw createError({ statusCode: 409, statusMessage: 'Session is archived' })
  if (session.finalized) throw createError({ statusCode: 409, statusMessage: 'Session is finalized' })

  const job = getJobQueue().enqueue({ sessionId, provider: session.provider, prompt })
  setResponseStatus(event, 202)
  return { job: toJobSummary(job) }
})
