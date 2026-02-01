import { writeFile } from 'node:fs/promises'
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

  // Only allow .md files
  if (!filename.endsWith('.md')) {
    throw createError({ statusCode: 400, statusMessage: 'Only .md files are supported' })
  }

  const body = await readBody<{ content: string }>(event)
  if (typeof body?.content !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing content in request body' })
  }

  const projectDir = getProjectDir()
  const filePath = join(projectDir, 'specs', featureId, filename)

  try {
    await writeFile(filePath, body.content, 'utf-8')
    return { success: true, filename, featureId }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      throw createError({
        statusCode: 404,
        statusMessage: 'Spec file or directory not found',
        data: { featureId, filename },
      })
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to write spec file',
    })
  }
})
