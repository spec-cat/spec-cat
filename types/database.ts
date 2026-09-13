export type DatabaseConnectionSummary = {
  id: string
  name: string
  host: string
  port: number
  database: string
  user: string
  ssl: boolean
  hasPassword: boolean
  createdAt: string
  updatedAt: string
}

export type DatabaseColumn = { name: string, dataType: string, nullable: boolean }
export type DatabaseObject = { name: string, type: string, columns: DatabaseColumn[] }
export type DatabaseSchema = { name: string, objects: DatabaseObject[] }

export type DatabaseQueryResult = {
  command: string
  rowCount: number
  fields: { name: string, dataTypeId: number }[]
  rows: Record<string, unknown>[]
  truncated: boolean
}

export type DatabaseQueryEditorExpose = {
  selectionStart: () => number
  resetCursor: () => void
}
