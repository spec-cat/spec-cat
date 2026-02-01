import type { GraphResponse, GraphQueryParams } from '~/types/git'
import {
  execGitCommand,
  isGitRepository,
  getRepositoryRoot,
  generateBranchColor,
  getCommitHistory
} from '~/server/utils/git'
import { getProjectDir } from '~/server/utils/projectDir'

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Partial<GraphQueryParams>

  try {
    // Get configured project directory
    const cwd = getProjectDir()
    
    // Validate git repository
    if (!(await isGitRepository(cwd))) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Not a valid git repository'
      })
    }

    // Parse query parameters with defaults
    const {
      limit = 300,
      offset = 0,
      branch,
      author,
      search,
      since,
      until
    } = query

    // Validate parameters
    if (limit && (limit < 1 || limit > 500)) {
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
    if (error.statusCode) {
      throw error
    }

    console.error('Git graph API error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to retrieve git graph data',
      data: { error: error.message }
    })
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