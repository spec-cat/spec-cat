import { publicConnection, readDatabaseConnections } from '../../utils/database-connections'

export default defineEventHandler(async () => ({
  connections: (await readDatabaseConnections()).map(publicConnection)
}))
