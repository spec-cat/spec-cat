import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getProjectDir } from '../../../utils/projectDir'

export default defineEventHandler(async (event) => {
  const featureId = getRouterParam(event, 'featureId')
  const filename = getRouterParam(event, 'filename')

  if (!featureId || !filename) {
    throw createError({ statusCode: 400, statusMessage: 'Missing featureId or filename' })
  }

  // Path traversal protection
  if (featureId.includes('..') || filename.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path: must not contain path traversal' })
  }

  // Only serve .md files
  if (!filename.endsWith('.md')) {
    throw createError({ statusCode: 400, statusMessage: 'Only .md files are supported' })
  }

  const projectDir = getProjectDir()
  const filePath = join(projectDir, 'specs', featureId, filename)

  try {
    const content = await readFile(filePath, 'utf-8')
    return { content, filename, featureId }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      throw createError({
        statusCode: 404,
        statusMessage: 'Spec file not found',
        data: { featureId, filename },
      })
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to read spec file',
    })
  }
})
