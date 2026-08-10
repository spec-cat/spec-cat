/**
 * Browserless job queue: server-side turn lifecycle for AI CLI conversations.
 *
 * A job is one prompt submitted to an existing conversation's tmux session
 * without a browser attached. The queue owns ordering (one job at a time per
 * session), the status machine (queued → running → done/failed/cancelled),
 * event buffering with monotonically increasing per-job sequence numbers
 * (cursor-based replay = "events with seq > N"), and JSONL persistence under
 * STORE_ROOT/jobs/<jobId>.json.
 *
 * The actual terminal interaction (tmux send-keys, turn-completion detection)
 * is behind the injectable JobExecutor interface — see job-executor.ts for
 * the real tmux-backed implementation; tests inject a fake.
 */
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProviderId } from './session-store'
import { STORE_ROOT } from './session-store'

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export type JobEvent = {
  /** Monotonically increasing per job, starting at 1. */
  seq: number
  type: string
  data?: unknown
  at: string
}

export type JobResult = {
  lastAssistantMessage?: string
}

export type JobRecord = {
  id: string
  sessionId: string
  provider: ProviderId
  prompt: string
  status: JobStatus
  events: JobEvent[]
  createdAt: string
  startedAt?: string
  finishedAt?: string
  /** Failure reason when status is 'failed'. */
  error?: string
  result?: JobResult
}

/** Job record without the event buffer, for list/status responses. */
export type JobSummary = Omit<JobRecord, 'events'> & { eventCount: number }

export type EmitJobEvent = (type: string, data?: unknown) => void

export type JobExecutor = {
  /**
   * Validates the target session (exists, not archived/finalized, tmux alive)
   * and submits the prompt to the terminal. Throws to fail the job.
   */
  submit: (job: JobRecord, emit: EmitJobEvent) => Promise<void>
  /**
   * Resolves when the provider turn completes, optionally with a result.
   * Should stop watching promptly once `signal` aborts (cancel or timeout).
   */
  waitForCompletion: (
    job: JobRecord,
    emit: EmitJobEvent,
    signal: AbortSignal
  ) => Promise<JobResult | undefined>
  /** Best-effort interruption of a running job (e.g. tmux send-keys Escape). */
  cancel?: (job: JobRecord) => void | Promise<void>
}

export type JobQueueOptions = {
  executor: JobExecutor
  /** Persistence directory. Defaults to STORE_ROOT/jobs. */
  jobsDir?: string
  /** Hard per-job execution timeout. Defaults to 15 minutes. */
  timeoutMs?: number
}

export type JobListener = (job: JobRecord, event: JobEvent) => void

export type JobQueue = {
  /** Resolves once on-disk reconciliation of interrupted jobs has finished. */
  ready: Promise<void>
  enqueue: (input: { sessionId: string; provider: ProviderId; prompt: string }) => JobRecord
  /** Cancels a queued or running job. Throws when the job is already terminal. */
  cancel: (jobId: string) => Promise<JobRecord>
  /** Synchronous in-memory lookup (jobs created by this process). */
  peekJob: (jobId: string) => JobRecord | null
  /** In-memory lookup with on-disk fallback for jobs from earlier runs. */
  getJob: (jobId: string) => Promise<JobRecord | null>
  /** Most recent jobs (in-memory + on-disk), newest first. */
  listJobs: (limit?: number) => Promise<JobRecord[]>
  /** Subscribes to every event appended to a job. Returns an unsubscribe fn. */
  onJobEvent: (jobId: string, listener: JobListener) => () => void
  /** Resolves with the job once it reaches a terminal status. */
  waitForJob: (jobId: string) => Promise<JobRecord>
}

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000
const JOB_ID_RE = /^[a-zA-Z0-9_-]{4,80}$/
const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set(['done', 'failed', 'cancelled'])

export function isTerminalJobStatus(status: JobStatus) {
  return TERMINAL_STATUSES.has(status)
}

export function isValidJobId(value: unknown): value is string {
  return typeof value === 'string' && JOB_ID_RE.test(value)
}

export function generateJobId() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Returns the job's events with seq greater than `cursor` (replay cursor). */
export function eventsAfter(job: JobRecord, cursor: number): JobEvent[] {
  if (!Number.isFinite(cursor) || cursor <= 0) return [...job.events]
  return job.events.filter((event) => event.seq > cursor)
}

