import { join } from 'node:path'
import { getProjectDir } from '../../../utils/projectDir'
import { buildTraceabilityResponse } from '../../../utils/traceability'
import type { TraceabilityResponse } from '~/types/spec-viewer'

export default defineEventHandler(async (event): Promise<TraceabilityResponse> => {
  const featureId = getRouterParam(event, 'featureId')
  if (!featureId || featureId.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid featureId' })
  }

  const projectDir = getProjectDir()
  const featureDir = join(projectDir, 'specs', featureId)
  return buildTraceabilityResponse(featureId, featureDir)
})
