import type { ProviderId } from './session-store'

export type TraceabilityCandidate = {
  featureId: string
  alerts: string[]
}

export type SpecBatchStatus = 'running' | 'done' | 'failed'
export type SpecBatchItemStatus = 'pending' | 'running' | 'done' | 'failed'

export type SpecBatchItem = {
  featureId: string
  alerts: string[]
  repairPlanning: boolean
  status: SpecBatchItemStatus
  workflowId?: string
  error?: string
}

export type SpecBatchRecord = {
  id: string
  provider: ProviderId
  baseBranch?: string
  maxPlanningRounds: number
  maxReviewRounds: number
  status: SpecBatchStatus
  currentFeatureId?: string
  items: SpecBatchItem[]
  createdAt: string
  updatedAt: string
  error?: string
}

export function selectBatchFeatures(features: TraceabilityCandidate[]) {
  return features
    .map((feature) => ({
      featureId: feature.featureId,
      alerts: [...feature.alerts],
      repairPlanning: feature.alerts.length > 0,
      status: 'pending' as const
    }))
}

export function createSpecBatchRecord(input: {
  provider: ProviderId
  baseBranch?: string
  maxPlanningRounds?: number
  maxReviewRounds?: number
  features: TraceabilityCandidate[]
}): SpecBatchRecord {
  const now = new Date().toISOString()
  return {
    id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    provider: input.provider,
    baseBranch: input.baseBranch,
    maxPlanningRounds: Math.min(10, Math.max(1, input.maxPlanningRounds ?? 3)),
    maxReviewRounds: Math.min(10, Math.max(1, input.maxReviewRounds ?? 3)),
    status: 'running',
    items: selectBatchFeatures(input.features),
    createdAt: now,
    updatedAt: now
  }
}

export async function runSpecBatch(
  batch: SpecBatchRecord,
  dependencies: {
    runWorkflow: (item: SpecBatchItem) => Promise<{ id: string; status: 'done' | 'failed'; error?: string }>
    persist?: (batch: SpecBatchRecord) => Promise<void>
  }
) {
  const save = async () => {
    batch.updatedAt = new Date().toISOString()
    await dependencies.persist?.(batch)
  }

  try {
    for (const item of batch.items) {
      batch.currentFeatureId = item.featureId
      item.status = 'running'
      await save()
      const workflow = await dependencies.runWorkflow(item)
      item.workflowId = workflow.id
      if (workflow.status === 'failed') {
        item.status = 'failed'
        item.error = workflow.error || 'Workflow failed'
        batch.status = 'failed'
        batch.error = `${item.featureId}: ${item.error}`
        await save()
        return batch
      }
      item.status = 'done'
      await save()
    }
    batch.currentFeatureId = undefined
    batch.status = 'done'
    await save()
    return batch
  } catch (error) {
    batch.status = 'failed'
    batch.error = error instanceof Error ? error.message : String(error)
    const active = batch.items.find((item) => item.status === 'running')
    if (active) {
      active.status = 'failed'
      active.error = batch.error
    }
    await save()
    return batch
  }
}
