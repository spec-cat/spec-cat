/**
 * GET /api/jobs — List all jobs, optionally filtered by conversationId
 */

import { jobQueue } from '~/server/utils/jobQueue'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const conversationId = typeof query.conversationId === 'string' ? query.conversationId : undefined

  if (conversationId) {
    return jobQueue.listJobs(conversationId).map(serializeJob)
  }

  return jobQueue.listAllJobs().map(serializeJob)
})

function serializeJob(job: ReturnType<typeof jobQueue.getJob> & object) {
  return {
    id: job.id,
    conversationId: job.conversationId,
    source: job.source,
    status: job.status,
    createdAt: job.createdAt,
    eventCount: job.events.length,
  }
}
