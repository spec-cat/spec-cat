import type { GraphResponse, GraphQueryParams } from '~/types/git'
import {
  getRepositoryRoot,
  getCommitHistory
} from '~/server/utils/git'
import { execGitCommand } from '~/server/utils/gitExec'
import { generateBranchColor } from '~/server/utils/gitParsers'
import { resolveWorkingDirectoryFromQuery, handleGitApiError } from '~/server/utils/gitApiHelpers'

const DEFAULT_COMMIT_LIMIT = 300
const MAX_COMMIT_LIMIT = 500

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Partial<GraphQueryParams>

  try {
    const cwd = resolveWorkingDirectoryFromQuery(event)

    // Parse query parameters with defaults
    const {
      limit = DEFAULT_COMMIT_LIMIT,
      offset = 0,
      branch,
      author,
      search,
      since,
      until
    } = query

    // Validate parameters
    if (limit && (limit < 1 || limit > MAX_COMMIT_LIMIT)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Limit must be between 1 and 500'
      })
    }

    if (offset && offset < 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Offset must be non-negative'
      })
    }

    // Get repository data
    const [commits, branches, totalCommits] = await Promise.all([
      getCommitHistory({ limit, offset, branch, author, search, since, until, cwd }),
      getBranchesFromRepo(cwd),
      getTotalCommitCount(cwd)
    ])

    // Calculate pagination
    const hasMore = offset + commits.length < totalCommits

    // Calculate layout hints
    const layoutHints = {
      totalCommits,
      maxLanes: Math.min(branches.length, 10), // Reasonable lane limit
      suggestedViewport: {
        height: Math.min(commits.length * 40, 800), // 40px per commit, max 800px
        commitsPerPage: 20
      }
    }

    const response: GraphResponse = {
      commits,
      branches,
      pagination: {
        offset,
        limit,
        total: totalCommits,
        hasMore
      },
      layout_hints: layoutHints
    }

    return response
  } catch (error: any) {
    handleGitApiError(error, 'Git graph API error', 'Failed to retrieve git graph data')
  }
})

async function getBranchesFromRepo(cwd: string) {
  const output = await execGitCommand(['branch', '-vv', '--all'], cwd)
  const lines = output.split('\n').filter(Boolean)
  
  const branches: any[] = []
  
  for (const line of lines) {
    const trimmedLine = line.trim()
    const isHead = trimmedLine.startsWith('*')
    const lineWithoutMarker = trimmedLine.replace(/^\*?\s+/, '')
    
    const parts = lineWithoutMarker.split(/\s+/)
    if (parts.length < 2) continue
    
    const [name, tip] = parts
    const isRemote = name.startsWith('remotes/')
    
    if (name !== 'HEAD' && !name.includes('->')) {
      const cleanName = isRemote ? name.replace('remotes/', '') : name
      
      // Get last commit date for this branch
      let lastCommitDate = new Date().toISOString()
      try {
        const dateOutput = await execGitCommand(['show', '-s', '--format=%ai', tip], cwd)
        lastCommitDate = new Date(dateOutput.trim()).toISOString()
      } catch {
        // Use current date as fallback
      }

      branches.push({
        name: cleanName,
        ref: isRemote ? name : `refs/heads/${name}`,
        tip,
        ahead: 0,
        behind: 0,
        color: generateBranchColor(cleanName),
        isHead: isHead && !isRemote,
        isRemote,
        lastCommitDate
      })
    }
  }
  
  return branches
}

async function getTotalCommitCount(cwd: string): Promise<number> {
  try {
    const output = await execGitCommand(['rev-list', '--all', '--count'], cwd)
    return parseInt(output.trim(), 10) || 0
  } catch {
    return 0
  }
}
