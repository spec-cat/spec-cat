import { requireAllowedGitCwd } from '../../utils/git-access'
import { parsePorcelainStatus, parseRemotes, runGit } from '../../utils/git-state'
import type { GitRemote, PorcelainFiles } from '../../utils/git-state'

type RepositoryStatus = {
  branch: string
  headCommit: string
  isDetached: boolean
  files: PorcelainFiles
  counts: {
    untracked: number
    modified: number
    deleted: number
    staged: number
    partiallyStaged: number
    total: number
  }
  clean: boolean
  remotes: GitRemote[]
  gitDir: string
  timestamp: number
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const cwd = await requireAllowedGitCwd(query.dir ?? query.cwd)

  try {
    const root = await runGit(cwd, ['rev-parse', '--show-toplevel'])
    const [branch, headCommit, status, remotes, gitDir] = await Promise.all([
      runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'HEAD'),
      runGit(root, ['rev-parse', 'HEAD']).catch(() => ''),
      runGit(root, ['status', '--porcelain'], { trim: false }),
      runGit(root, ['remote', '-v']).catch(() => ''),
      runGit(root, ['rev-parse', '--absolute-git-dir']).catch(() => '')
    ])

    const files = parsePorcelainStatus(status)
    const totalEntries = status.split('\n').filter((line) => line.trim()).length

    const repositoryStatus: RepositoryStatus = {
      branch,
      headCommit,
      isDetached: branch === 'HEAD',
      files,
      counts: {
        untracked: files.untracked.length,
        modified: files.modified.length,
        deleted: files.deleted.length,
        staged: files.staged.length,
        partiallyStaged: files.partiallyStaged.length,
        total: totalEntries
      },
      clean: totalEntries === 0,
      remotes: parseRemotes(remotes),
      gitDir,
      timestamp: Date.now()
    }
    return repositoryStatus
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read repository status'
    throw createError({
      statusCode: message.includes('not a git repository') ? 400 : 500,
      statusMessage: message
    })
  }
})
