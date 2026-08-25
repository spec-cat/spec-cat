import { describe, expect, test } from 'bun:test'
import {
  analysisIsClean,
  reviewIsClean,
  runSpecWorkflow,
  type SpecWorkflowRecord
} from '../server/utils/spec-workflow-runner'
import type { JobRecord } from '../server/utils/job-queue'

function completedJob(id: string, message = ''): JobRecord {
  const now = new Date().toISOString()
  return {
    id,
    sessionId: 'conv-test-session',
    provider: 'codex',
    prompt: '',
    status: 'done',
    events: [],
    createdAt: now,
    result: { lastAssistantMessage: message }
  }
}

describe('spec workflow runner', () => {
  test('creates the workflow conversation on the requested branch', async () => {
    let creation: Parameters<Parameters<typeof runSpecWorkflow>[1]['createSession']>[0] | undefined
    const workflow = await runSpecWorkflow({
      featureId: '039-reviews',
      provider: 'codex',
      branch: 'automation/039-reviews',
      baseBranch: 'develop',
      repairPlanning: false
    }, {
      async createSession(options) {
        creation = options
        return { id: 'conv-test-session' }
      },
      async runJob(_sessionId, prompt) {
        return completedJob('job-1', prompt.includes('REVIEW_STATUS') ? 'REVIEW_STATUS: CLEAN' : 'done')
      }
    })

    expect(creation).toEqual({
      provider: 'codex',
      branch: 'automation/039-reviews',
      baseBranch: 'develop'
    })
    expect(workflow.branch).toBe('automation/039-reviews')
  })

  test('resets context and stops after a clean review', async () => {
    const prompts: string[] = []
    const snapshots: SpecWorkflowRecord[] = []
    let jobNumber = 0
    const workflow = await runSpecWorkflow({
      featureId: '039-reviews',
      provider: 'codex',
      maxReviewRounds: 3
    }, {
      async createSession() { return { id: 'conv-test-session' } },
      async runJob(_sessionId, prompt) {
        prompts.push(prompt)
        jobNumber += 1
        const message = prompt.startsWith('Determine whether')
          ? 'ANALYZE_STATUS: CLEAN'
          : prompt.includes('REVIEW_STATUS')
            ? 'No findings. REVIEW_STATUS: CLEAN'
            : 'done'
        return completedJob(`job-${jobNumber}`, message)
      },
      async persist(record) { snapshots.push(structuredClone(record)) }
    })

    expect(workflow.status).toBe('done')
    expect(workflow.round).toBe(1)
    expect(prompts.filter((prompt) => prompt === '/new')).toHaveLength(6)
    expect(prompts[prompts.findIndex((prompt) => prompt.startsWith('Determine whether')) - 1]).toBe('/new')
    expect(prompts).toContain('$speckit-plan 039-reviews')
    expect(prompts).toContain('$speckit-tasks 039-reviews')
    expect(prompts).toContain('$speckit-analyze 039-reviews')
    expect(prompts.some((prompt) => prompt.startsWith('Fix all findings'))).toBe(false)
    expect(snapshots.at(-1)?.status).toBe('done')
  })

  test('fixes findings and retries review up to the configured round', async () => {
    const prompts: string[] = []
    let reviews = 0
    const workflow = await runSpecWorkflow({
      featureId: '039-reviews',
      provider: 'claude',
      maxReviewRounds: 2
    }, {
      async createSession() { return { id: 'conv-test-session' } },
      async runJob(_sessionId, prompt) {
        prompts.push(prompt)
        if (prompt.startsWith('Determine whether')) {
          return completedJob(`job-${prompts.length}`, 'ANALYZE_STATUS: CLEAN')
        }
        if (prompt.includes('REVIEW_STATUS')) reviews += 1
        return completedJob(`job-${prompts.length}`, reviews >= 2 && prompt.includes('REVIEW_STATUS')
          ? 'REVIEW_STATUS: CLEAN'
          : 'Finding: missing test\nREVIEW_STATUS: FINDINGS')
      }
    })

    expect(workflow.status).toBe('done')
    expect(workflow.round).toBe(2)
    expect(prompts.filter((prompt) => prompt === '/new')).toHaveLength(8)
    expect(prompts[prompts.findIndex((prompt) => prompt.startsWith('Fix all findings')) - 1]).toBe('/new')
    expect(prompts.filter((prompt) => prompt.startsWith('Fix all findings'))).toHaveLength(1)
  })

  test('recognizes only the explicit clean marker', () => {
    expect(reviewIsClean('REVIEW_STATUS: CLEAN')).toBe(true)
    expect(reviewIsClean('Everything looks fine')).toBe(false)
    expect(analysisIsClean('ANALYZE_STATUS: CLEAN')).toBe(true)
    expect(analysisIsClean('No issues found')).toBe(false)
  })

  test('skips planning repair when existing artifacts have no FR errors', async () => {
    const prompts: string[] = []
    const workflow = await runSpecWorkflow({
      featureId: '001-clean',
      provider: 'codex',
      repairPlanning: false
    }, {
      async createSession() { return { id: 'conv-test-session' } },
      async runJob(_sessionId, prompt) {
        prompts.push(prompt)
        return completedJob(`job-${prompts.length}`, prompt.includes('REVIEW_STATUS')
          ? 'REVIEW_STATUS: CLEAN'
          : 'done')
      }
    })

    expect(workflow.status).toBe('done')
    expect(prompts).not.toContain('$speckit-plan 001-clean')
    expect(prompts).toContain('$speckit-implement 001-clean')
  })

  test('rebuilds plan and tasks when analyze still has findings', async () => {
    const prompts: string[] = []
    let checks = 0
    const workflow = await runSpecWorkflow({
      featureId: '039-reviews',
      provider: 'codex',
      maxPlanningRounds: 2
    }, {
      async createSession() { return { id: 'conv-test-session' } },
      async runJob(_sessionId, prompt) {
        prompts.push(prompt)
        if (prompt.startsWith('Determine whether')) {
          checks += 1
          return completedJob(`job-${prompts.length}`, checks === 2
            ? 'ANALYZE_STATUS: CLEAN'
            : 'ANALYZE_STATUS: FINDINGS')
        }
        if (prompt.includes('REVIEW_STATUS')) {
          return completedJob(`job-${prompts.length}`, 'REVIEW_STATUS: CLEAN')
        }
        return completedJob(`job-${prompts.length}`, 'FR-001 is missing from tasks')
      }
    })

    expect(workflow.status).toBe('done')
    expect(workflow.planningRound).toBe(2)
    expect(prompts.filter((prompt) => prompt === '$speckit-plan 039-reviews')).toHaveLength(2)
    expect(prompts.filter((prompt) => prompt === '$speckit-tasks 039-reviews')).toHaveLength(2)
    expect(prompts.filter((prompt) => prompt === '$speckit-analyze 039-reviews')).toHaveLength(2)
  })
})
