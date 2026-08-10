import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { promisify } from 'node:util'
import { requireAllowedGitCwd, requireRef } from '../../utils/git-access'
import { listStoredSessions } from '../../utils/session-store'

type GitAuthor = {
  name: string
  email: string
}

type GitCommit = {
  hash: string
  shortHash: string
  subject: string
  author: GitAuthor
  date: string
  parents: string[]
  refs: string[]
  branches: string[]
  tags: string[]
  lane: number
  color: string
}

type GitBranch = {
  name: string
  hash: string
  current: boolean
  remote: boolean
  color: string
}

type GitStatus = {
  clean: boolean
  changed: number
  staged: number
  unstaged: number
  untracked: number
  stagedFiles: GitStatusFile[]
  unstagedFiles: GitStatusFile[]
}

type GitStatusFile = {
  path: string
  status: string
  oldPath?: string
}

type GitStash = {
  index: number
  hash: string
  message: string
  branch: string
  date: string
}

const execFileAsync = promisify(execFile)
const DEFAULT_LIMIT = 120
const MAX_LIMIT = 1000
const FIELD_SEPARATOR = '\x1f'
const COMMIT_SEPARATOR = '\x1e'
const BRANCH_COLORS = [
  '#26a6a6',
  '#ff5d38',
  '#bcd42a',
  '#f7b83d',
  '#59d9d9',
  '#f03e5f',
  '#d7e67e',
  '#ffb09e',
  '#8fb8ff',
  '#c58cff',
  '#7dd3fc',
  '#fb7185'
]

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const cwd = await requireAllowedGitCwd(query.cwd)
  const limit = normalizeLimit(query.limit)
  const search = typeof query.search === 'string' ? query.search.trim() : ''
  const branchFilter = normalizeBranchFilter(query.branches)

  try {
    await access(cwd)
    const root = await git(cwd, ['rev-parse', '--show-toplevel'])
    const [commits, branches, status, stashes, head, headHash, mergeBases] = await Promise.all([
      readCommits(root, limit, search, branchFilter),
      readBranches(root),
      readStatus(root),
      readStashes(root),
      git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'HEAD'),
      git(root, ['rev-parse', 'HEAD']).catch(() => ''),
      readMergeBases(root)
    ])

    const branchByHash = groupRefsByHash(branches)
    for (const commit of commits) {
      const matchingBranches = branchByHash.get(commit.hash) || []
      commit.branches = matchingBranches.map((branch) => branch.name)
      if (matchingBranches[0]) {
        commit.color = matchingBranches[0].color
      }
    }

    return {
      root,
      head: head.trim(),
      headHash: headHash.trim(),
      commits,
      branches,
      status,
      stashes,
      mergeBases,
      generatedAt: new Date().toISOString()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load git graph'
    throw createError({
      statusCode: message.includes('not a git repository') ? 400 : 500,
      statusMessage: message
    })
  }
})

function normalizeLimit(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)))
}

// Merge bases between HEAD and the managed conversation/preview branches, so
// the graph can mark where feature work diverged. Conversations start on `sc/*`
// but follow the feature branch a speckit step checks out (see
// server/utils/branch-follow.ts), so the stored branches are included too.
async function readMergeBases(cwd: string): Promise<string[]> {
  const output = await git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/sc/']).catch(() => '')
  const followed = (await listStoredSessions().catch(() => []))
    .map((session) => session.worktreeBranch)
    .filter((branch): branch is string => Boolean(branch))
  const branches = [
    ...new Set([...output.split('\n').map((line) => line.trim()), ...followed])
  ].filter(isSafeMergeBaseRef).slice(0, 20)
  if (!branches.length) return []
  const bases = await Promise.all(
    branches.map((branch) => git(cwd, ['merge-base', 'HEAD', branch]).catch(() => ''))
  )
  return [...new Set(bases.map((base) => base.trim()).filter(Boolean))]
}

/** Stored branch names are trusted, but never let one reach git as a flag. */
function isSafeMergeBaseRef(ref: string): boolean {
  try {
    requireRef(ref, 'branch')
    return true
  } catch {
    return false
  }
}

