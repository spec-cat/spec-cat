import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TraceabilityAlert, TraceabilityRequirement, TraceabilityResponse } from '~/types/spec-viewer'

const FR_PATTERN = /\bFR-\d{3}[a-z]?\b/gi
const TASK_LINE_PATTERN = /^\s*-\s+\[( |x|X)\]\s+(.+)$/

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map(v => v.toUpperCase()))).sort()
}

function extractFrIds(content: string): string[] {
  const matches = content.match(FR_PATTERN) ?? []
  return uniqueSorted(matches)
}

function extractTaskFrProgress(tasksContent: string): Map<string, { total: number; completed: number }> {
  const progress = new Map<string, { total: number; completed: number }>()

  for (const line of tasksContent.split('\n')) {
    const match = line.match(TASK_LINE_PATTERN)
    if (!match) continue

    const completed = match[1].toLowerCase() === 'x'
    const frMatches = match[2].match(FR_PATTERN) ?? []
    const frIds = uniqueSorted(frMatches)
    if (frIds.length === 0) continue

    for (const frId of frIds) {
      const current = progress.get(frId) ?? { total: 0, completed: 0 }
      current.total += 1
      if (completed) {
        current.completed += 1
      }
      progress.set(frId, current)
    }
  }

  return progress
}

function findFirstLineForFr(content: string, frId: string): number | undefined {
  const target = frId.toUpperCase()
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].toUpperCase().includes(target)) {
      return i + 1
    }
  }
  return undefined
}

function findTaskLinesForFr(tasksContent: string, frId: string): number[] {
  const target = frId.toUpperCase()
  const lines = tasksContent.split('\n')
  const found: number[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!TASK_LINE_PATTERN.test(line)) continue
    if (line.toUpperCase().includes(target)) {
      found.push(i + 1)
    }
  }

  return found
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return ''
  }
}

export async function buildTraceabilityResponse(featureId: string, featureDir: string): Promise<TraceabilityResponse> {
  const [specContent, planContent, tasksContent] = await Promise.all([
    readOptional(join(featureDir, 'spec.md')),
    readOptional(join(featureDir, 'plan.md')),
    readOptional(join(featureDir, 'tasks.md')),
  ])

  const frIds = extractFrIds(specContent)
  const planFrIds = new Set(extractFrIds(planContent))
  const taskProgress = extractTaskFrProgress(tasksContent)

  const requirements: TraceabilityRequirement[] = frIds.map((id) => {
    const progress = taskProgress.get(id) ?? { total: 0, completed: 0 }
    const inPlan = planFrIds.has(id)
    const inTasks = progress.total > 0

    const status: TraceabilityRequirement['status'] = inPlan && inTasks
      ? 'covered'
      : inPlan || inTasks
        ? 'partial'
        : 'missing'

    return {
      id,
      inPlan,
      inTasks,
      taskTotal: progress.total,
      taskCompleted: progress.completed,
      status,
      locations: {
        specLine: findFirstLineForFr(specContent, id),
        planLine: findFirstLineForFr(planContent, id),
        taskLines: findTaskLinesForFr(tasksContent, id),
      },
    }
  })

  const alerts: TraceabilityAlert[] = []
  if (!specContent) {
    alerts.push({
      id: 'missing-spec',
      severity: 'critical',
      message: 'spec.md is missing. Traceability cannot be validated without requirements.',
      sourceFile: 'spec.md',
      expectedLink: 'spec.md (FR registry) -> plan.md -> tasks.md',
      whyFailed: 'No requirements source exists for FR extraction.',
    })
  }

  if (frIds.length === 0 && specContent) {
    alerts.push({
      id: 'no-fr',
      severity: 'major',
      message: 'No FR-* identifiers found in spec.md.',
      sourceFile: 'spec.md',
      expectedLink: 'spec.md FR tokens -> plan.md + tasks.md',
      whyFailed: 'Checker did not find any canonical FR IDs in spec.md.',
    })
  }

  for (const requirement of requirements) {
    if (!requirement.inPlan) {
      alerts.push({
        id: `missing-plan-${requirement.id}`,
        severity: 'major',
        requirementId: requirement.id,
        message: `${requirement.id} is not referenced in plan.md.`,
        sourceFile: 'plan.md',
        sourceLine: requirement.locations.planLine ?? requirement.locations.specLine,
        expectedLink: 'spec.md -> plan.md',
        whyFailed: `Plan coverage is detected only by literal ${requirement.id} presence in plan.md.`,
      })
    }

    if (!requirement.inTasks) {
      alerts.push({
        id: `missing-task-${requirement.id}`,
        severity: 'critical',
        requirementId: requirement.id,
        message: `${requirement.id} has no task mapping in tasks.md.`,
        sourceFile: 'tasks.md',
        sourceLine: requirement.locations.taskLines[0] ?? requirement.locations.specLine,
        expectedLink: 'spec.md -> tasks.md checkbox lines',
        whyFailed: `${requirement.id} is missing from checkbox task lines (- [ ] / - [x]).`,
      })
    }
  }

  const frSet = new Set(frIds)
  for (const taskFrId of taskProgress.keys()) {
    if (!frSet.has(taskFrId)) {
      const taskLines = findTaskLinesForFr(tasksContent, taskFrId)
      alerts.push({
        id: `task-extra-${taskFrId}`,
        severity: 'major',
        requirementId: taskFrId,
        message: `${taskFrId} appears in tasks.md but not in spec.md.`,
        sourceFile: 'tasks.md',
        sourceLine: taskLines[0],
        expectedLink: 'tasks.md FR token -> spec.md FR registry',
        whyFailed: 'Task references a non-canonical or undefined FR ID.',
      })
    }
  }

  const summary = {
    frTotal: requirements.length,
    frWithPlan: requirements.filter(r => r.inPlan).length,
    frWithTasks: requirements.filter(r => r.inTasks).length,
    frFullyCovered: requirements.filter(r => r.status === 'covered').length,
    taskTotal: requirements.reduce((acc, r) => acc + r.taskTotal, 0),
    taskCompleted: requirements.reduce((acc, r) => acc + r.taskCompleted, 0),
  }

  return {
    featureId,
    summary,
    requirements,
    alerts,
  }
}

export function formatTraceabilityContextForPrompt(traceability: TraceabilityResponse): string {
  const issues = traceability.alerts.map((alert) => ({
    id: alert.id,
    severity: alert.severity,
    fr_id: alert.requirementId ?? null,
    source_file: alert.sourceFile ?? null,
    source_line: alert.sourceLine ?? null,
    expected_link: alert.expectedLink ?? null,
    why_failed: alert.whyFailed ?? alert.message,
    message: alert.message,
  }))

  if (issues.length === 0) {
    return [
      '## Detected Traceability Issues',
      '',
      'Repository checker found no active traceability gaps for this feature.',
    ].join('\n')
  }

  return [
    '## Detected Traceability Issues',
    '',
    'Use these machine-detected issues as mandatory remediation targets before broad cleanups.',
    '```json',
    JSON.stringify({
      summary: traceability.summary,
      issues,
    }, null, 2),
    '```',
  ].join('\n')
}
