import { getJobQueue } from '../utils/job-executor'
import { toJobSummary } from '../utils/job-queue'

/** GET /api/jobs — most recent 100 jobs, newest first, without event buffers. */
export default defineEventHandler(async () => {
  const queue = getJobQueue()
  await queue.ready
  const jobs = await queue.listJobs(100)
  return { jobs: jobs.map(toJobSummary) }
})
