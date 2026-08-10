import { requireAllowedGitCwd } from '../../utils/git-access'
import { countPorcelainEntries, hashText, runGit } from '../../utils/git-state'

type GitStateSnapshot = {
  headCommit: string
  branchListHash: string
  uncommittedFileCount: number
  workingTreeHash: string
  stashListHash: string
  timestamp: number
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const cwd = await requireAllowedGitCwd(query.dir ?? query.cwd)

  try {
    const root = await runGit(cwd, ['rev-parse', '--show-toplevel'])
    const [headCommit, refList, status, stashList] = await Promise.all([
      runGit(root, ['rev-parse', 'HEAD']).catch(() => ''),
      runGit(root, ['for-each-ref', '--format=%(refname):%(objectname)', 'refs/heads', 'refs/remotes'], { trim: false }),
      runGit(root, ['status', '--porcelain'], { trim: false }),
      runGit(root, ['stash', 'list', '--format=%gd:%H'], { trim: false }).catch(() => '')
    ])

    const state: GitStateSnapshot = {
      headCommit,
      branchListHash: hashText(refList),
      uncommittedFileCount: countPorcelainEntries(status),
      workingTreeHash: hashText(status),
      stashListHash: hashText(stashList),
      timestamp: Date.now()
    }
    return state
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read git state'
    throw createError({
      statusCode: message.includes('not a git repository') ? 400 : 500,
      statusMessage: message
    })
  }
})
