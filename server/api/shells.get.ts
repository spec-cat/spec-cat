import { listShellSessions } from '../utils/shell-terminals'

export default defineEventHandler(async () => {
  const shells = await listShellSessions()
  return { shells }
})
