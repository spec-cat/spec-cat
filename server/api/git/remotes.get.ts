import { access } from 'node:fs/promises'
import { requireAllowedGitCwd } from '../../utils/git-access'
import { parseRemoteDetails, runGit } from '../../utils/git-state'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const cwd = await requireAllowedGitCwd(query.cwd)

  try {
    await access(cwd)
    const root = await runGit(cwd, ['rev-parse', '--show-toplevel'])
    const output = await runGit(root, ['remote', '-v'], { trim: false })

    return {
      remotes: parseRemoteDetails(output)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load git remotes'
    throw createError({ statusCode: 400, statusMessage: message })
  }
})
