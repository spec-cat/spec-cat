import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Client, type ClientConfig, type QueryResult } from 'pg'
import { STORE_ROOT } from './session-store'

export type DatabaseConnection = {
  id: string
  name: string
  host: string
  port: number
  database: string
  user: string
  password: string
  queryDraft?: string
  ssl: boolean
  createdAt: string
  updatedAt: string
}

export type PublicDatabaseConnection = Omit<DatabaseConnection, 'password' | 'queryDraft'> & { hasPassword: boolean }

const CONNECTIONS_PATH = join(STORE_ROOT, 'database-connections.json')

export function publicConnection(connection: DatabaseConnection): PublicDatabaseConnection {
  const { password, queryDraft: _queryDraft, ...safe } = connection
  return { ...safe, hasPassword: Boolean(password) }
}

export async function readDatabaseConnections(): Promise<DatabaseConnection[]> {
  try {
    const value = JSON.parse(await readFile(CONNECTIONS_PATH, 'utf8'))
    return Array.isArray(value) ? value.filter(isStoredConnection) : []
  } catch {
    return []
  }
}

export async function writeDatabaseConnections(connections: DatabaseConnection[]) {
  await mkdir(dirname(CONNECTIONS_PATH), { recursive: true })
  const temporaryPath = `${CONNECTIONS_PATH}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(connections, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await chmod(temporaryPath, 0o600)
  await rename(temporaryPath, CONNECTIONS_PATH)
}

export async function findDatabaseConnection(id: string) {
  return (await readDatabaseConnections()).find((connection) => connection.id === id)
}

export function connectionConfig(connection: DatabaseConnection): ClientConfig {
  return {
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    ssl: connection.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10_000,
    query_timeout: 60_000,
    statement_timeout: 60_000,
    application_name: 'code-cat'
  }
}

export async function withDatabaseClient<T>(connection: DatabaseConnection, operation: (client: Client) => Promise<T>) {
  const client = new Client(connectionConfig(connection))
  await client.connect()
  try {
    return await operation(client)
  } finally {
    await client.end()
  }
}

export function normalizeQueryResult(result: QueryResult | QueryResult[]) {
  const results = Array.isArray(result) ? result : [result]
  return results.map((item) => ({
    command: item.command,
    rowCount: item.rowCount ?? 0,
    fields: item.fields.map((field) => ({ name: field.name, dataTypeId: field.dataTypeID })),
    rows: item.rows.slice(0, 1000).map((row) => serializeRow(row)),
    truncated: item.rows.length > 1000
  }))
}

function serializeRow(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, serializeValue(value)]))
}

function serializeValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return `\\x${value.toString('hex')}`
  return value
}

function isStoredConnection(value: unknown): value is DatabaseConnection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.host === 'string'
    && Number.isInteger(item.port)
    && typeof item.database === 'string'
    && typeof item.user === 'string'
    && typeof item.password === 'string'
    && (item.queryDraft === undefined || typeof item.queryDraft === 'string')
    && typeof item.ssl === 'boolean'
}
