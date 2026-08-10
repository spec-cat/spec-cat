import { createShellSession } from '../utils/shell-terminals'

export default defineEventHandler(async () => {
  const shell = await createShellSession()
  return { shell }
})
