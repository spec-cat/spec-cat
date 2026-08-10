import { findDatabaseConnection } from '../../../../utils/database-connections'

export default defineEventHandler(async (event) => {
  const connection = await findDatabaseConnection(getRouterParam(event, 'id') || '')
  if (!connection) throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  return { sql: connection.queryDraft || '' }
})
