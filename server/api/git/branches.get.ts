import type { BranchResponse } from '~/types/git'
import {
  getBranches
} from '~/server/utils/git'
import { execGitCommand } from '~/server/utils/gitExec'
import { generateBranchColor } from '~/server/utils/gitParsers'
import { resolvePreferredBaseBranch } from '~/server/utils/baseBranch'
import { resolveWorkingDirectoryFromQuery, handleGitApiError } from '~/server/utils/gitApiHelpers'

const COMMIT_HASH_RE = /^[0-9a-f]{7,40}$/i

export interface ParsedBranchRefRow {
  headMarker: string
  refName: string
  shortName: string
  tip: string
  upstreamShort: string
  commitDateRaw: string
}

function parseBooleanQuery(value: unknown): boolean {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw === 'boolean') {
    return raw
  }
  if (typeof raw === 'string') {
    return raw.toLowerCase() === 'true'
  }
  return false
}

async function getBranchesOutput(cwd: string, refScopes: string[]): Promise<string> {
  const basePrefix = '%(HEAD)%09%(refname)%09%(refname:short)%09%(objectname)%09%(upstream:short)%09'

  // Try multiple date formats for compatibility across Git versions.
  const dateFormats = ['iso-strict', 'iso8601-strict', 'iso8601', 'unix']

  for (const format of dateFormats) {
    try {
      return await execGitCommand(
        [
          'for-each-ref',
          ...refScopes,
          `--format=${basePrefix}%(committerdate:${format})`
        ],
        cwd
      )
    } catch (error: any) {
      const message = String(error?.message ?? '')
      const isUnknownDateFormat = message.includes('unknown date format')
        || message.includes('bad date format')
        || message.includes('unknown format')
        || message.includes('unknown field name')
        || message.includes('unsupported format')

      if (!isUnknownDateFormat || format === dateFormats[dateFormats.length - 1]) {
        throw error
      }
    }
  }

  return ''
}

export function parseBranchRefRow(line: string): ParsedBranchRefRow | null {
  let [headMarker = '', refName = '', shortName = '', tip = '', upstreamShort = '', commitDateRaw = ''] = line.split('\t')

  // Defensive recovery for a shifted payload seen in preview mode where the
  // full refname column is missing and fields slide left:
  //   <HEAD>\tmain\t<hash>\tus/main\t<date>
  if (
    refName &&
    !refName.startsWith('refs/') &&
    shortName &&
    COMMIT_HASH_RE.test(shortName)
  ) {
    commitDateRaw = upstreamShort
    upstreamShort = tip
    tip = shortName
    shortName = refName
    refName = `refs/heads/${shortName}`
  }

  if (!refName || !shortName || !tip) {
    return null
  }

  return {
    headMarker,
    refName,
    shortName,
    tip,
    upstreamShort,
    commitDateRaw,
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  try {
    const includeRemote = parseBooleanQuery(query.includeRemote)
    const excludeSc = parseBooleanQuery(query.excludeSc)
    const cwd = resolveWorkingDirectoryFromQuery(event)

    // Get current branch
    let currentBranch = ''
    try {
      currentBranch = await execGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
    } catch {
      // May be in detached HEAD state
    }

    // Get all branches in one pass (avoids one git call per branch for commit date).
    const refScopes = includeRemote ? ['refs/heads', 'refs/remotes'] : ['refs/heads']
    const branches: BranchResponse['branches'] = []
    try {
      const output = await getBranchesOutput(cwd, refScopes)
      const lines = output.split('\n').filter(Boolean)

      for (const line of lines) {
        const parsedRow = parseBranchRefRow(line)
        if (!parsedRow) continue

        const { headMarker, refName, shortName, tip, upstreamShort, commitDateRaw } = parsedRow

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
          const parsedUnix = Number(commitDateRaw)
          if (Number.isFinite(parsedUnix) && /^\d+$/.test(commitDateRaw)) {
            const parsed = new Date(parsedUnix * 1000)
            if (!Number.isNaN(parsed.getTime())) {
              lastCommitDate = parsed.toISOString()
            }
          } else {
            const parsed = new Date(commitDateRaw)
            if (!Number.isNaN(parsed.getTime())) {
              lastCommitDate = parsed.toISOString()
            }
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
    } catch (bulkError) {
      console.warn('Falling back to legacy branch query due to bulk branch query failure:', bulkError)
      const legacyBranches = await getBranches(includeRemote, cwd)
      for (const branch of legacyBranches) {
        if (excludeSc && branch.name.startsWith('sc/')) {
          continue
        }
        branches.push(branch)
      }
    }

    // Preview mode checks out `sc/preview` in the main worktree. If branch
    // enumeration ever collapses to only sc/* refs in that state, keep chat
    // creation/rebase/finalize selectors usable by re-injecting the preferred
    // non-worktree local branch.
    if (excludeSc) {
      const hasSelectableLocalBranch = branches.some(branch => !branch.isRemote && !branch.name.startsWith('sc/'))
      if (!hasSelectableLocalBranch) {
        const preferredBaseBranch = await resolvePreferredBaseBranch(cwd)
        if (preferredBaseBranch && !branches.some(branch => branch.name === preferredBaseBranch && !branch.isRemote)) {
          branches.unshift({
            name: preferredBaseBranch,
            ref: `refs/heads/${preferredBaseBranch}`,
            tip: '',
            ahead: 0,
            behind: 0,
            color: generateBranchColor(preferredBaseBranch),
            isHead: preferredBaseBranch === currentBranch,
            isRemote: false,
            lastCommitDate: new Date(0).toISOString(),
          })
        }
      }
    }

    const response: BranchResponse = {
      branches,
      current: currentBranch
    }

    return response
  } catch (error: any) {
    handleGitApiError(error, 'Git branches API error', 'Failed to retrieve git branches')
  }
})
