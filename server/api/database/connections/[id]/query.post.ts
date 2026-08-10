import { findDatabaseConnection, normalizeQueryResult, withDatabaseClient } from '../../../../utils/database-connections'

export default defineEventHandler(async (event) => {
  const connection = await findDatabaseConnection(getRouterParam(event, 'id') || '')
  if (!connection) throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  const body = await readBody<{ sql?: unknown }>(event)
  if (typeof body?.sql !== 'string' || !body.sql.trim()) throw createError({ statusCode: 400, statusMessage: 'SQL is required' })
  if (body.sql.length > 1_000_000) throw createError({ statusCode: 413, statusMessage: 'SQL is too large' })
  const sql = body.sql
  const startedAt = Date.now()
  const results = await withDatabaseClient(connection, async (client) => normalizeQueryResult(await client.query<Record<string, unknown>>(sql)))
  return { results, durationMs: Date.now() - startedAt }
})
