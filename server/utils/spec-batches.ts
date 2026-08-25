import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { projectDir } from './project-dir'
import { STORE_ROOT, type ProviderId } from './session-store'
import { analyzeTraceability } from './traceability'
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
      return (await waitForSpecWorkflow(workflow.id)) || {
        id: workflow.id,
        status: 'failed' as const,
        error: 'Workflow disappeared'
      }
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

async function scanTraceabilityCandidates(): Promise<TraceabilityCandidate[]> {
  const specsRoot = join(projectDir(), 'specs')
  let entries: string[] = []
  try { entries = await readdir(specsRoot) } catch { return [] }

  const candidates: TraceabilityCandidate[] = []
  for (const featureId of entries.sort()) {
    const featureDir = join(specsRoot, featureId)
    const readOptional = async (filename: string) => {
      try { return await readFile(join(featureDir, filename), 'utf8') } catch { return null }
    }
    const [spec, plan, tasks] = await Promise.all([
      readOptional('spec.md'),
      readOptional('plan.md'),
      readOptional('tasks.md')
    ])
    if (spec === null && plan === null && tasks === null) continue
    const report = analyzeTraceability({ spec, plan, tasks })
    candidates.push({ featureId, alerts: report.alerts })
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
