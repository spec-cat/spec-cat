export interface SpecFile {
  filename: string
  label: string
}

export interface Feature {
  id: string
  name: string
  files: SpecFile[]
  hasSpec: boolean
  hasPlan: boolean
  hasTasks: boolean
  completedTasks: number
  totalTasks: number
}

export interface FeaturesListResponse {
  features: Feature[]
}

export interface SpecFileContentResponse {
  content: string
  filename: string
  featureId: string
}

export type TraceabilitySeverity = 'critical' | 'major' | 'minor'

export interface TraceabilityAlert {
  id: string
  severity: TraceabilitySeverity
  message: string
  requirementId?: string
  sourceFile?: 'spec.md' | 'plan.md' | 'tasks.md'
  sourceLine?: number
  expectedLink?: string
  whyFailed?: string
}

export interface TraceabilityRequirement {
  id: string
  inPlan: boolean
  inTasks: boolean
  taskTotal: number
  taskCompleted: number
  status: 'missing' | 'partial' | 'covered'
  locations: {
    specLine?: number
    planLine?: number
    taskLines: number[]
  }
}

export interface TraceabilitySummary {
  frTotal: number
  frWithPlan: number
  frWithTasks: number
  frFullyCovered: number
  taskTotal: number
  taskCompleted: number
}

export interface TraceabilityResponse {
  featureId: string
  summary: TraceabilitySummary
  requirements: TraceabilityRequirement[]
  alerts: TraceabilityAlert[]
}
