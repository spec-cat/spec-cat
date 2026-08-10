import { getJobQueue } from '../../utils/job-executor'
import { isValidJobId, JobQueueError, toJobSummary } from '../../utils/job-queue'

/** DELETE /api/jobs/:id — cancels a queued or running job (400 otherwise). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  if (!isValidJobId(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid job id' })
  }

  const queue = getJobQueue()
  await queue.ready
  try {
    const job = await queue.cancel(id)
    return { job: toJobSummary(job) }
  } catch (error) {
    if (error instanceof JobQueueError && error.code === 'not_found') {
      // Terminal jobs from earlier runs only live on disk; report those as 400.
      const job = await queue.getJob(id)
      if (!job) throw createError({ statusCode: 404, statusMessage: 'Job not found' })
      throw createError({ statusCode: 400, statusMessage: `Job is already ${job.status}` })
    }
    if (error instanceof JobQueueError) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }
    throw error
  }
})
