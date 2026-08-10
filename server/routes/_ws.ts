/**
 * External automation WebSocket API (/_ws).
 *
 * External tools submit chat turns as browserless jobs and follow their event
 * stream live:
 *
 *   -> {"type":"submit","sessionId":"conv-...","prompt":"..."}
 *   <- {"type":"job","jobId":"job-...","sessionId":"conv-...","status":"queued"}
 *   <- {"type":"event","jobId":"job-...","seq":1,"event":"queued","at":"..."}
 *   <- ... (started, submitted, tool, ...)
 *   <- {"type":"done","jobId":"job-...","status":"done","result":{...}}
 *
 *   -> {"type":"subscribe","jobId":"job-...","cursor":3}   // replay seq > 3, then follow
 *
 * Origin policy mirrors the /api/terminal upgrade: same-origin browsers are
 * accepted, cross-origin browsers are rejected, and local automation tools
 * that send no Origin header pass through.
 */
import type { Peer } from 'crossws'
import { readStoredSession } from '../utils/session-store'
import { getJobQueue } from '../utils/job-executor'
import {
  eventsAfter,
  isTerminalJobStatus,
  isValidJobId,
  type JobEvent,
  type JobRecord
} from '../utils/job-queue'

const MAX_PROMPT_BYTES = 32 * 1024

type ClientMessage = {
  type?: string
  sessionId?: string
  prompt?: string
  jobId?: string
  cursor?: number
}

const peerSubscriptions = new WeakMap<Peer, Set<() => void>>()

export default defineWebSocketHandler({
  upgrade(request) {
    const origin = request.headers.get('origin')
    if (!origin) return
    const host = request.headers.get('host')
    try {
      if (host && new URL(origin).host === host) return
    } catch {
      // Malformed Origin header — treat as cross-origin.
    }
    return new Response('Cross-origin WebSocket denied', { status: 403 })
  },

  open(peer) {
    send(peer, { type: 'hello', protocol: 'code-cat-jobs/1' })
  },

  async message(peer, message) {
    let parsed: ClientMessage
    try {
      parsed = JSON.parse(message.text()) as ClientMessage
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object')
    } catch {
      send(peer, { type: 'error', error: 'Messages must be JSON objects' })
      return
    }

    if (parsed.type === 'submit') return handleSubmit(peer, parsed)
    if (parsed.type === 'subscribe') return handleSubscribe(peer, parsed)
    send(peer, { type: 'error', error: `Unknown message type: ${String(parsed.type)}` })
  },

  close(peer) {
    const subscriptions = peerSubscriptions.get(peer)
    if (!subscriptions) return
    for (const unsubscribe of subscriptions) unsubscribe()
    subscriptions.clear()
  }
})

async function handleSubmit(peer: Peer, parsed: ClientMessage) {
  const sessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId : ''
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(sessionId)) {
    return send(peer, { type: 'error', error: 'Invalid session id' })
  }
  const prompt = typeof parsed.prompt === 'string' ? parsed.prompt : ''
  if (!prompt.trim()) {
    return send(peer, { type: 'error', error: 'Prompt must be a non-empty string' })
  }
  if (Buffer.byteLength(prompt, 'utf8') > MAX_PROMPT_BYTES) {
    return send(peer, { type: 'error', error: 'Prompt must be at most 32KB' })
  }

  const session = await readStoredSession(sessionId).catch(() => null)
  if (!session) return send(peer, { type: 'error', error: 'Session not found' })
  if (session.archived) return send(peer, { type: 'error', error: 'Session is archived' })
  if (session.finalized) return send(peer, { type: 'error', error: 'Session is finalized' })

  const queue = getJobQueue()
  const job = queue.enqueue({ sessionId, provider: session.provider, prompt })
  send(peer, { type: 'job', jobId: job.id, sessionId, status: job.status })
  // enqueue() emits its events synchronously, so the live record is in memory
  // and followLiveJob attaches without missing anything.
  followLiveJob(peer, job, 0)
}

async function handleSubscribe(peer: Peer, parsed: ClientMessage) {
  const jobId = parsed.jobId
  if (!isValidJobId(jobId)) {
    return send(peer, { type: 'error', error: 'Invalid job id' })
  }
  const cursor = typeof parsed.cursor === 'number' && Number.isFinite(parsed.cursor) && parsed.cursor > 0
    ? parsed.cursor
    : 0

  const queue = getJobQueue()
  await queue.ready
  const live = queue.peekJob(jobId)
  if (live) return followLiveJob(peer, live, cursor)

  const stored = await queue.getJob(jobId)
  if (!stored) return send(peer, { type: 'error', error: 'Job not found' })
  // Jobs that only exist on disk belong to earlier runs and are terminal
  // (restart reconciliation guarantees it): replay and finish immediately.
  replayEvents(peer, stored, cursor)
  sendDone(peer, stored)
}

/**
 * Replays buffered events past `cursor`, then streams new events until the
 * job reaches a terminal status. Snapshot and subscription happen in the same
 * synchronous slice, so no event can slip between them.
 */
function followLiveJob(peer: Peer, job: JobRecord, cursor: number) {
  let lastSeq = replayEvents(peer, job, cursor)
  if (isTerminalJobStatus(job.status)) return sendDone(peer, job)

  const queue = getJobQueue()
  const unsubscribe = queue.onJobEvent(job.id, (current, event) => {
    if (event.seq > lastSeq) {
      lastSeq = event.seq
      sendEvent(peer, current.id, event)
    }
    if (!isTerminalJobStatus(current.status)) return
    sendDone(peer, current)
    unsubscribe()
    peerSubscriptions.get(peer)?.delete(unsubscribe)
  })

  let subscriptions = peerSubscriptions.get(peer)
  if (!subscriptions) {
    subscriptions = new Set()
    peerSubscriptions.set(peer, subscriptions)
  }
  subscriptions.add(unsubscribe)
}

function replayEvents(peer: Peer, job: JobRecord, cursor: number) {
  let lastSeq = cursor
  for (const event of eventsAfter(job, cursor)) {
    lastSeq = event.seq
    sendEvent(peer, job.id, event)
  }
  return lastSeq
}

function sendEvent(peer: Peer, jobId: string, event: JobEvent) {
  send(peer, { type: 'event', jobId, seq: event.seq, event: event.type, data: event.data, at: event.at })
}

function sendDone(peer: Peer, job: JobRecord) {
  send(peer, { type: 'done', jobId: job.id, status: job.status, result: job.result, error: job.error })
}

function send(peer: Peer, payload: Record<string, unknown>) {
  try {
    peer.send(JSON.stringify(payload))
  } catch {
    // Peer already gone — the close handler cleans up subscriptions.
  }
}
