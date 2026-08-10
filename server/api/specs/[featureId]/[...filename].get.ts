import { readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { projectDir } from '../../../utils/project-dir'

export default defineEventHandler(async (event) => {
  const featureId = getRouterParam(event, 'featureId')
  const filename = getRouterParam(event, 'filename')

  if (!featureId || !filename) {
    throw createError({ statusCode: 400, statusMessage: 'Missing featureId or filename' })
  }

  if (featureId.includes('..') || filename.includes('..') || !filename.endsWith('.md')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid spec file path' })
  }

  const specsRoot = join(projectDir(), 'specs')
  const filePath = normalize(join(specsRoot, featureId, filename))
  if (!filePath.startsWith(normalize(join(specsRoot, featureId)))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid spec file path' })
  }

  try {
    return {
      featureId,
      filename,
      content: await readFile(filePath, 'utf8')
    }
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Spec file not found' })
  }
})
