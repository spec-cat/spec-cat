import { access } from 'node:fs/promises'
import { requireAllowedGitCwd, requireObjectName } from '../../utils/git-access'
import { mergeCompareFiles, parseNameStatusZ, parseNumstatZ, runGit } from '../../utils/git-state'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const cwd = await requireAllowedGitCwd(query.cwd)
  const from = requireObjectName(query.from, 'from')
  const to = requireObjectName(query.to, 'to')

  try {
    await access(cwd)
    const root = await runGit(cwd, ['rev-parse', '--show-toplevel'])
    await runGit(root, ['rev-parse', '--verify', `${from}^{commit}`])
    await runGit(root, ['rev-parse', '--verify', `${to}^{commit}`])

    const range = `${from}..${to}`
    const [nameStatusOutput, numstatOutput] = await Promise.all([
      runGit(root, ['diff', '--name-status', '-z', '--find-renames', range], { trim: false }),
      runGit(root, ['diff', '--numstat', '-z', '--find-renames', range], { trim: false })
    ])
    const files = mergeCompareFiles(parseNameStatusZ(nameStatusOutput), parseNumstatZ(numstatOutput))

    return {
      from,
      to,
      files,
      stats: {
        filesChanged: files.length,
        additions: files.reduce((sum, file) => sum + file.additions, 0),
        deletions: files.reduce((sum, file) => sum + file.deletions, 0)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to compare commits'
    throw createError({ statusCode: 400, statusMessage: message })
  }
})
