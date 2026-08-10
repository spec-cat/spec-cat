import { readdir, readFile, stat } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { analyzeTraceability, type TraceabilityReport } from '../../utils/traceability'
import { projectDir } from '../../utils/project-dir'

type FeatureTraceability = TraceabilityReport & { featureId: string }

async function readOptionalFile(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

async function analyzeFeature(specsRoot: string, featureId: string): Promise<FeatureTraceability> {
  const featureDir = join(specsRoot, featureId)
  const [spec, plan, tasks] = await Promise.all([
    readOptionalFile(join(featureDir, 'spec.md')),
    readOptionalFile(join(featureDir, 'plan.md')),
    readOptionalFile(join(featureDir, 'tasks.md'))
  ])
  return { featureId, ...analyzeTraceability({ spec, plan, tasks }) }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const featureId = typeof query.featureId === 'string' && query.featureId.trim() ? query.featureId.trim() : undefined
  const specsRoot = join(projectDir(), 'specs')

  if (featureId) {
    if (featureId.includes('..')) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid featureId' })
    }
    const featureDir = normalize(join(specsRoot, featureId))
    if (!featureDir.startsWith(normalize(specsRoot))) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid featureId' })
    }

    try {
      const dirStat = await stat(featureDir)
      if (!dirStat.isDirectory()) throw new Error('not a directory')
    } catch {
      throw createError({ statusCode: 404, statusMessage: 'Feature not found' })
    }

    return { features: [await analyzeFeature(specsRoot, featureId)] }
  }

  let entries: string[]
  try {
    entries = await readdir(specsRoot)
  } catch {
    return { features: [] as FeatureTraceability[] }
  }

  const features: FeatureTraceability[] = []
  for (const entry of entries.sort()) {
    try {
      const dirStat = await stat(join(specsRoot, entry))
      if (!dirStat.isDirectory()) continue
    } catch {
      continue
    }
    features.push(await analyzeFeature(specsRoot, entry))
  }

  return { features }
})
