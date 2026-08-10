import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { requireAllowedGitCwd, requireObjectName } from '../../utils/git-access'

const execFileAsync = promisify(execFile)
const MAX_DIFF_BYTES = 256 * 1024

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const cwd = await requireAllowedGitCwd(query.cwd)
  const hash = requireObjectName(query.hash, 'hash')
  const path = requirePath(query.path, 'path')
  const oldPath = typeof query.oldPath === 'string' && query.oldPath.trim()
    ? requirePath(query.oldPath, 'oldPath')
    : undefined

  try {
    const root = await git(cwd, ['rev-parse', '--show-toplevel'])
    await git(root, ['rev-parse', '--verify', `${hash}^{commit}`])
    const paths = oldPath && oldPath !== path ? [oldPath, path] : [path]
    const diff = await git(root, ['show', '--format=', '--find-renames', '--find-copies', '--no-ext-diff', hash, '--', ...paths], { trim: false })
    const bytes = Buffer.byteLength(diff)
    const binary = /Binary files .* differ|GIT binary patch/.test(diff)

    return {
      path,
      oldPath,
      hash,
      binary,
      truncated: bytes > MAX_DIFF_BYTES,
      bytes,
      diff: bytes > MAX_DIFF_BYTES ? diff.slice(0, MAX_DIFF_BYTES) : diff
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load file diff'
    throw createError({ statusCode: 400, statusMessage: message })
  }
})

function requirePath(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  const path = value.trim()
  if (path.includes('\0') || path.startsWith('/')) throw new Error(`Invalid ${name}`)
  return path
}

async function git(cwd: string, args: string[], options: { trim?: boolean } = {}) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 12
  })
  return options.trim === false ? stdout : stdout.trim()
}
