/**
 * GET /api/jobs/:id — Get job status and buffered events
 *
 * Query params:
 *   cursor - event index to start from (for incremental replay)
 */

import { jobQueue } from '~/server/utils/jobQueue'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Job ID is required' })
  }

  const job = jobQueue.getJob(id)
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }

  const query = getQuery(event)
  const cursor = typeof query.cursor === 'string' ? parseInt(query.cursor, 10) : 0
  const validCursor = Number.isFinite(cursor) && cursor >= 0 ? cursor : 0

  return {
    id: job.id,
    conversationId: job.conversationId,
    source: job.source,
    status: job.status,
    createdAt: job.createdAt,
    events: job.events.slice(validCursor),
    nextCursor: job.events.length,
  }
})
