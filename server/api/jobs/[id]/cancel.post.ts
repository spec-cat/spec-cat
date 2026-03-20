/**
 * POST /api/jobs/:id/cancel — Cancel an active job
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

  if (job.status === 'done' || job.status === 'error') {
    return { success: false, reason: 'Job already finished' }
  }

  jobQueue.abort(job.conversationId)
  return { success: true }
})
