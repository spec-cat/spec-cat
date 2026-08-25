import type { ProviderId } from './session-store'
import type { JobRecord } from './job-queue'

export type SpecWorkflowStatus = 'running' | 'done' | 'failed'
export type SpecWorkflowStage =
  | 'better-spec'
  | 'reset'
  | 'plan'
  | 'tasks'
  | 'analyze'
  | 'analyze-check'
  | 'implement'
  | 'review'
  | 'fix'

export type SpecWorkflowRecord = {
  id: string
  featureId: string
  sessionId: string
  provider: ProviderId
  status: SpecWorkflowStatus
  stage: SpecWorkflowStage
  round: number
  planningRound: number
  maxPlanningRounds: number
  maxReviewRounds: number
  jobs: string[]
  createdAt: string
  updatedAt: string
  error?: string
}

export type SpecWorkflowDependencies = {
  createSession: (options: { provider: ProviderId; baseBranch?: string }) => Promise<{ id: string }>
  runJob: (sessionId: string, prompt: string) => Promise<JobRecord>
  renderBetterSpec?: (featureId: string) => Promise<string>
  persist?: (workflow: SpecWorkflowRecord) => Promise<void>
}

export async function runSpecWorkflow(input: {
  featureId: string
  provider: ProviderId
  baseBranch?: string
  repairPlanning?: boolean
  maxPlanningRounds?: number
  maxReviewRounds?: number
}, dependencies: SpecWorkflowDependencies, existing?: SpecWorkflowRecord): Promise<SpecWorkflowRecord> {
  const maxPlanningRounds = Math.min(10, Math.max(1, input.maxPlanningRounds ?? 3))
  const maxReviewRounds = Math.min(10, Math.max(1, input.maxReviewRounds ?? 3))
  const workflow = existing || createSpecWorkflowRecord({ ...input, maxPlanningRounds, maxReviewRounds })

  const save = async () => {
    workflow.updatedAt = new Date().toISOString()
    await dependencies.persist?.(workflow)
  }
  const run = async (stage: SpecWorkflowStage, prompt: string) => {
    workflow.stage = stage
    await save()
    if (!workflow.sessionId) throw new Error('Workflow session is not ready')
    const job = await dependencies.runJob(workflow.sessionId, prompt)
    workflow.jobs.push(job.id)
    await save()
    if (job.status !== 'done') throw new Error(job.error || `${stage} job ${job.status}`)
    return job.result?.lastAssistantMessage || ''
  }
  const reset = () => run('reset', '/new')

  try {
    const session = await dependencies.createSession({ provider: input.provider, baseBranch: input.baseBranch })
    workflow.sessionId = session.id
    await save()
    let planningClean = input.repairPlanning === false
    let analysis = ''
    for (let planningRound = 1; !planningClean && planningRound <= maxPlanningRounds; planningRound++) {
      workflow.planningRound = planningRound
      const betterSpec = dependencies.renderBetterSpec
        ? await dependencies.renderBetterSpec(input.featureId)
        : betterSpecPrompt(input.featureId)
      await run('better-spec', analysis
        ? `${betterSpec}\n\nPrevious analyze findings that must also be resolved:\n${analysis}`
        : betterSpec)
      await reset()
      await run('plan', speckitPrompt(input.provider, 'plan', input.featureId))
      await reset()
      await run('tasks', speckitPrompt(input.provider, 'tasks', input.featureId))
      await reset()
      analysis = await run('analyze', speckitPrompt(input.provider, 'analyze', input.featureId))
      const check = await run('analyze-check', analyzeCheckPrompt(input.featureId, analysis))
      if (analysisIsClean(check)) {
        planningClean = true
        break
      }
      analysis = `${analysis}\n\nValidation summary:\n${check}`
      await reset()
    }
    if (!planningClean) {
      throw new Error(`Planning artifacts still have findings after ${maxPlanningRounds} rounds`)
    }
    await reset()
    await run('implement', implementPrompt(input.featureId, input.provider))

    for (let round = 1; round <= maxReviewRounds; round++) {
      workflow.round = round
      await reset()
      const review = await run('review', reviewPrompt(input.featureId))
      if (reviewIsClean(review)) break
      await run('fix', fixPrompt(input.featureId, review))
    }

    workflow.status = 'done'
    await save()
    return workflow
  } catch (error) {
    workflow.status = 'failed'
    workflow.error = error instanceof Error ? error.message : String(error)
    await save()
    return workflow
  }
}

export function createSpecWorkflowRecord(input: {
  featureId: string
  provider: ProviderId
  maxPlanningRounds?: number
  maxReviewRounds?: number
}): SpecWorkflowRecord {
  const now = new Date().toISOString()
  return {
    id: `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    featureId: input.featureId,
    sessionId: '',
    provider: input.provider,
    status: 'running',
    stage: 'better-spec',
    round: 0,
    planningRound: 0,
    maxPlanningRounds: Math.min(10, Math.max(1, input.maxPlanningRounds ?? 3)),
    maxReviewRounds: Math.min(10, Math.max(1, input.maxReviewRounds ?? 3)),
    jobs: [],
    createdAt: now,
    updatedAt: now
  }
}

export function reviewIsClean(message: string) {
  return /REVIEW_STATUS\s*:\s*CLEAN/i.test(message)
}

export function analysisIsClean(message: string) {
  return /ANALYZE_STATUS\s*:\s*CLEAN/i.test(message)
}

function betterSpecPrompt(featureId: string) {
  return `Run better-spec for specs/${featureId}. Apply every finding to spec.md, plan.md, and tasks.md, then revalidate them.`
}

function implementPrompt(featureId: string, provider: ProviderId) {
  return speckitPrompt(provider, 'implement', featureId)
}

function speckitPrompt(provider: ProviderId, step: string, featureId: string) {
  return provider === 'codex'
    ? `$speckit-${step} ${featureId}`
    : `/speckit.${step} ${featureId}`
}

function analyzeCheckPrompt(featureId: string, analysis: string) {
  return `Determine whether the latest speckit analyze result for specs/${featureId} contains any actionable consistency, coverage, ambiguity, or quality findings. Do not edit files. End with exactly ANALYZE_STATUS: CLEAN when there are no findings; otherwise end with ANALYZE_STATUS: FINDINGS.\n\nAnalyze result:\n${analysis}`
}

function reviewPrompt(featureId: string) {
  return `Review the implementation against specs/${featureId}/spec.md, plan.md, and tasks.md. Fix nothing in this turn. End with exactly REVIEW_STATUS: CLEAN when there are no findings; otherwise end with REVIEW_STATUS: FINDINGS.`
}

function fixPrompt(featureId: string, review: string) {
  return `Fix all findings from the review of specs/${featureId}. Update specifications and tests when behavior changes, then run the required quality gates.\n\nReview findings:\n${review}`
}
