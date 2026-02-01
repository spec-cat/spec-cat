import type { IndexRuntimeState, ReindexResponse } from '~/types/specSearch'
import { existsSync } from 'node:fs'
import { getProjectDir } from '../projectDir'
import { getSpecSearchDatabase } from './database'
import { isEmbeddingModelLoaded } from './embeddings'
import { reindexAll, reconcileIndexedFiles } from './indexer'
import { logger } from '../logger'

const POLL_INTERVAL_MS = 30_000

const runtimeState: IndexRuntimeState = {
  isIndexing: false,
  currentJob: null,
  lastScanAt: null,
  lastIndexedAt: null,
  schedulerActive: false,
  pollIntervalSeconds: POLL_INTERVAL_MS / 1000,
}

let timer: NodeJS.Timeout | null = null
let startupPromise: Promise<void> | null = null
const log = logger.specSearch

async function runJob(job: 'startup-reconcile' | 'poll-scan' | 'manual-reindex', forceFull = false): Promise<ReindexResponse> {
  if (runtimeState.isIndexing) {
    log.debug('Spec search job skipped because another job is running', {
      requestedJob: job,
      currentJob: runtimeState.currentJob,
    })
    return {
      success: false,
      status: 'already-indexing',
      filesIndexed: 0,
      chunksCreated: 0,
      skippedUnchanged: 0,
      duration: 0,
    }
  }

  runtimeState.isIndexing = true
  runtimeState.currentJob = job

  const start = Date.now()
  log.info('Spec search job started', {
    job,
    forceFull,
    projectDir: getProjectDir(),
  })

  try {
    const db = getSpecSearchDatabase()
    await db.init()
    const hasPersistedDb = db.isSqliteAvailable() && existsSync(db.getPath())
    log.debug('Spec search DB state before job execution', {
      job,
      dbPath: db.getPath(),
      dbExists: existsSync(db.getPath()),
      sqliteAvailable: db.isSqliteAvailable(),
      initError: db.getInitError(),
      hasPersistedDb,
    })

    let result: ReindexResponse
    if (forceFull) {
      await db.clearAll()
      result = await reindexAll(getProjectDir())
    } else if (job === 'manual-reindex') {
      if (!hasPersistedDb) {
        await db.clearAll()
      }
      result = await reindexAll(getProjectDir())
    } else {
      const delta = await reconcileIndexedFiles(getProjectDir())
      result = {
        success: true,
        status: 'completed',
        filesIndexed: delta.newOrChanged,
        chunksCreated: 0,
        skippedUnchanged: 0,
        duration: Date.now() - start,
      }
    }

    const now = new Date().toISOString()
    runtimeState.lastScanAt = now
    if (result.success) {
      runtimeState.lastIndexedAt = now
    }

    log.info('Spec search job completed', {
      job,
      success: result.success,
      status: result.status,
      filesIndexed: result.filesIndexed,
      chunksCreated: result.chunksCreated,
      skippedUnchanged: result.skippedUnchanged,
      durationMs: Date.now() - start,
    })

    return result
  } catch (error) {
    log.error('Spec search job failed with exception', {
      job,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      success: false,
      status: 'failed',
      filesIndexed: 0,
      chunksCreated: 0,
      skippedUnchanged: 0,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    runtimeState.isIndexing = false
    runtimeState.currentJob = null
  }
}

export async function startSpecSearchScheduler(): Promise<void> {
  if (startupPromise) return startupPromise

  startupPromise = (async () => {
    runtimeState.schedulerActive = true
    log.info('Spec search scheduler started', { pollIntervalMs: POLL_INTERVAL_MS })
    await runJob('startup-reconcile')

    if (timer) clearInterval(timer)
    timer = setInterval(() => {
      void runJob('poll-scan')
    }, POLL_INTERVAL_MS)
  })()

  return startupPromise
}

export function stopSpecSearchScheduler(): void {
  runtimeState.schedulerActive = false
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  log.info('Spec search scheduler stopped')
}

export async function triggerManualReindex(options?: { force?: boolean }): Promise<ReindexResponse> {
  return runJob('manual-reindex', Boolean(options?.force))
}

export async function getSpecSearchStatus() {
  const db = getSpecSearchDatabase()
  await db.init()
  const counts = await db.getCounts()
  const dbPath = db.getPath()
  const dbExists = existsSync(dbPath)

  log.debug('Spec search status requested', {
    fileCount: counts.fileCount,
    chunkCount: counts.chunkCount,
    dbPath,
    dbExists,
    sqliteAvailable: db.isSqliteAvailable(),
    initError: db.getInitError(),
    currentJob: runtimeState.currentJob,
    isIndexing: runtimeState.isIndexing,
  })

  return {
    fileCount: counts.fileCount,
    chunkCount: counts.chunkCount,
    lastIndexedAt: runtimeState.lastIndexedAt || counts.lastIndexedAt,
    lastScanAt: runtimeState.lastScanAt,
    isIndexing: runtimeState.isIndexing,
    currentJob: runtimeState.currentJob,
    schedulerActive: runtimeState.schedulerActive,
    pollIntervalSeconds: runtimeState.pollIntervalSeconds,
    modelLoaded: isEmbeddingModelLoaded(),
    vectorEnabled: db.getVectorEnabled(),
    dbPath,
    dbExists,
    sqliteAvailable: db.isSqliteAvailable(),
    initError: db.getInitError(),
  }
}

export function getSpecSearchRuntimeState(): IndexRuntimeState {
  return { ...runtimeState }
}
