import type { Dirent } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { projectDir } from './project-dir'
import { STORE_ROOT, type ProviderId } from './session-store'
import { analyzePlanningRepair } from './traceability'
import {
  createSpecBatchRecord,
  runSpecBatch,
  type SpecBatchRecord,
  type TraceabilityCandidate
} from './spec-batch-runner'
import { startSpecWorkflow, waitForSpecWorkflow } from './spec-workflows'

const batches = new Map<string, SpecBatchRecord>()
const batchesDir = join(STORE_ROOT, 'batches')

export async function startSpecBatch(input: {
  provider: ProviderId
  baseBranch?: string
  maxPlanningRounds?: number
  maxReviewRounds?: number
}) {
  const features = await scanTraceabilityCandidates()
  const batch = createSpecBatchRecord({ ...input, features })
  batches.set(batch.id, batch)
  await persist(batch)

  void runSpecBatch(batch, {
    async runWorkflow(item) {
      const workflow = startSpecWorkflow({
        featureId: item.featureId,
        provider: input.provider,
        baseBranch: input.baseBranch,
        repairPlanning: item.repairPlanning,
        maxPlanningRounds: input.maxPlanningRounds,
        maxReviewRounds: input.maxReviewRounds
      })
      const completed = await waitForSpecWorkflow(workflow.id)
      if (!completed || completed.status === 'running') return {
        id: workflow.id,
        status: 'failed' as const,
        error: completed ? 'Workflow did not reach a terminal state' : 'Workflow disappeared'
      }
      return { id: completed.id, status: completed.status, error: completed.error }
    },
    persist: async (record) => {
      batches.set(record.id, record)
      await persist(record)
    }
  })
  return batch
}

export async function getSpecBatch(id: string) {
  const live = batches.get(id)
  if (live) return live
  try {
    return JSON.parse(await readFile(join(batchesDir, `${id}.json`), 'utf8')) as SpecBatchRecord
  } catch {
    return null
  }
}

export async function inspectSpecFeature(featureId: string): Promise<TraceabilityCandidate | null> {
  const featureDir = join(projectDir(), 'specs', featureId)
  const readOptional = async (filename: string) => {
    try { return await readFile(join(featureDir, filename), 'utf8') } catch { return null }
  }
  const [spec, plan, tasks] = await Promise.all([
    readOptional('spec.md'),
    readOptional('plan.md'),
    readOptional('tasks.md')
  ])
  if (spec === null && plan === null && tasks === null) return null
  return { featureId, alerts: analyzePlanningRepair({ spec, plan, tasks }).alerts }
}

async function scanTraceabilityCandidates(): Promise<TraceabilityCandidate[]> {
  const specsRoot = join(projectDir(), 'specs')
  let entries: Dirent[] = []
  try { entries = await readdir(specsRoot, { withFileTypes: true }) } catch { return [] }

  const candidates: TraceabilityCandidate[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue
    const candidate = await inspectSpecFeature(entry.name)
    if (candidate) candidates.push(candidate)
  }
  return candidates
}

async function persist(record: SpecBatchRecord) {
  await mkdir(batchesDir, { recursive: true })
  const target = join(batchesDir, `${record.id}.json`)
  const temporary = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' })
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true }).catch(() => {})
  }
}
