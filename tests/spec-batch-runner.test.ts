import { describe, expect, test } from 'bun:test'
import {
  createSpecBatchRecord,
  runSpecBatch,
  selectBatchFeatures
} from '../server/utils/spec-batch-runner'
import { analyzePlanningRepair } from '../server/utils/traceability'

const features = [
  { featureId: '001-clean', alerts: [] },
  { featureId: '002-plan-gap', alerts: ['FR-001 not referenced in plan.md'] },
  { featureId: '003-task-gap', alerts: ['FR-002 not referenced in tasks.md'] }
]

describe('spec batch runner', () => {
  test('repairs planning when documents or functional requirements are missing', () => {
    expect(analyzePlanningRepair({ spec: null, plan: null, tasks: null }).alerts).toContain('spec.md is missing')
    expect(analyzePlanningRepair({ spec: '# Spec', plan: '# Plan', tasks: '# Tasks' }).alerts)
      .toContain('spec.md defines no FR-### requirements')
  })

  test('selects all features and marks only traceability errors for planning repair', () => {
    expect(selectBatchFeatures(features).map((item) => item.featureId)).toEqual([
      '001-clean', '002-plan-gap',
      '003-task-gap'
    ])
    expect(selectBatchFeatures(features).map((item) => item.repairPlanning)).toEqual([
      false, true, true
    ])
  })

  test('runs selected workflows sequentially', async () => {
    const batch = createSpecBatchRecord({ provider: 'codex', features })
    const started: string[] = []
    const completed: string[] = []

    await runSpecBatch(batch, {
      async runWorkflow(item) {
        started.push(item.featureId)
        expect(started.length).toBe(completed.length + 1)
        completed.push(item.featureId)
        return { id: `workflow-${item.featureId}`, status: 'done' }
      }
    })

    expect(batch.status).toBe('done')
    expect(started).toEqual(['001-clean', '002-plan-gap', '003-task-gap'])
    expect(batch.items.map((item) => item.status)).toEqual(['done', 'done', 'done'])
  })

  test('stops after the first failed workflow', async () => {
    const batch = createSpecBatchRecord({ provider: 'codex', features })
    const started: string[] = []

    await runSpecBatch(batch, {
      async runWorkflow(item) {
        started.push(item.featureId)
        return { id: `workflow-${item.featureId}`, status: 'failed', error: 'quality gate failed' }
      }
    })

    expect(batch.status).toBe('failed')
    expect(started).toEqual(['001-clean'])
    expect(batch.items[0]?.status).toBe('failed')
    expect(batch.items[1]?.status).toBe('pending')
    expect(batch.error).toContain('quality gate failed')
  })

  test('still implements features when there are no FR errors', async () => {
    const batch = createSpecBatchRecord({
      provider: 'codex',
      features: [{ featureId: '001-clean', alerts: [] }]
    })
    let runs = 0
    await runSpecBatch(batch, {
      async runWorkflow() {
        runs += 1
        return { id: 'workflow-clean', status: 'done' }
      }
    })
    expect(batch.status).toBe('done')
    expect(runs).toBe(1)
    expect(batch.items[0]?.repairPlanning).toBe(false)
  })
})
