import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { promisify } from 'node:util'
import { requireAllowedGitCwd, requireObjectName, requireRef, requireRemote, requireRemoteUrl } from '../../utils/git-access'

const execFileAsync = promisify(execFile)

type GitActionBody = {
  cwd?: string
  action?: string
  branch?: string
  newName?: string
  remote?: string
  url?: string
  hash?: string
  tag?: string
  message?: string
  mode?: 'soft' | 'mixed' | 'hard'
  force?: boolean
  forceWithLease?: boolean
  noCommit?: boolean
  noFastForward?: boolean
  squash?: boolean
  includeUntracked?: boolean
  deleteRemote?: boolean
  stash?: number
  files?: string[]
}

export default defineEventHandler(async (event) => {
  const body = await readBody<GitActionBody>(event)
  const cwd = await requireAllowedGitCwd(body.cwd)
  const action = String(body.action || '')

  try {
    await access(cwd)
    const root = await git(cwd, ['rev-parse', '--show-toplevel'])
    const result = await runGitAction(root, action, body)
    return { success: true, output: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Git action failed'
    throw createError({
      statusCode: 400,
      statusMessage: message
    })
  }
})

async function runGitAction(cwd: string, action: string, body: GitActionBody) {
  switch (action) {
    case 'checkout':
      return git(cwd, ['checkout', requireRef(body.branch, 'branch')])
    case 'createBranch':
      return git(cwd, ['checkout', '-b', requireRef(body.newName, 'newName'), requireObjectName(body.hash, 'hash')])
    case 'renameBranch':
      return git(cwd, ['branch', '-m', requireRef(body.branch, 'branch'), requireRef(body.newName, 'newName')])
    case 'deleteBranch':
      return git(cwd, ['branch', body.force ? '-D' : '-d', requireRef(body.branch, 'branch')])
    case 'deleteRemoteBranch':
      return git(cwd, ['push', requireRemote(body.remote), '--delete', requireRef(body.branch, 'branch')])
    case 'merge': {
      const args = ['merge']
      if (body.noCommit) args.push('--no-commit')
      if (body.noFastForward) args.push('--no-ff')
      if (body.squash) args.push('--squash')
      args.push(requireObjectName(body.branch || body.hash, 'branch or hash'))
      return git(cwd, args)
    }
    case 'rebase':
      return git(cwd, ['rebase', requireObjectName(body.branch || body.hash, 'branch or hash')])
    case 'stage': {
      const files = normalizeFiles(body.files)
      return git(cwd, files.length ? ['add', '--', ...files] : ['add', '--all'])
    }
    case 'unstage': {
      const files = normalizeFiles(body.files)
      return git(cwd, files.length ? ['reset', 'HEAD', '--', ...files] : ['reset', 'HEAD'])
    }
    case 'commit': {
      const message = required(body.message, 'message')
      const status = await git(cwd, ['status', '--porcelain=v1'], { trim: false })
      const hasStagedChanges = status.split('\n').some((line) => {
        const stagedStatus = line[0]
        return stagedStatus && stagedStatus !== ' ' && stagedStatus !== '?'
      })
      if (!hasStagedChanges) throw new Error('No staged changes to commit')
      await git(cwd, ['commit', '-m', message])
      return git(cwd, ['rev-parse', '--short', 'HEAD'])
    }
    case 'push': {
      const args = ['push']
      if (body.forceWithLease) args.push('--force-with-lease')
      else if (body.force) args.push('--force')
      if (body.remote) args.push(requireRemote(body.remote))
      args.push(requireRef(body.branch, 'branch'))
      return git(cwd, args)
    }
    case 'pull': {
      const args = ['pull']
      if (body.noFastForward) args.push('--no-ff')
      if (body.squash) args.push('--squash')
      if (body.remote) args.push(requireRemote(body.remote))
      if (body.branch) args.push(requireRef(body.branch, 'branch'))
      return git(cwd, args)
    }
    case 'fetch': {
      const args = ['fetch']
      if (body.remote) args.push(requireRemote(body.remote))
      if (body.branch) args.push(requireRef(body.branch, 'branch'))
      return git(cwd, args)
    }
    case 'addRemote':
      return git(cwd, ['remote', 'add', requireRemote(body.remote), requireRemoteUrl(body.url)])
    case 'editRemote':
      return git(cwd, ['remote', 'set-url', requireRemote(body.remote), requireRemoteUrl(body.url)])
    case 'deleteRemote':
      return git(cwd, ['remote', 'remove', requireRemote(body.remote)])
    case 'addTag': {
      const args = ['tag', requireRef(body.tag, 'tag')]
      if (body.message) args.push('-a', '-m', body.message)
      args.push(requireObjectName(body.hash, 'hash'))
      return git(cwd, args)
    }
    case 'deleteTag': {
      const tag = requireRef(body.tag, 'tag')
      const output = await git(cwd, ['tag', '-d', tag])
      if (body.deleteRemote) {
        await git(cwd, ['push', body.remote ? requireRemote(body.remote) : 'origin', '--delete', tag])
      }
      return output
    }
    case 'pushTag':
      return git(cwd, ['push', body.remote ? requireRemote(body.remote) : 'origin', requireRef(body.tag, 'tag')])
    case 'cherryPick': {
      const args = ['cherry-pick']
      if (body.noCommit) args.push('--no-commit')
      args.push(requireObjectName(body.hash, 'hash'))
      return git(cwd, args)
    }
    case 'revert':
      return git(cwd, ['revert', '--no-edit', requireObjectName(body.hash, 'hash')])
    case 'reset':
      return git(cwd, ['reset', `--${body.mode || 'mixed'}`, requireObjectName(body.hash, 'hash')])
    case 'stash': {
      const args = ['stash', 'push']
      if (body.includeUntracked) args.push('--include-untracked')
      if (body.message) args.push('-m', body.message)
      return git(cwd, args)
    }
    case 'applyStash':
      return git(cwd, ['stash', 'apply', stashRef(body.stash)])
    case 'popStash':
      return git(cwd, ['stash', 'pop', stashRef(body.stash)])
    case 'dropStash':
      return git(cwd, ['stash', 'drop', stashRef(body.stash)])
    case 'stashBranch':
      return git(cwd, ['stash', 'branch', requireRef(body.newName, 'newName'), stashRef(body.stash)])
    case 'resetWorking':
      return git(cwd, ['reset', `--${body.mode || 'mixed'}`])
    case 'cleanUntracked':
      return git(cwd, ['clean', '-fd'])
    default:
      throw new Error(`Unsupported git action: ${action}`)
  }
}

function required(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required`)
  }
  return value.trim()
}

function normalizeFiles(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((file): file is string => typeof file === 'string')
    .map((file) => file.trim())
    .filter(Boolean)
}

function stashRef(value: unknown) {
  const index = value === undefined ? 0 : Number(value)
  if (!Number.isSafeInteger(index) || index < 0) throw new Error('Invalid stash index')
  return `stash@{${index}}`
}

async function git(cwd: string, args: string[], options: { trim?: boolean } = {}) {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8
  })
  const output = `${stdout || ''}${stderr || ''}`
  return options.trim === false ? output : output.trim()
}