export function toJobSummary(job: JobRecord): JobSummary {
  const { events, ...rest } = job
  return { ...rest, eventCount: events.length }
}

export function createJobQueue(options: JobQueueOptions): JobQueue {
  const executor = options.executor
  const jobsDir = options.jobsDir || join(STORE_ROOT, 'jobs')
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const jobs = new Map<string, JobRecord>()
  const sessionChains = new Map<string, Promise<void>>()
  const runControllers = new Map<string, AbortController>()
  const listeners = new Map<string, Set<JobListener>>()
  const persistChains = new Map<string, Promise<void>>()

  const persist = (job: JobRecord) => {
    const snapshot = JSON.stringify(job, null, 2)
    const previous = persistChains.get(job.id) || Promise.resolve()
    const next = previous.catch(() => {}).then(async () => {
      await mkdir(jobsDir, { recursive: true })
      const target = join(jobsDir, `${job.id}.json`)
      const temporary = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
      try {
        await writeFile(temporary, `${snapshot}\n`, { flag: 'wx' })
        await rename(temporary, target)
      } finally {
        await rm(temporary, { force: true }).catch(() => {})
      }
    })
    persistChains.set(job.id, next)
    void next.finally(() => {
      if (persistChains.get(job.id) === next) persistChains.delete(job.id)
    }).catch(() => {})
    return next
  }

  const appendEvent = (job: JobRecord, type: string, data?: unknown): JobEvent => {
    const seq = (job.events[job.events.length - 1]?.seq ?? 0) + 1
    const event: JobEvent = { seq, type, at: new Date().toISOString() }
    if (data !== undefined) event.data = data
    job.events.push(event)
    persist(job)
    for (const listener of listeners.get(job.id) ?? []) {
      try {
        listener(job, event)
      } catch {
        // A broken subscriber must never break the job lifecycle.
      }
    }
    return event
  }

  const transition = (job: JobRecord, status: JobStatus, data?: unknown) => {
    job.status = status
    const now = new Date().toISOString()
    if (status === 'running') job.startedAt = now
    if (isTerminalJobStatus(status)) job.finishedAt = now
    appendEvent(job, status, data)
  }

  const runJob = async (job: JobRecord) => {
    // Cancelled while still queued — skip without touching the record.
    if (job.status !== 'queued') return

    const controller = new AbortController()
    runControllers.set(job.id, controller)
    transition(job, 'running')

    try {
      await executor.submit(job, (type, data) => appendEvent(job, type, data))
      if ((job.status as JobStatus) !== 'running') return
      appendEvent(job, 'submitted')

      const result = await withTimeout(
        executor.waitForCompletion(job, (type, data) => appendEvent(job, type, data), controller.signal),
        timeoutMs,
        controller
      )
      if ((job.status as JobStatus) !== 'running') return
      if (result) job.result = result
      transition(job, 'done', result ? { result } : undefined)
    } catch (error) {
      // A cancel may have won the race while the executor was unwinding.
      if ((job.status as JobStatus) !== 'running') return
      job.error = error instanceof Error ? error.message : String(error)
      transition(job, 'failed', { error: job.error })
    } finally {
      runControllers.delete(job.id)
    }
  }

  const enqueue: JobQueue['enqueue'] = ({ sessionId, provider, prompt }) => {
    const job: JobRecord = {
      id: generateJobId(),
      sessionId,
      provider,
      prompt,
      status: 'queued',
      events: [],
      createdAt: new Date().toISOString()
    }
    jobs.set(job.id, job)
    appendEvent(job, 'queued')

    // One job at a time per session: chain onto the session's previous run.
    const previous = sessionChains.get(sessionId) || Promise.resolve()
    const next = previous.catch(() => {}).then(() => runJob(job))
    sessionChains.set(sessionId, next)
    void next.finally(() => {
      if (sessionChains.get(sessionId) === next) sessionChains.delete(sessionId)
    }).catch(() => {})

    return job
  }

  const cancel: JobQueue['cancel'] = async (jobId) => {
    const job = jobs.get(jobId)
    if (!job) throw new JobQueueError('not_found', `Unknown job: ${jobId}`)
    if (isTerminalJobStatus(job.status)) {
      throw new JobQueueError('not_cancellable', `Job is already ${job.status}`)
    }

    const wasRunning = job.status === 'running'
    transition(job, 'cancelled')

    if (wasRunning) {
      runControllers.get(job.id)?.abort()
      try {
        await executor.cancel?.(job)
      } catch {
        // Best-effort: the job is already marked cancelled.
      }
    }
    return job
  }

  const peekJob: JobQueue['peekJob'] = (jobId) => jobs.get(jobId) ?? null

  const getJob: JobQueue['getJob'] = async (jobId) => {
    if (!isValidJobId(jobId)) return null
    return jobs.get(jobId) ?? (await readJobFile(jobsDir, jobId))
  }

  const listJobs: JobQueue['listJobs'] = async (limit = 100) => {
    let ids: string[] = []
    try {
      ids = (await readdir(jobsDir))
        .filter((name) => name.endsWith('.json'))
        .map((name) => name.slice(0, -'.json'.length))
    } catch {
      ids = []
    }
    for (const id of jobs.keys()) if (!ids.includes(id)) ids.push(id)

    const records = await Promise.all(
      ids.map(async (id) => jobs.get(id) ?? (await readJobFile(jobsDir, id)))
    )
    return records
      .filter((job): job is JobRecord => Boolean(job))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  const onJobEvent: JobQueue['onJobEvent'] = (jobId, listener) => {
    let set = listeners.get(jobId)
    if (!set) {
      set = new Set()
      listeners.set(jobId, set)
    }
    set.add(listener)
    return () => {
      set.delete(listener)
      if (set.size === 0) listeners.delete(jobId)
    }
  }

  const waitForJob: JobQueue['waitForJob'] = (jobId) => {
    const job = jobs.get(jobId)
    if (!job) return Promise.reject(new JobQueueError('not_found', `Unknown job: ${jobId}`))
    if (isTerminalJobStatus(job.status)) return Promise.resolve(job)
    return new Promise((resolve) => {
      const unsubscribe = onJobEvent(jobId, (current) => {
        if (!isTerminalJobStatus(current.status)) return
        unsubscribe()
        resolve(current)
      })
    })
  }

  // Cheap restart reconciliation: any job left queued/running on disk belongs
  // to a previous server process and can never make progress again.
  const ready = reconcileInterruptedJobs(jobsDir)

  return { ready, enqueue, cancel, peekJob, getJob, listJobs, onJobEvent, waitForJob }
}

export class JobQueueError extends Error {
  constructor(public code: 'not_found' | 'not_cancellable', message: string) {
    super(message)
    this.name = 'JobQueueError'
  }
}

async function reconcileInterruptedJobs(jobsDir: string) {
  let names: string[] = []
  try {
    names = (await readdir(jobsDir)).filter((name) => name.endsWith('.json'))
  } catch {
    return
  }

  for (const name of names) {
    const id = name.slice(0, -'.json'.length)
    const job = await readJobFile(jobsDir, id)
    if (!job || isTerminalJobStatus(job.status)) continue

    job.status = 'failed'
    job.error = 'interrupted by restart'
    job.finishedAt = new Date().toISOString()
    job.events.push({
      seq: (job.events[job.events.length - 1]?.seq ?? 0) + 1,
      type: 'failed',
      data: { error: job.error },
      at: job.finishedAt
    })

    const target = join(jobsDir, name)
    const temporary = `${target}.${process.pid}.reconcile.tmp`
    try {
      await writeFile(temporary, `${JSON.stringify(job, null, 2)}\n`)
      await rename(temporary, target)
    } catch {
      await rm(temporary, { force: true }).catch(() => {})
    }
  }
}

async function readJobFile(jobsDir: string, jobId: string): Promise<JobRecord | null> {
  if (!isValidJobId(jobId)) return null
  try {
    const raw = await readFile(join(jobsDir, `${jobId}.json`), 'utf8')
    const parsed = JSON.parse(raw) as JobRecord
    if (!parsed || typeof parsed !== 'object' || parsed.id !== jobId || !parsed.sessionId) return null
    if (!Array.isArray(parsed.events)) parsed.events = []
    return parsed
  } catch {
    return null
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, controller: AbortController): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`Job timed out after ${Math.round(ms / 1000)}s`))
    }, ms)
    timer.unref?.()
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
