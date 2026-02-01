import type { RepositoryStatus } from '~/types/git'
import {
  execGitCommand,
  isGitRepository
} from '~/server/utils/git'
import { getProjectDir } from '~/server/utils/projectDir'

export default defineEventHandler(async (event) => {
  try {
    const cwd = getProjectDir()
    
    // Validate git repository
    if (!(await isGitRepository(cwd))) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Not a valid git repository'
      })
    }

    // Get repository status data in parallel
    const [currentBranch, head, status, remotes, gitDir] = await Promise.all([
      execGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], cwd).catch(() => ''),
      execGitCommand(['rev-parse', 'HEAD'], cwd).catch(() => ''),
      execGitCommand(['status', '--porcelain'], cwd).catch(() => ''),
      execGitCommand(['remote', '-v'], cwd).catch(() => ''),
      execGitCommand(['rev-parse', '--git-dir'], cwd).catch(() => '.git')
    ])

    // Parse status output
    const statusLines = status.split('\n').filter(Boolean)
    const untracked: string[] = []
    const modified: string[] = []
    const deleted: string[] = []
    const staged: string[] = []
    const partiallyStaged: string[] = []

    for (const line of statusLines) {
      if (line.length < 3) continue
      
      const indexStatus = line[0]
      const workingStatus = line[1]
      const filePath = line.substring(3)

      // Untracked files
      if (indexStatus === '?' && workingStatus === '?') {
        untracked.push(filePath)
        continue
      }

      // Staged changes (index status)
      if (indexStatus !== ' ') {
        staged.push(filePath)
      }

      // Working directory changes
      if (workingStatus === 'M') {
        modified.push(filePath)
      } else if (workingStatus === 'D') {
        deleted.push(filePath)
      }

      // Partially staged (both index and working tree have changes)
      if (indexStatus !== ' ' && workingStatus !== ' ') {
        partiallyStaged.push(filePath)
      }
    }

    // Parse remotes
    const remotesData = parseRemotes(remotes)

    const repositoryStatus: RepositoryStatus = {
      currentBranch,
      head,
      workingDirectory: {
        clean: statusLines.length === 0,
        untracked,
        modified,
        deleted
      },
      stagingArea: {
        hasChanges: staged.length > 0,
        staged,
        partiallyStaged
      },
      remotes: remotesData,
      lastUpdated: new Date().toISOString(),
      gitDir: gitDir.startsWith('/') ? gitDir : `${cwd}/${gitDir}`
    }

    return repositoryStatus
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }

    console.error('Repository status API error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to get repository status',
      data: { error: error.message }
    })
  }
})

function parseRemotes(remotesOutput: string): Array<{name: string, url: string, fetchUrl: string, pushUrl: string}> {
  const lines = remotesOutput.split('\n').filter(Boolean)
  const remoteMap = new Map<string, {fetchUrl?: string, pushUrl?: string}>()

  for (const line of lines) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/)
    if (match) {
      const [, name, url, type] = match
      if (!remoteMap.has(name)) {
        remoteMap.set(name, {})
      }
      const remote = remoteMap.get(name)!
      if (type === 'fetch') {
        remote.fetchUrl = url
      } else if (type === 'push') {
        remote.pushUrl = url
      }
    }
  }

  return Array.from(remoteMap.entries()).map(([name, urls]) => ({
    name,
    url: urls.fetchUrl || urls.pushUrl || '',
    fetchUrl: urls.fetchUrl || '',
    pushUrl: urls.pushUrl || ''
  }))
}