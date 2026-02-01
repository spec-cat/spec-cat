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
}

export interface FeaturesListResponse {
  features: Feature[]
}

export interface SpecFileContentResponse {
  content: string
  filename: string
  featureId: string
}