function normalizeBranchFilter(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  return value
    .split(',')
    .map((ref) => ref.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((ref) => requireRef(ref, 'branches'))
}

async function readCommits(cwd: string, limit: number, search: string, branchFilter: string[] = []): Promise<GitCommit[]> {
  const format = [
    '%H',
    '%h',
    '%s',
    '%an',
    '%ae',
    '%aI',
    '%P',
    '%D'
  ].join(FIELD_SEPARATOR)
  const args = [
    'log',
    '--topo-order',
    `--max-count=${limit}`,
    `--pretty=format:${format}${COMMIT_SEPARATOR}`
  ]
  if (branchFilter.length) {
    // HEAD stays included so the current checkout is always visible.
    args.splice(1, 0, 'HEAD', ...branchFilter)
  } else {
    args.splice(1, 0, '--all')
  }
  if (search) args.push(`--grep=${search}`)

  const output = await git(cwd, args, { trim: false }).catch((error) => {
    if (String(error).includes('does not have any commits')) return ''
    throw error
  })

  const laneByRef = new Map<string, number>()
  let nextLane = 0

  return output
    .split(COMMIT_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = '', shortHash = '', subject = '', authorName = '', authorEmail = '', date = '', parentsRaw = '', refsRaw = ''] = entry.split(FIELD_SEPARATOR)
      const refs = parseRefs(refsRaw)
      const laneKey = refs.find((ref) => !ref.startsWith('tag: ')) || parentsRaw?.split(' ')[0] || hash
      if (!laneByRef.has(laneKey)) {
        laneByRef.set(laneKey, nextLane)
        nextLane += 1
      }
      const lane = laneByRef.get(laneKey) || 0

      return {
        hash,
        shortHash,
        subject,
        author: {
          name: authorName,
          email: authorEmail
        },
        date,
        parents: parentsRaw ? parentsRaw.split(' ').filter(Boolean) : [],
        refs,
        branches: [],
        tags: refs.filter((ref) => ref.startsWith('tag: ')).map((ref) => ref.replace(/^tag:\s*/, '')),
        lane,
        color: BRANCH_COLORS[lane % BRANCH_COLORS.length] || BRANCH_COLORS[0]!
      }
    })
}

async function readBranches(cwd: string): Promise<GitBranch[]> {
  const format = '%(HEAD)%00%(refname:short)%00%(objectname)%00%(refname)'
  const output = await git(cwd, ['for-each-ref', '--sort=-committerdate', `--format=${format}`, 'refs/heads', 'refs/remotes'])
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [head = '', name = '', hash = '', ref = ''] = line.split('\0')
      return {
        name,
        hash,
        current: head === '*',
        remote: ref.startsWith('refs/remotes/'),
        color: BRANCH_COLORS[index % BRANCH_COLORS.length] || BRANCH_COLORS[0]!
      }
    })
    .filter((branch) => branch.name && !branch.name.endsWith('/HEAD'))
}

async function readStatus(cwd: string): Promise<GitStatus> {
  const output = await git(cwd, ['status', '--porcelain=v1', '-z'], { trim: false })
  const records = output.split('\0')
  const stagedFiles: GitStatusFile[] = []
  const unstagedFiles: GitStatusFile[] = []
  let untracked = 0

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (!record) continue
    const x = record[0]
    const y = record[1]
    const path = record.slice(3)
    const renamed = x === 'R' || x === 'C' || y === 'R' || y === 'C'
    const oldPath = renamed ? records[++index] : undefined

    if (x === '?' && y === '?') {
      untracked += 1
      unstagedFiles.push({ path, status: '?' })
      continue
    }
    if (x && x !== ' ') stagedFiles.push({ path, status: x, oldPath })
    if (y && y !== ' ') unstagedFiles.push({ path, status: y, oldPath })
  }

  return {
    clean: stagedFiles.length === 0 && unstagedFiles.length === 0,
    changed: new Set([...stagedFiles, ...unstagedFiles].map((file) => file.path)).size,
    staged: stagedFiles.length,
    unstaged: unstagedFiles.length,
    untracked,
    stagedFiles,
    unstagedFiles
  }
}

async function readStashes(cwd: string): Promise<GitStash[]> {
  const format = ['%gd', '%H', '%gs', '%cr'].join(FIELD_SEPARATOR)
  const output = await git(cwd, ['stash', 'list', `--format=${format}`], { trim: false }).catch(() => '')

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', hash = '', subject = '', date = ''] = line.split(FIELD_SEPARATOR)
      const match = name.match(/stash@\{(\d+)\}/)
      const message = subject.replace(/^WIP on\s+([^:]+):\s*/, '')
      const branchMatch = subject.match(/^WIP on\s+([^:]+):/)
      return {
        index: match ? Number(match[1]) : 0,
        hash,
        message,
        branch: branchMatch?.[1] || '',
        date
      }
    })
}

function parseRefs(refsRaw = '') {
  return refsRaw
    .split(',')
    .map((ref) => ref.trim())
    .filter(Boolean)
    .map((ref) => ref.replace(/^HEAD ->\s*/, ''))
}

function groupRefsByHash(branches: GitBranch[]) {
  const branchByHash = new Map<string, GitBranch[]>()
  for (const branch of branches) {
    const existing = branchByHash.get(branch.hash) || []
    existing.push(branch)
    branchByHash.set(branch.hash, existing)
  }
  return branchByHash
}

async function git(cwd: string, args: string[], options: { trim?: boolean } = {}) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8
  })
  return options.trim === false ? stdout : stdout.trim()
}
