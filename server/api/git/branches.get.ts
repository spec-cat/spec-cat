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
    const includeRemote = (Array.isArray(query.includeRemote) ? query.includeRemote[0] : query.includeRemote) === 'true'
    const excludeSc = (Array.isArray(query.excludeSc) ? query.excludeSc[0] : query.excludeSc) === 'true'
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

    // Get all branches in one pass (avoids one git call per branch for commit date).
    const refScopes = includeRemote ? ['refs/heads', 'refs/remotes'] : ['refs/heads']
    const output = await execGitCommand(
      [
        'for-each-ref',
        ...refScopes,
        '--format=%(HEAD)%09%(refname)%09%(refname:short)%09%(objectname)%09%(upstream:short)%09%(committerdate:iso-strict)'
      ],
      cwd
    )
    const lines = output.split('\n').filter(Boolean)

    const branches: BranchResponse['branches'] = []

    for (const line of lines) {
      const [headMarker, refName, shortName, tip, upstreamShort, commitDateRaw] = line.split('\t')
      if (!refName || !shortName || !tip) {
        continue
      }

      const isRemote = refName.startsWith('refs/remotes/')

      // Skip symbolic remote HEAD refs like origin/HEAD.
      if (isRemote && shortName.endsWith('/HEAD')) {
        continue
      }

      const cleanName = shortName
      if (excludeSc && cleanName.startsWith('sc/')) {
        continue
      }

      let upstream: { remote: string; branch: string } | undefined
      if (upstreamShort) {
        const [remote, ...branchParts] = upstreamShort.split('/')
        if (remote && branchParts.length > 0) {
          upstream = {
            remote,
            branch: branchParts.join('/'),
          }
        }
      }

      let lastCommitDate = new Date().toISOString()
      if (commitDateRaw) {
        const parsed = new Date(commitDateRaw)
        if (!Number.isNaN(parsed.getTime())) {
          lastCommitDate = parsed.toISOString()
        }
      }

      branches.push({
        name: cleanName,
        ref: isRemote ? refName.replace(/^refs\//, '') : refName,
        tip,
        upstream,
        ahead: 0, // TODO: Calculate ahead/behind if needed
        behind: 0,
        color: generateBranchColor(cleanName),
        isHead: headMarker === '*' && !isRemote,
        isRemote,
        lastCommitDate,
      })
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
