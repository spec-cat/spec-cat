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

const FR_PATTERN = /\bFR-?(\d{1,4})\b/gi

export function extractRequirementIds(text: string): string[] {
  const ids: string[] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(FR_PATTERN)) {
    const id = `FR-${match[1]}`
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }

  return ids
}

export function analyzeTraceability(input: TraceabilityInput): TraceabilityReport {
  const specIds = extractRequirementIds(input.spec ?? '')
  const planIds = new Set(extractRequirementIds(input.plan ?? ''))
  const taskIds = new Set(extractRequirementIds(input.tasks ?? ''))

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
