import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createAutomationConversation } from '../api/terminal'
import { getJobQueue } from './job-executor'
import { readStoredSession, STORE_ROOT, type ProviderId } from './session-store'
import { renderSkillPrompt } from './skills'
import {
  createSpecWorkflowRecord,
  runSpecWorkflow,
  type SpecWorkflowRecord
} from './spec-workflow-runner'

const workflows = new Map<string, SpecWorkflowRecord>()
const workflowRuns = new Map<string, Promise<SpecWorkflowRecord>>()
const workflowsDir = join(STORE_ROOT, 'workflows')

export function startSpecWorkflow(input: {
  featureId: string
  provider: ProviderId
  branch?: string
  baseBranch?: string
  repairPlanning?: boolean
  maxPlanningRounds?: number
  maxReviewRounds?: number
}) {
  const record = createSpecWorkflowRecord(input)
  workflows.set(record.id, record)
  void persist(record)
  const run = runSpecWorkflow(input, {
    createSession: createAutomationConversation,
    async runJob(sessionId, prompt) {
      const session = await readStoredSession(sessionId)
      if (!session) throw new Error(`Session not found: ${sessionId}`)
      const queue = getJobQueue()
      const job = queue.enqueue({ sessionId, provider: session.provider, prompt })
      return queue.waitForJob(job.id)
    },
    async renderBetterSpec(featureId) {
      const prompt = await renderSkillPrompt('better-spec', featureId)
      if (!prompt) throw new Error('Unable to render better-spec skill')
      return prompt
    },
    persist: async (workflow) => {
      workflows.set(workflow.id, workflow)
      await persist(workflow)
    }
  }, record).catch(async (error) => {
    record.status = 'failed'
    record.error = error instanceof Error ? error.message : String(error)
    record.updatedAt = new Date().toISOString()
    await persist(record)
    return record
  })
  workflowRuns.set(record.id, run)
  void run.finally(() => workflowRuns.delete(record.id))
  return record
}

export async function waitForSpecWorkflow(id: string) {
  const run = workflowRuns.get(id)
  if (run) return run
  return getSpecWorkflow(id)
}

export async function getSpecWorkflow(id: string) {
  const live = workflows.get(id)
  if (live) return live
  try {
    return JSON.parse(await readFile(join(workflowsDir, `${id}.json`), 'utf8')) as SpecWorkflowRecord
  } catch {
    return null
  }
}

async function persist(record: SpecWorkflowRecord) {
  await mkdir(workflowsDir, { recursive: true })
  const target = join(workflowsDir, `${record.id}.json`)
  const temporary = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' })
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true }).catch(() => {})
  }
}
