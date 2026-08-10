import { mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'
import { projectDir } from '../../../utils/project-dir'

const MAX_SPEC_BYTES = 1024 * 1024

export default defineEventHandler(async (event) => {
  const featureId = getRouterParam(event, 'featureId')
  const filename = getRouterParam(event, 'filename')

  if (!featureId || !filename) {
    throw createError({ statusCode: 400, statusMessage: 'Missing featureId or filename' })
  }

  if (featureId.includes('..') || filename.includes('..') || !filename.endsWith('.md')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid spec file path' })
  }

  const body = await readBody(event)
  const content = body?.content
  if (typeof content !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Body must contain a string "content"' })
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_SPEC_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Spec file too large' })
  }

  const specsRoot = join(projectDir(), 'specs')
  const filePath = normalize(join(specsRoot, featureId, filename))
  if (!filePath.startsWith(normalize(join(specsRoot, featureId)))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid spec file path' })
  }

  // Only allow updating files that already exist; creating specs stays with
  // the speckit workflow.
  try {
    await stat(filePath)
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Spec file not found' })
  }

  await mkdir(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp`
  await writeFile(tmpPath, content, 'utf8')
  await rename(tmpPath, filePath)

  return { featureId, filename, saved: true, bytes: Buffer.byteLength(content, 'utf8') }
})
