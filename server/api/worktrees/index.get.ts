import { requireAllowedGitCwd } from '../../utils/git-access'
import { runGit } from '../../utils/git-state'
import { describeWorktrees, parseWorktreeList } from '../../utils/worktree'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const cwd = await requireAllowedGitCwd(query.cwd).catch((error) => {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Invalid git working directory'
    })
  })

  try {
    const root = await runGit(cwd, ['rev-parse', '--show-toplevel'])
    const output = await runGit(root, ['worktree', 'list', '--porcelain'], { trim: false })
    return {
      root,
      worktrees: describeWorktrees(parseWorktreeList(output))
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list worktrees'
    throw createError({
      statusCode: message.includes('not a git repository') ? 400 : 500,
      statusMessage: message
    })
  }
})
