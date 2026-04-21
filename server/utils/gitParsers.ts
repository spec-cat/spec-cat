import type { GitLogCommit, GitStatusFile } from '~/types/git'
import { FileChangeStatus } from '~/types/git'

type ParsedDiffLine = {
  type: 'add' | 'delete' | 'context' | 'header'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export const MAX_DIFF_LINES = 10000

/**
 * Parse git log output into GitLogCommit objects.
 * Expected format per line: hash|shortHash|author|email|timestamp|message|parents
 */
export function parseGitLog(
  output: string,
  _branches: string[],
  _tags: string[]
): GitLogCommit[] {
  if (!output.trim()) return []

  return output.split('\n').filter(Boolean).map(line => {
    const [hash, shortHash, author, email, timestamp, message, parentHashes] = line.split('|')
    const parents = parentHashes ? parentHashes.split(' ').filter(Boolean) : []

    return {
      hash,
      shortHash,
      author,
      email,
      timestamp: parseInt(timestamp, 10),
      message,
      parents,
      branches: [],
      tags: []
    }
  })
}

/**
 * Parse `git status --porcelain` output into staged and unstaged file lists.
 * Important: do not trim the full output first, or a leading space on the
 * first line will corrupt both the status columns and the file path offset.
 */
export function parseGitStatusPorcelain(
  output: string
): { stagedFiles: GitStatusFile[]; unstagedFiles: GitStatusFile[] } {
  const stagedFiles: GitStatusFile[] = []
  const unstagedFiles: GitStatusFile[] = []

  if (!output.trim()) {
    return { stagedFiles, unstagedFiles }
  }

  const lines = output.split('\n').filter(Boolean)

  for (const line of lines) {
    if (line.length < 3) continue

    const stagingStatus = line.charAt(0)
    const workingStatus = line.charAt(1)
    const filePath = line.substring(3)

    let path = filePath
    let oldPath: string | undefined

    if (filePath.includes(' -> ')) {
      const parts = filePath.split(' -> ')
      oldPath = parts[0]
      path = parts[1]
    }

    if (stagingStatus !== ' ' && stagingStatus !== '?') {
      let status: FileChangeStatus
      if (stagingStatus === 'A') status = FileChangeStatus.Added
      else if (stagingStatus === 'D') status = FileChangeStatus.Deleted
      else if (stagingStatus === 'R') status = FileChangeStatus.Renamed
      else if (stagingStatus === 'C') status = FileChangeStatus.Copied
      else status = FileChangeStatus.Modified

      const file: GitStatusFile = {
        path,
        status,
        staged: true,
        unstaged: false,
      }
      if (oldPath) file.oldPath = oldPath
      stagedFiles.push(file)
    }

    const isUntracked = stagingStatus === '?' && workingStatus === '?'
    if (workingStatus !== ' ' || isUntracked) {
      let status: FileChangeStatus
      if (isUntracked) {
        status = FileChangeStatus.Added
      } else if (workingStatus === 'D') {
        status = FileChangeStatus.Deleted
      } else {
        status = FileChangeStatus.Modified
      }

      const file: GitStatusFile = {
        path,
        status,
        staged: false,
        unstaged: true,
      }
      if (oldPath) file.oldPath = oldPath
      unstagedFiles.push(file)
    }
  }

  return { stagedFiles, unstagedFiles }
}

/**
 * Deterministically map a branch name to a palette color for visualization.
 */
export function generateBranchColor(branchName: string): string {
  const colors = [
    '#3B82F6', // blue
    '#EF4444', // red
    '#10B981', // green
    '#F59E0B', // amber
    '#8B5CF6', // violet
    '#EC4899', // pink
    '#14B8A6', // teal
    '#F97316', // orange
    '#06B6D4', // cyan
    '#84CC16', // lime
    '#F43F5E', // rose
    '#A855F7', // purple
  ]

  let hash = 0
  for (let i = 0; i < branchName.length; i++) {
    const char = branchName.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }

  return colors[Math.abs(hash) % colors.length]
}

/**
 * Simple deterministic 32-bit hash of a string, returned as hex.
 * Used for working-tree / branch-list / stash-list identity checks.
 */
export function hashString(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash).toString(16)
}

/**
 * Parse unified diff text into structured lines with tracked line numbers.
 * Pure function — no filesystem or process I/O.
 */
export function parseUnifiedDiff(
  diffOutput: string,
  maxLines: number = MAX_DIFF_LINES
): { lines: ParsedDiffLine[]; truncated: boolean } {
  const lines: ParsedDiffLine[] = []
  let truncated = false

  if (!diffOutput.trim()) {
    return { lines, truncated }
  }

  const diffLines = diffOutput.split('\n')
  let oldLineNum = 0
  let newLineNum = 0

  for (const line of diffLines) {
    if (lines.length >= maxLines) {
      truncated = true
      break
    }

    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
      continue
    }

    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldLineNum = parseInt(match[1], 10)
        newLineNum = parseInt(match[2], 10)
      }
      lines.push({ type: 'header', content: line })
      continue
    }

    if (line.startsWith('+')) {
      lines.push({ type: 'add', content: line.substring(1), newLineNumber: newLineNum })
      newLineNum++
    } else if (line.startsWith('-')) {
      lines.push({ type: 'delete', content: line.substring(1), oldLineNumber: oldLineNum })
      oldLineNum++
    } else if (line.startsWith(' ') || line === '') {
      const content = line.startsWith(' ') ? line.substring(1) : line
      lines.push({ type: 'context', content, oldLineNumber: oldLineNum, newLineNumber: newLineNum })
      oldLineNum++
      newLineNum++
    } else if (line.startsWith('\\')) {
      continue
    }
  }

  return { lines, truncated }
}
