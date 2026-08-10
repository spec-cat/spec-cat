import { publicConnection, readDatabaseConnections, writeDatabaseConnections } from '../../../utils/database-connections'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  const body = await readBody<Record<string, unknown>>(event)
  const connections = await readDatabaseConnections()
  const connection = connections.find((item) => item.id === id)
  if (!connection) throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  for (const field of ['name', 'host', 'database', 'user'] as const) {
    if (typeof body[field] === 'string' && body[field].trim()) connection[field] = body[field].trim()
  }
  if (typeof body.password === 'string' && body.password) connection.password = body.password
  if (body.clearPassword === true) connection.password = ''
  const port = Number(body.port ?? connection.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw createError({ statusCode: 400, statusMessage: 'Invalid port' })
  connection.port = port
  if (typeof body.ssl === 'boolean') connection.ssl = body.ssl
  connection.updatedAt = new Date().toISOString()
  await writeDatabaseConnections(connections)
  return { connection: publicConnection(connection) }
})
