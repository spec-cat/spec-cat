export type TraceabilityInput = {
  spec?: string | null
  plan?: string | null
  tasks?: string | null
}

export type RequirementCoverage = {
  id: string
  inPlan: boolean
  inTasks: boolean
}

export type TraceabilityCounts = {
  total: number
  coveredInPlan: number
  coveredInTasks: number
  uncovered: number
}

export type TraceabilityRisk = 'none' | 'low' | 'medium' | 'high'

export type TraceabilityReport = {
  requirements: RequirementCoverage[]
  counts: TraceabilityCounts
  alerts: string[]
  risk: TraceabilityRisk
}

const FR_PATTERN = /\bFR-(\d{3})([a-z]?)\b/gi
const TASK_LINE_PATTERN = /^\s*-\s+\[( |x|X)\]\s+(.+)$/

/**
 * A citation of another spec's requirement, written as the three-digit feature
 * number followed by the FR token — `094 FR-016c`, `(064 FR-038a)`.
 *
 * These are references, not requirements of the document they appear in.
 * Counting them as local requirements produces alerts that cannot be satisfied
 * without deleting a legitimate cross-reference, so they are excluded.
 */
const CROSS_SPEC_CITATION = /[^\w-]\d{3}[ \t]+$/
const CITATION_LOOKBEHIND = 24

function isCrossSpecCitation(text: string, matchStart: number): boolean {
  const preceding = ` ${text.slice(Math.max(0, matchStart - CITATION_LOOKBEHIND), matchStart)}`
  return CROSS_SPEC_CITATION.test(preceding)
}

export function extractRequirementIds(text: string): string[] {
  const ids: string[] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(FR_PATTERN)) {
    if (isCrossSpecCitation(text, match.index ?? 0)) continue
    const id = `FR-${match[1]}${(match[2] ?? '').toLowerCase()}`
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }

  return ids
}

export function analyzeTraceability(input: TraceabilityInput): TraceabilityReport {
  const specIds = extractRequirementIds(input.spec ?? '')
  const planIds = new Set(extractRequirementIds(input.plan ?? ''))
  const taskIds = new Set(
    (input.tasks ?? '')
      .split(/\r?\n/)
      .filter((line) => TASK_LINE_PATTERN.test(line))
      .flatMap((line) => extractRequirementIds(line))
  )

  const requirements: RequirementCoverage[] = specIds.map((id) => ({
    id,
    inPlan: planIds.has(id),
    inTasks: taskIds.has(id)
  }))

  const total = requirements.length
  const coveredInPlan = requirements.filter((requirement) => requirement.inPlan).length
  const coveredInTasks = requirements.filter((requirement) => requirement.inTasks).length
  const uncovered = requirements.filter((requirement) => !requirement.inPlan || !requirement.inTasks).length

  const alerts: string[] = []
  for (const requirement of requirements) {
    if (!requirement.inPlan) alerts.push(`${requirement.id} not referenced in plan.md`)
    if (!requirement.inTasks) alerts.push(`${requirement.id} not referenced in tasks.md`)
  }
  const specIdSet = new Set(specIds)
  for (const taskId of taskIds) {
    if (!specIdSet.has(taskId)) alerts.push(`${taskId} referenced in tasks.md but not defined in spec.md`)
  }

  let risk: TraceabilityRisk = 'none'
  if (total > 0) {
    const uncoveredInTasksRatio = (total - coveredInTasks) / total
    if (uncoveredInTasksRatio > 0.5) risk = 'high'
    else if (uncoveredInTasksRatio > 0.2) risk = 'medium'
    else if (uncovered > 0) risk = 'low'
  }

  return {
    requirements,
    counts: { total, coveredInPlan, coveredInTasks, uncovered },
    alerts,
    risk
  }
}

/** Adds document-shape failures used to decide whether planning must be rebuilt. */
export function analyzePlanningRepair(input: TraceabilityInput): TraceabilityReport {
  const report = analyzeTraceability(input)
  const structuralAlerts = [
    ...(input.spec == null ? ['spec.md is missing'] : []),
    ...(input.spec != null && report.counts.total === 0 ? ['spec.md defines no FR-### requirements'] : []),
    ...(input.plan == null ? ['plan.md is missing'] : []),
    ...(input.tasks == null ? ['tasks.md is missing'] : [])
  ]
  return { ...report, alerts: [...structuralAlerts, ...report.alerts] }
}

export function formatTraceabilityContextForPrompt(report: TraceabilityReport): string {
  if (report.alerts.length === 0) {
    return [
      '## Detected Traceability Issues',
      '',
      'Repository checker found no active traceability gaps for this feature.'
    ].join('\n')
  }

  return [
    '## Detected Traceability Issues',
    '',
    'Treat these repository-checker errors as mandatory remediation targets:',
    ...report.alerts.map((alert) => `- ${alert}`)
  ].join('\n')
}
