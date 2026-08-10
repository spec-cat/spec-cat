import { readDatabaseConnections, writeDatabaseConnections } from '../../../../utils/database-connections'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  const body = await readBody<{ sql?: unknown }>(event)
  if (typeof body?.sql !== 'string') throw createError({ statusCode: 400, statusMessage: 'SQL must be a string' })
  if (body.sql.length > 1_000_000) throw createError({ statusCode: 413, statusMessage: 'SQL draft is too large' })
  const connections = await readDatabaseConnections()
  const connection = connections.find((item) => item.id === id)
  if (!connection) throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  connection.queryDraft = body.sql
  connection.updatedAt = new Date().toISOString()
  await writeDatabaseConnections(connections)
  return { ok: true }
})
