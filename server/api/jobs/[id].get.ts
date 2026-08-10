import { getJobQueue } from '../../utils/job-executor'
import { eventsAfter, isValidJobId, toJobSummary } from '../../utils/job-queue'

/**
 * GET /api/jobs/:id?cursor=N — job status plus the events with seq > cursor
 * (cursor-based replay; omit or pass 0 to receive every buffered event).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  if (!isValidJobId(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid job id' })
  }

  const cursorRaw = getQuery(event).cursor
  const cursor = cursorRaw === undefined ? 0 : Number(cursorRaw)
  if (!Number.isFinite(cursor) || cursor < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Cursor must be a non-negative number' })
  }

  const queue = getJobQueue()
  await queue.ready
  const job = await queue.getJob(id)
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  return { job: toJobSummary(job), events: eventsAfter(job, cursor) }
})
