import { findDatabaseConnection, withDatabaseClient } from '../../../../utils/database-connections'

export default defineEventHandler(async (event) => {
  const connection = await findDatabaseConnection(getRouterParam(event, 'id') || '')
  if (!connection) throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  const startedAt = Date.now()
  const info = await withDatabaseClient(connection, async (client) => {
    const result = await client.query('select current_database() as database, current_user as user, version() as version')
    return result.rows[0]
  })
  return { ok: true, latencyMs: Date.now() - startedAt, info }
})
