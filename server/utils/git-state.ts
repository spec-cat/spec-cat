import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'

export type PorcelainFiles = {
  untracked: string[]
  modified: string[]
  deleted: string[]
  staged: string[]
  partiallyStaged: string[]
}

export type GitRemote = {
  name: string
  url: string
}

export type GitRemoteDetail = {
  name: string
  fetchUrl: string
  pushUrl: string
}

export type GitNameStatusEntry = {
  path: string
  status: string
  oldPath?: string
}

export type GitNumstatEntry = {
  path: string
  oldPath?: string
  additions: number
  deletions: number
  binary: boolean
}

export type GitCompareFile = {
  path: string
  status: string
  oldPath?: string
  additions: number
  deletions: number
}

const execFileAsync = promisify(execFile)

export async function runGit(cwd: string, args: string[], options: { trim?: boolean } = {}) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8
  })
  return options.trim === false ? stdout : stdout.trim()
}

export function hashText(input: string) {
  return createHash('sha1').update(input).digest('hex')
}

export function countPorcelainEntries(output: string) {
  return output.split('\n').filter((line) => line.trim()).length
}

export function parsePorcelainStatus(output: string): PorcelainFiles {
  const untracked: string[] = []
  const modified: string[] = []
  const deleted: string[] = []
  const staged: string[] = []
  const partiallyStaged: string[] = []

  for (const line of output.split('\n')) {
    if (line.length < 4) continue

    const indexStatus = line[0] || ' '
    const workingStatus = line[1] || ' '
    const path = parsePorcelainPath(line.slice(3))

    if (indexStatus === '?' && workingStatus === '?') {
      untracked.push(path)
      continue
    }

    if (indexStatus !== ' ') staged.push(path)
    if (workingStatus === 'M') modified.push(path)
    if (workingStatus === 'D') deleted.push(path)
    if (indexStatus !== ' ' && workingStatus !== ' ') partiallyStaged.push(path)
  }

  return { untracked, modified, deleted, staged, partiallyStaged }
}

export function parseRemotes(output: string): GitRemote[] {
  const remotes = new Map<string, string>()

  for (const line of output.split('\n')) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/)
    if (!match) continue
    const [, name = '', url = ''] = match
    if (!remotes.has(name)) remotes.set(name, url)
  }

  return Array.from(remotes.entries()).map(([name, url]) => ({ name, url }))
}

export function parseRemoteDetails(output: string): GitRemoteDetail[] {
  const remotes = new Map<string, GitRemoteDetail>()

  for (const line of output.split('\n')) {
    const match = line.match(/^(\S+)\t(.+) \((fetch|push)\)$/)
    if (!match) continue
    const [, name = '', url = '', kind = ''] = match
    const remote = remotes.get(name) || { name, fetchUrl: '', pushUrl: '' }
    if (kind === 'fetch') remote.fetchUrl = url
    else remote.pushUrl = url
    remotes.set(name, remote)
  }

  return Array.from(remotes.values())
}

export function parseNameStatusZ(output: string): GitNameStatusEntry[] {
  const tokens = output.split('\0')
  const entries: GitNameStatusEntry[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const rawStatus = tokens[index]
    if (!rawStatus) continue
    const status = rawStatus[0] || 'M'
    const firstPath = tokens[++index] || ''

    if (status === 'R' || status === 'C') {
      const secondPath = tokens[++index] || ''
      if (secondPath) entries.push({ status, oldPath: firstPath, path: secondPath })
      continue
    }
    if (firstPath) entries.push({ status, path: firstPath })
  }

  return entries
}

export function parseNumstatZ(output: string): GitNumstatEntry[] {
  const tokens = output.split('\0')
  const entries: GitNumstatEntry[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token) continue
    const match = token.match(/^(\d+|-)\t(\d+|-)\t([\s\S]*)$/)
    if (!match) continue
    const [, added = '', deleted = '', inlinePath = ''] = match
    const binary = added === '-' || deleted === '-'
    const additions = binary ? 0 : Number(added)
    const deletions = binary ? 0 : Number(deleted)

    if (inlinePath) {
      entries.push({ path: inlinePath, additions, deletions, binary })
      continue
    }

    const oldPath = tokens[++index] || ''
    const path = tokens[++index] || ''
    if (path) entries.push({ path, oldPath, additions, deletions, binary })
  }

  return entries
}

export function mergeCompareFiles(nameStatus: GitNameStatusEntry[], numstat: GitNumstatEntry[]): GitCompareFile[] {
  const numstatByPath = new Map(numstat.map((entry) => [entry.path, entry]))

  return nameStatus.map((entry) => ({
    path: entry.path,
    status: entry.status,
    oldPath: entry.oldPath,
    additions: numstatByPath.get(entry.path)?.additions ?? 0,
    deletions: numstatByPath.get(entry.path)?.deletions ?? 0
  }))
}

function parsePorcelainPath(rawPath: string) {
  const renameIndex = rawPath.indexOf(' -> ')
  const path = renameIndex >= 0 ? rawPath.slice(renameIndex + 4) : rawPath
  return unquotePorcelainPath(path)
}

function unquotePorcelainPath(path: string) {
  if (path.length < 2 || !path.startsWith('"') || !path.endsWith('"')) return path
  return path
    .slice(1, -1)
    .replace(/\\([\\"tnr])/g, (_, escaped: string) => {
      if (escaped === 't') return '\t'
      if (escaped === 'n') return '\n'
      if (escaped === 'r') return '\r'
      return escaped
    })
}
