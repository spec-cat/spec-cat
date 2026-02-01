import type { ReindexResponse } from '~/types/specSearch'
import { triggerManualReindex } from '../../utils/specSearch/scheduler'

export default defineEventHandler(async (event): Promise<ReindexResponse> => {
  const body = await readBody<{ force?: boolean }>(event)
  const result = await triggerManualReindex({ force: Boolean(body?.force) })

  if (!result.success && result.status === 'already-indexing') {
    return result
  }

  if (!result.success) {
    throw createError({
      statusCode: 500,
      statusMessage: result.error || 'Reindex failed',
    })
  }

  return result
})
