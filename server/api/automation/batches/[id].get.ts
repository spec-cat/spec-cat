import { getSpecBatch } from '../../../utils/spec-batches'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  if (!/^batch-[a-zA-Z0-9-]{8,100}$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid batch id' })
  }
  const batch = await getSpecBatch(id)
  if (!batch) throw createError({ statusCode: 404, statusMessage: 'Batch not found' })
  return { batch }
})
