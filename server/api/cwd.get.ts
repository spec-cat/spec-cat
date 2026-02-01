// API endpoint to get current working directory
// Used by client-side pages that need server-side path information

import { getProjectDir } from '../utils/projectDir'

export default defineEventHandler(() => {
  return {
    cwd: getProjectDir()
  }
})
