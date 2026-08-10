import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { requireAllowedGitCwd, requireObjectName } from '../../utils/git-access'

type CommitFile = {
  path: string
  status: string
  oldPath?: string
}

const execFileAsync = promisify(execFile)

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const cwd = await requireAllowedGitCwd(query.cwd)
  const hash = requireObjectName(query.hash, 'hash')

  try {
    const root = await git(cwd, ['rev-parse', '--show-toplevel'])
    await git(root, ['rev-parse', '--verify', `${hash}^{commit}`])
    const output = await git(root, ['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-M', '-C', hash], { trim: false })

    return {
      files: parseNameStatus(output)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load commit files'
    throw createError({ statusCode: 400, statusMessage: message })
  }
})

function parseNameStatus(output: string): CommitFile[] {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [rawStatus = '', firstPath = '', secondPath = ''] = line.split('\t')
      const status = rawStatus[0] || 'M'
      if ((status === 'R' || status === 'C') && secondPath) {
        return { status, oldPath: firstPath, path: secondPath }
      }
      return { status, path: firstPath }
    })
    .filter((file) => file.path)
}

async function git(cwd: string, args: string[], options: { trim?: boolean } = {}) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8
  })
  return options.trim === false ? stdout : stdout.trim()
}
