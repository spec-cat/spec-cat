import { randomUUID } from 'node:crypto'
import { publicConnection, readDatabaseConnections, writeDatabaseConnections } from '../../utils/database-connections'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  const name = requiredText(body?.name, 'Connection name', 100)
  const host = requiredText(body?.host, 'Host', 255)
  const database = requiredText(body?.database, 'Database', 128)
  const user = requiredText(body?.user, 'User', 128)
  const port = Number(body?.port ?? 5432)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw createError({ statusCode: 400, statusMessage: 'Port must be between 1 and 65535' })
  }
  const now = new Date().toISOString()
  const connection = {
    id: randomUUID(), name, host, port, database, user,
    password: typeof body?.password === 'string' ? body.password : '',
    ssl: body?.ssl === true, createdAt: now, updatedAt: now
  }
  const connections = await readDatabaseConnections()
  connections.push(connection)
  await writeDatabaseConnections(connections)
  return { connection: publicConnection(connection) }
})

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw createError({ statusCode: 400, statusMessage: `${label} is required` })
  }
  return value.trim()
}
