import type { BranchResponse } from '~/types/git'
import {
  execGitCommand,
  isGitRepository,
  generateBranchColor
} from '~/server/utils/git'
import { getProjectDir } from '~/server/utils/projectDir'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  try {
    const includeRemote = query.includeRemote === 'true'
    const cwd = getProjectDir()
    
    // Validate git repository
    if (!(await isGitRepository(cwd))) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Not a valid git repository'
      })
    }

    // Get current branch
    let currentBranch = ''
    try {
      currentBranch = await execGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
    } catch {
      // May be in detached HEAD state
    }

    // Get all branches
    const args = ['branch', '-vv']
    if (includeRemote) {
      args.push('--all')
    }

    const output = await execGitCommand(args, cwd)
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
        
        // Extract upstream info from -vv output
        let upstream: any = undefined
        const upstreamMatch = lineWithoutMarker.match(/\[([^\]]+)\]/)
        if (upstreamMatch) {
          const upstreamInfo = upstreamMatch[1]
          const remoteBranchMatch = upstreamInfo.match(/^([^:]+)\/(.+?)(?:\s|$)/)
          if (remoteBranchMatch) {
            upstream = {
              remote: remoteBranchMatch[1],
              branch: remoteBranchMatch[2]
            }
          }
        }

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
          upstream,
          ahead: 0, // TODO: Calculate ahead/behind if needed
          behind: 0,
          color: generateBranchColor(cleanName),
          isHead: isHead && !isRemote,
          isRemote,
          lastCommitDate
        })
      }
    }

    const response: BranchResponse = {
      branches,
      current: currentBranch
    }

    return response
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }

    console.error('Git branches API error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to retrieve git branches',
      data: { error: error.message }
    })
  }
})