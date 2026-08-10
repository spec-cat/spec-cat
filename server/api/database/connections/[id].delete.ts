import { readDatabaseConnections, writeDatabaseConnections } from '../../../utils/database-connections'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  const connections = await readDatabaseConnections()
  const remaining = connections.filter((connection) => connection.id !== id)
  if (remaining.length === connections.length) throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  await writeDatabaseConnections(remaining)
  return { ok: true }
})
