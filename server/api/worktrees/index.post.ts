/**
 * POST /api/worktrees
 * Create a new worktree for a feature
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { WorktreeCreateRequest, WorktreeCreateResponse, Worktree } from '~/types/worktree'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'

const execAsync = promisify(exec)

function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 10)
}

async function getCurrentHead(projectPath: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectPath,
    })
    const branch = stdout.trim()
    if (branch === 'HEAD') {
      const { stdout: hash } = await execAsync('git rev-parse HEAD', {
        cwd: projectPath,
      })
      return hash.trim()
    }
    return branch
  } catch {
    return 'main'
  }
}

async function checkBranchExists(projectPath: string, branchName: string): Promise<boolean> {
  try {
    await execAsync(`git rev-parse --verify ${branchName}`, { cwd: projectPath })
    return true
  } catch {
    return false
  }
}

async function getNextFeatureNumber(projectPath: string): Promise<number> {
  try {
    // Get feature numbers from branches
    const { stdout: branchOutput } = await execAsync(
      'git branch -a --format="%(refname:short)" 2>/dev/null || echo ""',
      { cwd: projectPath }
    )

    const numbers = branchOutput
      .split('\n')
      .map(branch => {
        const match = branch.match(/^(\d{3})-/)
        return match ? parseInt(match[1], 10) : 0
      })
      .filter(n => n > 0)

    // Also check specs directory
    const specsDir = join(projectPath, 'specs')
    if (existsSync(specsDir)) {
      const { stdout: lsOutput } = await execAsync(`ls -d ${specsDir}/*/ 2>/dev/null || echo ""`)
      const specNumbers = lsOutput
        .split('\n')
        .map(dir => {
          const name = dir.split('/').filter(Boolean).pop() || ''
          const match = name.match(/^(\d{3})-/)
          return match ? parseInt(match[1], 10) : 0
        })
        .filter(n => n > 0)

      numbers.push(...specNumbers)
    }

    return numbers.length > 0 ? Math.max(...numbers) + 1 : 1
  } catch {
    return 1
  }
}

function generateBranchName(description: string, shortName?: string, number?: number): string {
  const num = String(number || 1).padStart(3, '0')

  if (shortName) {
    return `${num}-${shortName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`
  }

  // Generate from description
  const stopWords = ['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.includes(w))
    .slice(0, 4)

  return `${num}-${words.join('-')}`
}

export default defineEventHandler(async (event): Promise<WorktreeCreateResponse> => {
  const query = getQuery(event)
  const workingDirectory = (query.workingDirectory as string) || getProjectDir()

  const body = await readBody<WorktreeCreateRequest>(event)

  if (!body?.description) {
    throw createError({
      statusCode: 400,
      message: 'Description is required',
    })
  }

  logger.api.info('Creating worktree', { workingDirectory, description: body.description })

  try {
    const nextNumber = await getNextFeatureNumber(workingDirectory)
    const branchName = generateBranchName(body.description, body.shortName, nextNumber)
    const baseBranch = body.baseBranch || await getCurrentHead(workingDirectory)

    // Check if branch already exists
    const branchExists = await checkBranchExists(workingDirectory, branchName)
    if (branchExists) {
      throw createError({
        statusCode: 409,
        message: `Branch '${branchName}' already exists`,
      })
    }

    // Create branch
    await execAsync(`git branch ${branchName} ${baseBranch}`, { cwd: workingDirectory })

    // Create worktree
    const randomId = generateRandomId()
    const worktreePath = `/tmp/${branchName}-${randomId}`

    await execAsync(`git worktree add "${worktreePath}" "${branchName}"`, {
      cwd: workingDirectory,
    })

    // Get commit info
    const format = '%H|||%h|||%s|||%an|||%ar'
    const { stdout: commitOutput } = await execAsync(`git log -1 --format="${format}"`, {
      cwd: worktreePath,
    })
    const [hash, shortHash, message, author, date] = commitOutput.trim().split('|||')

    const worktree: Worktree = {
      name: branchName,
      path: worktreePath,
      branch: branchName,
      isMain: false,
      isCurrent: false,
      isLocked: false,
      status: 'clean',
      commitCount: 0,
      lastCommit: { hash, shortHash, message, author, date },
    }

    logger.api.info('Worktree created', { branchName, worktreePath })

    return {
      success: true,
      worktree,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.api.error('Failed to create worktree', { error: errorMessage })

    return {
      success: false,
      error: errorMessage,
    }
  }
})
