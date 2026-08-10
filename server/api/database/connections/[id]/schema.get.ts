import { findDatabaseConnection, withDatabaseClient } from '../../../../utils/database-connections'

export default defineEventHandler(async (event) => {
  const connection = await findDatabaseConnection(getRouterParam(event, 'id') || '')
  if (!connection) throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  const rows = await withDatabaseClient(connection, async (client) => {
    const result = await client.query(`
      select n.nspname as schema_name, c.relname as table_name,
             case c.relkind when 'v' then 'view' when 'm' then 'materialized view' else 'table' end as object_type,
             a.attname as column_name, format_type(a.atttypid, a.atttypmod) as data_type, a.attnotnull as not_null
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      left join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      where c.relkind in ('r', 'p', 'v', 'm') and n.nspname not in ('pg_catalog', 'information_schema')
      order by n.nspname, c.relname, a.attnum
    `)
    return result.rows
  })
  const schemas = new Map<string, Map<string, { name: string; type: string; columns: unknown[] }>>()
  for (const row of rows) {
    if (!schemas.has(row.schema_name)) schemas.set(row.schema_name, new Map())
    const objects = schemas.get(row.schema_name)!
    if (!objects.has(row.table_name)) objects.set(row.table_name, { name: row.table_name, type: row.object_type, columns: [] })
    if (row.column_name) objects.get(row.table_name)!.columns.push({ name: row.column_name, dataType: row.data_type, nullable: !row.not_null })
  }
  return { schemas: [...schemas].map(([name, objects]) => ({ name, objects: [...objects.values()] })) }
})
