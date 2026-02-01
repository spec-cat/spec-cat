import type { SearchMode, SearchResponse } from '~/types/specSearch'
import { getEmbedding, getEmbeddingModelError } from '../../utils/specSearch/embeddings'
import { getSpecSearchDatabase, runSearch } from '../../utils/specSearch/database'

function normalizeMode(mode: string | undefined): SearchMode {
  if (mode === 'semantic' || mode === 'hybrid') return mode
  return 'keyword'
}

export default defineEventHandler(async (event): Promise<SearchResponse> => {
  const query = getQuery(event)
  const q = String(query.q || '').trim()

  if (!q) {
    throw createError({ statusCode: 400, statusMessage: 'Missing query parameter: q' })
  }

  const mode = normalizeMode(typeof query.mode === 'string' ? query.mode : undefined)
  const featureId = typeof query.featureId === 'string' ? query.featureId : undefined
  const fileType = typeof query.fileType === 'string' ? query.fileType : undefined
  const limit = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : 20

  const db = getSpecSearchDatabase()
  await db.init()

  const started = Date.now()
  let warning: string | undefined

  let embedding: number[] | undefined
  if (mode === 'semantic' || mode === 'hybrid') {
    embedding = await getEmbedding(q)

    if (!db.getVectorEnabled()) {
      warning = 'Vector search unavailable; results may degrade to keyword ranking.'
    }

    const modelError = getEmbeddingModelError()
    if (modelError) {
      warning = warning ?? `Semantic model unavailable: ${modelError}`
    }
  }

  const results = await runSearch(mode, q, {
    embedding,
    featureId,
    fileType,
    limit,
  })

  return {
    mode,
    results,
    totalCount: results.length,
    searchTime: Date.now() - started,
    warning,
  }
})
